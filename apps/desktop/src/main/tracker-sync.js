const fs = require("fs");
const path = require("path");

const MAX_QUEUE = 500;
const ALLOWED_SUPABASE_ORIGIN = "https://ypbrcfbguiqygflsdgtd.supabase.co";
const SPOTIFY_TRACK_RE = /^spotify:track:([A-Za-z0-9]{10,40})$/;

function clip(value, max) {
  return String(value || "").trim().slice(0, max);
}

function normaliseTrack(track, now = Date.now()) {
  const match = SPOTIFY_TRACK_RE.exec(String(track?.id || ""));
  const durationMs = Number(track?.durationMs);
  const positionSec = Number(track?.positionSec);
  if (!match || !Number.isFinite(durationMs) || durationMs <= 0 || !Number.isFinite(positionSec)) return null;
  return {
    key: match[1],
    trackId: match[1],
    trackName: clip(track.title, 500),
    artist: clip(track.artist, 500),
    album: clip(track.album, 500) || null,
    image: clip(track.artwork, 1000) || null,
    durationMs: Math.round(durationMs),
    positionSec: Math.max(0, positionSec),
    playedAt: new Date(now - Math.max(0, positionSec) * 1000).toISOString(),
  };
}

function hasReachedPlayThreshold(track) {
  return track.positionSec * 1000 >= Math.min(30_000, track.durationMs / 2);
}

