const { execFile } = require("child_process");

const NOW_PLAYING_SCRIPT = `
if application "Spotify" is running then
  tell application "Spotify"
    if player state is stopped then return "stopped"
    set playerStateText to player state as string
    set theTrack to current track
    set trackName to name of theTrack
    set trackArtist to artist of theTrack
    set trackAlbum to album of theTrack
    set trackDuration to duration of theTrack
    set trackPosition to player position
    set trackArt to artwork url of theTrack
    set trackId to id of theTrack
    set trackVolume to sound volume
    return playerStateText & "||" & trackName & "||" & trackArtist & "||" & trackAlbum & "||" & trackDuration & "||" & trackPosition & "||" & trackArt & "||" & trackId & "||" & trackVolume
  end tell
else
  return "closed"
end if
`;

const CONTROLS = {
  playpause: 'tell application "Spotify" to playpause',
  next: 'tell application "Spotify" to next track',
  previous: 'tell application "Spotify" to previous track',
};

const URI_RE = /^spotify:(track|album|playlist|artist|episode|show):[A-Za-z0-9]{10,40}$/;

function runAppleScript(script, timeout = 4000) {
  return new Promise((resolve) => {
    execFile("osascript", ["-e", script], { timeout }, (error, stdout, stderr) => {
      resolve({ error, stdout: stdout || "", stderr: stderr || "" });
    });
  });
}

async function readSpotify() {
  const { error, stdout, stderr } = await runAppleScript(NOW_PLAYING_SCRIPT);
  if (error) return { state: "error", message: (stderr || error.message).trim() };
  const out = stdout.trim();
  if (out === "closed" || out === "stopped") return { state: out };
  const [state, title, artist, album, durationMs, position, artwork, id, volume] = out.split("||");
  return {
    state,
    title,
    artist,
    album,
    durationMs: Number(durationMs),
    positionSec: Number(position),
    artwork,
    id,
    uri: id,
    volume: Number(volume),
  };
}

async function control(action) {
  const script = CONTROLS[action];
  if (!script) return false;
  const { error } = await runAppleScript(script);
  return !error;
}

async function seek(positionSec) {
  const seconds = Number(positionSec);
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 86400) {
    return { ok: false, error: "Invalid seek position" };
  }
  const { error, stderr } = await runAppleScript(
    `tell application "Spotify" to set player position to ${seconds.toFixed(3)}`
  );
  return error
    ? { ok: false, error: (stderr || error.message || "Could not seek").trim() }
    : { ok: true, positionSec: seconds };
}

async function setVolume(volume) {
  const value = Math.round(Number(volume));
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    return { ok: false, error: "Volume must be between 0 and 100" };
  }
  const { error, stderr } = await runAppleScript(
    `tell application "Spotify" to set sound volume to ${value}`
  );
  return error
    ? { ok: false, error: (stderr || error.message || "Could not change volume").trim() }
    : { ok: true, volume: value };
}

function createSpotifyDesktop({ app, getWindow }) {
  function restoreAfterglowFocus(win) {
    if (!win || win.isDestroyed() || win.isMinimized()) return;
    if (process.platform === "darwin") app.focus({ steal: true });
    win.show();
    win.focus();
  }

  async function playUri(uri, context) {
    if (typeof uri !== "string" || !URI_RE.test(uri)) {
      return { ok: false, error: "That isn't a Spotify link" };
    }
    const win = getWindow();
    let command = `play track "${uri}"`;
    if (typeof context === "string" && URI_RE.test(context)) command += ` in context "${context}"`;
    const { error, stderr } = await runAppleScript(`tell application "Spotify" to ${command}`, 6000);
    restoreAfterglowFocus(win);
    // Keep the foreground command as short as possible, then correct Spotify's
    // occasional resume position without giving its window another chance to
    // take focus.
    if (!error) {
      setTimeout(() => runAppleScript('tell application "Spotify" to set player position to 0'), 80);
      // Spotify occasionally raises its window a beat after acknowledging the
      // command. One delayed reclaim prevents those intermittent escapes
      // without the repeated focus bouncing the older implementation caused.
      setTimeout(() => restoreAfterglowFocus(win), 140);
    }
    return error ? { ok: false, error: (stderr || error.message).trim() } : { ok: true };
  }

  return { readSpotify, control, seek, setVolume, playUri, isSpotifyUri: (value) => URI_RE.test(String(value || "")) };
}

module.exports = { createSpotifyDesktop };
