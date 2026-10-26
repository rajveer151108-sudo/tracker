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
    return playerStateText & "||" & trackName & "||" & trackArtist & "||" & trackAlbum & "||" & trackDuration & "||" & trackPosition & "||" & trackArt & "||" & trackId
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
  const [state, title, artist, album, durationMs, position, artwork, id] = out.split("||");
  return {
    state,
    title,
    artist,
    album,
    durationMs: Number(durationMs),
    positionSec: Number(position),
    artwork,
    id,
  };
}

async function control(action) {
  const script = CONTROLS[action];
  if (!script) return false;
  const { error } = await runAppleScript(script);
  return !error;
}

function createSpotifyDesktop({ app, getWindow }) {
  function refocus() {
    [60, 300, 800, 1600].forEach((ms) => setTimeout(() => {
      const win = getWindow();
      if (!win || win.isDestroyed() || win.isMinimized()) return;
      if (process.platform === "darwin") app.focus({ steal: true });
      win.focus();
    }, ms));
  }

  async function playUri(uri, context) {
    if (typeof uri !== "string" || !URI_RE.test(uri)) {
      return { ok: false, error: "That isn't a Spotify link" };
    }
    const win = getWindow();
    const wasFocused = !!(win && !win.isDestroyed() && win.isFocused());
    let script = `tell application "Spotify" to play track "${uri}"`;
    if (typeof context === "string" && URI_RE.test(context)) script += ` in context "${context}"`;
    const { error, stderr } = await runAppleScript(script, 6000);
    if (wasFocused) refocus();
    return error ? { ok: false, error: (stderr || error.message).trim() } : { ok: true };
  }

  return { readSpotify, control, playUri, isSpotifyUri: (value) => URI_RE.test(String(value || "")) };
}

module.exports = { createSpotifyDesktop };