function createTrackerSync({ app, safeStorage, getWindow }) {
  const authFile = () => path.join(app.getPath("userData"), "tracker-auth.json");
  const queueFile = () => path.join(app.getPath("userData"), "tracker-sync-queue.json");
  let auth = null;
  let queue = [];
  let observation = null;
  let flushing = false;
  let timer = null;

  function emitStatus(extra = {}) {
    const status = { connected: !!auth, queued: queue.length, ...extra };
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send("tracker-sync-status", status);
    return status;
  }

  function saveQueue() {
    try {
      fs.writeFileSync(queueFile(), JSON.stringify(queue), { mode: 0o600 });
    } catch {}
  }

  function saveAuth() {
    try {
      if (!auth) {
        fs.rmSync(authFile(), { force: true });
        return;
      }
      if (!safeStorage.isEncryptionAvailable()) return;
      const data = safeStorage.encryptString(JSON.stringify(auth)).toString("base64");
      fs.writeFileSync(authFile(), JSON.stringify({ encrypted: true, data }), { mode: 0o600 });
    } catch {}
  }

  function load() {
    try {
      const stored = JSON.parse(fs.readFileSync(authFile(), "utf8"));
      if (!stored.encrypted || !safeStorage.isEncryptionAvailable()) throw new Error("Encrypted storage unavailable");
      auth = JSON.parse(safeStorage.decryptString(Buffer.from(stored.data, "base64")));
    } catch {
      auth = null;
    }
    try {
      const storedQueue = JSON.parse(fs.readFileSync(queueFile(), "utf8"));
      queue = Array.isArray(storedQueue) ? storedQueue.slice(-MAX_QUEUE) : [];
    } catch {
      queue = [];
    }
    clearInterval(timer);
    timer = setInterval(() => flush(), 30_000);
    timer.unref?.();
    emitStatus();
    flush();
  }

  function validConnection(input) {
    if (!input || typeof input !== "object") return null;
    let origin;
    try { origin = new URL(input.supabaseUrl).origin; } catch { return null; }
    if (origin !== ALLOWED_SUPABASE_ORIGIN) return null;
    const access = clip(input.accessToken, 10000);
    const refresh = clip(input.refreshToken, 10000);
    const apiKey = clip(input.publishableKey, 1000);
    if (!access || !refresh || !apiKey || (!apiKey.startsWith("sb_publishable_") && !apiKey.startsWith("eyJ"))) return null;
    return {
      supabaseUrl: origin,
      apiKey,
      access,
      refresh,
      expiresAt: Number(input.expiresAt || 0) * 1000,
    };
  }

  async function verify(candidate) {
    const response = await fetch(`${candidate.supabaseUrl}/auth/v1/user`, {
      headers: { apikey: candidate.apiKey, Authorization: `Bearer ${candidate.access}` },
    });
    if (!response.ok) return null;
    const user = await response.json().catch(() => null);
    return typeof user?.id === "string" ? user.id : null;
  }

  async function connect(input) {
    const candidate = validConnection(input);
    if (!candidate) return emitStatus({ ok: false, error: "Tracker sent an invalid account session." });
    try {
      const userId = await verify(candidate);
      if (!userId) return emitStatus({ ok: false, error: "Tracker login could not be verified." });
      candidate.userId = userId;
      queue = queue.filter((item) => !item.userId || item.userId === userId)
        .map((item) => ({ ...item, userId }));
      auth = candidate;
      saveQueue();
      saveAuth();
      emitStatus({ ok: true });
      await flush();
      return emitStatus({ ok: true });
    } catch {
      return emitStatus({ ok: false, error: "Could not verify Tracker while offline." });
    }
  }

  function disconnect() {
    auth = null;
    observation = null;
    saveAuth();
    return emitStatus({ ok: true });
  }

  async function refreshAuth() {
    if (!auth) return false;
    if (auth.access && Date.now() < auth.expiresAt - 60_000) return true;
    try {
      const response = await fetch(`${auth.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST",
        headers: { apikey: auth.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: auth.refresh }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.access_token || !data.refresh_token) throw new Error("Refresh failed");
      auth.access = data.access_token;
      auth.refresh = data.refresh_token;
      auth.expiresAt = Date.now() + Number(data.expires_in || 3600) * 1000;
      saveAuth();
      return true;
    } catch {
      emitStatus({ error: "Open Tracker and log in again to resume live tracking." });
      return false;
    }
  }

  async function request(endpoint, options = {}) {
    if (!(await refreshAuth())) throw new Error("Not connected");
    const response = await fetch(`${auth.supabaseUrl}/rest/v1/${endpoint}`, {
      ...options,
      headers: {
        apikey: auth.apiKey,
        Authorization: `Bearer ${auth.access}`,
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    if (response.status === 401) {
      auth.expiresAt = 0;
      if (await refreshAuth()) return request(endpoint, options);
    }
    return response;
  }

  async function upload(item) {
    const row = {
      p_played_at: item.playedAt,
      p_track_id: item.trackId,
      p_track_name: item.trackName,
      p_artist_names: [item.artist],
      p_album_name: item.album,
      p_album_image: item.image,
      p_duration_ms: item.durationMs,
    };
    const response = await request("rpc/ingest_desktop_play", {
      method: "POST",
      body: JSON.stringify(row),
    });
    if (!response.ok) throw new Error(`Play upload failed (${response.status})`);
  }

  async function flush() {
    if (flushing || !auth || queue.length === 0) return;
    flushing = true;
    try {
      while (queue.length) {
        await upload(queue[0]);
        queue.shift();
        saveQueue();
        emitStatus({ synced: true });
      }
    } catch (error) {
      emitStatus({ error: String(error?.message || error) });
    } finally {
      flushing = false;
    }
  }

  function observe(rawTrack) {
    const track = normaliseTrack(rawTrack);
    if (!track) {
      observation = null;
      return;
    }
    const restarted = observation && observation.key === track.key
      && track.positionSec + 10 < observation.lastPosition;
    if (!observation || observation.key !== track.key || restarted) {
      observation = {
        key: track.key,
        startedAt: Date.parse(track.playedAt),
        lastPosition: track.positionSec,
        submitted: false,
      };
    }
    observation.lastPosition = track.positionSec;
    if (!auth || observation.submitted || !hasReachedPlayThreshold(track) || !track.trackName || !track.artist) return;
    observation.submitted = true;
    const item = { ...track, userId: auth.userId, playedAt: new Date(observation.startedAt).toISOString() };
    queue.push(item);
    if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
    saveQueue();
    emitStatus();
    flush();
  }

  return { load, connect, disconnect, observe, flush, status: () => emitStatus() };
}

module.exports = { createTrackerSync, normaliseTrack, hasReachedPlayThreshold };
