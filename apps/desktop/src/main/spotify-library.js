const fs = require("fs");
const path = require("path");
const http = require("http");
const crypto = require("crypto");
const { findCachedSpotifyCanvas, materializeSpotifyStreamCanvas, fetchSpotifyCanvas } = require("./spotify-canvas");

const CLIENT_ID = "6b5feb739f1540f58d5a82acf5ebf724";
const PORT = 8888;
const REDIRECT_URI = `http://127.0.0.1:${PORT}/callback`;
const SCOPES = [
  "playlist-read-private",
  "playlist-read-collaborative",
  "user-library-read",
  "user-read-recently-played",
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-library-modify",
  "playlist-modify-private",
  "playlist-modify-public",
].join(" ");
const WRITE_SCOPES = ["user-modify-playback-state", "user-library-modify", "playlist-modify-private", "playlist-modify-public"];

const ALLOWED_PATHS = [
  /^\/me(\?|$)/,
  /^\/me\/playlists(\?|$)/,
  /^\/me\/tracks(\?|$)/,
  /^\/me\/player\/recently-played(\?|$)/,
  /^\/me\/player\/queue(\?|$)/,
  /^\/search\?/,
  /^\/playlists\/[A-Za-z0-9]+\/(items|tracks)(\?|$)/,
];

const base64Url = (buffer) => buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const PLAYLIST_ID_RE = /^[A-Za-z0-9]{10,40}$/;

function parsePlaylistEmbed(html, expectedId, isSpotifyUri) {
  if (typeof html !== "string" || !PLAYLIST_ID_RE.test(String(expectedId || ""))) return null;
  const marker = '<script id="__NEXT_DATA__" type="application/json">';
  const start = html.indexOf(marker);
  if (start < 0) return null;
  const end = html.indexOf("</script>", start + marker.length);
  if (end < 0) return null;
  try {
    const entity = JSON.parse(html.slice(start + marker.length, end))?.props?.pageProps?.state?.data?.entity;
    if (entity?.type !== "playlist" || entity.id !== expectedId || !Array.isArray(entity.trackList)) return null;
    const tracks = entity.trackList.flatMap((track) => {
      if (track?.entityType !== "track" || track.isPlayable === false || !isSpotifyUri(track.uri)) return [];
      return [{
        uri: track.uri,
        title: String(track.title || "Unknown track").slice(0, 300),
        artist: String(track.subtitle || "Unknown artist").replace(/\u00a0/g, " ").slice(0, 300),
        durationMs: Number(track.duration) || 0,
      }];
    });
    return { id: entity.id, uri: entity.uri, title: entity.title || entity.name || "Playlist", tracks };
  } catch {
    return null;
  }
}

function normaliseApiRequest(input, isSpotifyUri) {
  const request = typeof input === "string" ? { path: input } : input;
  const requestPath = request?.path;
  const method = String(request?.method || "GET").toUpperCase();
  if (typeof requestPath !== "string" || !requestPath.startsWith("/") || requestPath.startsWith("//")) return null;
  if (method === "GET" && ALLOWED_PATHS.some((pattern) => pattern.test(requestPath))) return { path: requestPath, method, body: null };
  const parsed = new URL(requestPath, "https://api.spotify.com");
  if (method === "POST" && parsed.pathname === "/me/player/queue") {
    return isSpotifyUri(parsed.searchParams.get("uri")) ? { path: requestPath, method, body: null } : null;
  }
  if (method === "PUT" && parsed.pathname === "/me/library") {
    const uris = String(parsed.searchParams.get("uris") || "").split(",").filter(Boolean);
    return uris.length > 0 && uris.length <= 40 && uris.every(isSpotifyUri) ? { path: requestPath, method, body: null } : null;
  }
  if (method === "PUT" && parsed.pathname === "/me/player/play") {
    const body = request?.body || {};
    const validUris = Array.isArray(body.uris) && body.uris.length > 0 && body.uris.length <= 100 && body.uris.every(isSpotifyUri);
    const validContext = isSpotifyUri(body.context_uri) && (!body.offset?.uri || isSpotifyUri(body.offset.uri));
    if (!validUris && !validContext) return null;
    return { path: requestPath, method, body: validContext ? { context_uri: body.context_uri, offset: body.offset } : { uris: body.uris } };
  }
  if (method === "PUT" && parsed.pathname === "/me/player/shuffle") {
    const state = parsed.searchParams.get("state");
    return state === "true" || state === "false" ? { path: requestPath, method, body: null } : null;
  }
  const playlist = parsed.pathname.match(/^\/playlists\/([A-Za-z0-9]+)\/items$/);
  if (method === "POST" && playlist) {
    const uris = request?.body?.uris;
    if (!Array.isArray(uris) || !uris.length || uris.length > 100 || !uris.every(isSpotifyUri)) return null;
    return { path: requestPath, method, body: { uris } };
  }
  return null;
}

function createSpotifyLibrary({ app, safeStorage, shell, isSpotifyUri }) {
  const authFile = () => path.join(app.getPath("userData"), "spotify-auth.json");
  const historyFile = () => path.join(app.getPath("userData"), "history.json");
  let auth = null;
  let history = null;

  function saveAuth() {
    try {
      if (!auth) {
        fs.rmSync(authFile(), { force: true });
        return;
      }
      const json = JSON.stringify(auth);
      const encrypted = safeStorage.isEncryptionAvailable();
      const data = encrypted ? safeStorage.encryptString(json).toString("base64") : Buffer.from(json).toString("base64");
      fs.writeFileSync(authFile(), JSON.stringify({ encrypted, data }), { mode: 0o600 });
    } catch {
      // Login state remains available in memory for this session.
    }
  }

  function loadAuth() {
    try {
      const stored = JSON.parse(fs.readFileSync(authFile(), "utf8"));
      const raw = Buffer.from(stored.data, "base64");
      const encrypted = stored.encrypted ?? stored.enc;
      auth = JSON.parse(encrypted ? safeStorage.decryptString(raw) : raw.toString("utf8"));
    } catch {
      auth = null;
    }
  }

  async function tokenRequest(params) {
    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: CLIENT_ID, ...params }).toString(),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error_description || data.error || `HTTP ${response.status}`);
    return {
      access: data.access_token,
      refresh: data.refresh_token || auth?.refresh || null,
      scope: data.scope || auth?.scope || "",
      expiresAt: Date.now() + Math.max(60, (data.expires_in || 3600) - 30) * 1000,
    };
  }

  async function getToken() {
    if (!auth) return null;
    if (Date.now() < auth.expiresAt) return auth.access;
    try {
      auth = await tokenRequest({ grant_type: "refresh_token", refresh_token: auth.refresh });
      saveAuth();
      return auth.access;
    } catch {
      auth = null;
      saveAuth();
      return null;
    }
  }

  function login() {
    return new Promise((resolve) => {
      const verifier = base64Url(crypto.randomBytes(64));
      const challenge = base64Url(crypto.createHash("sha256").update(verifier).digest());
      const state = base64Url(crypto.randomBytes(16));
      let done = false;
      let timer = null;
      let server = null;
      const finish = (result) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try { server.close(); } catch {}
        resolve(result);
      };
      const page = (message) => `<html><body style="font-family:-apple-system,sans-serif;background:#0b0b0f;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><h2>${message}</h2></body></html>`;

      server = http.createServer(async (request, response) => {
        const url = new URL(request.url, `http://127.0.0.1:${PORT}`);
        if (url.pathname !== "/callback") {
          response.writeHead(404);
          response.end();
          return;
        }
        const code = url.searchParams.get("code");
        if (url.searchParams.get("state") !== state || !code) {
          response.writeHead(400, { "Content-Type": "text/html" });
          response.end(page("Login did not complete. You can close this tab."));
          finish({ ok: false, error: url.searchParams.get("error") || "Login was cancelled." });
          return;
        }
        try {
          auth = await tokenRequest({
            grant_type: "authorization_code",
            code,
            redirect_uri: REDIRECT_URI,
            code_verifier: verifier,
          });
          saveAuth();
          response.writeHead(200, { "Content-Type": "text/html" });
          response.end(page("Connected. You can close this tab and go back to the app."));
          finish({ ok: true });
        } catch (error) {
          response.writeHead(500, { "Content-Type": "text/html" });
          response.end(page("Something went wrong. You can close this tab."));
          finish({ ok: false, error: error.message });
        }
      });
      server.on("error", (error) => finish({
        ok: false,
        error: error.code === "EADDRINUSE" ? `Port ${PORT} is busy. Close whatever uses it and try again.` : String(error.message),
      }));
      timer = setTimeout(() => finish({ ok: false, error: "Timed out waiting for the Spotify login." }), 180000);
      server.listen(PORT, "127.0.0.1", () => {
        const query = new URLSearchParams({
          client_id: CLIENT_ID,
          response_type: "code",
          redirect_uri: REDIRECT_URI,
          scope: SCOPES,
          code_challenge_method: "S256",
          code_challenge: challenge,
          state,
        });
        shell.openExternal(`https://accounts.spotify.com/authorize?${query}`);
      });
    });
  }

  async function api(input) {
    const request = normaliseApiRequest(input, isSpotifyUri);
    if (!request) {
      return { ok: false, status: 0, error: "Blocked request" };
    }
    try {
      const token = await getToken();
      if (!token) return { ok: false, status: 401, error: "Not connected" };
      const response = await fetch(`https://api.spotify.com/v1${request.path}`, {
        method: request.method,
        headers: { Authorization: `Bearer ${token}`, ...(request.body ? { "Content-Type": "application/json" } : {}) },
        ...(request.body ? { body: JSON.stringify(request.body) } : {}),
      });
      const data = await response.json().catch(() => null);
      const error = response.ok ? null : data?.error?.message || data?.error || `HTTP ${response.status}`;
      return { ok: response.ok, status: response.status, data, error: error && String(error) };
    } catch (error) {
      return { ok: false, status: 0, error: String(error?.message || error) };
    }
  }

  async function canvas(trackUri) {
    const cacheRoot = path.join(app.getPath("home"), "Library", "Application Support", "Spotify", "PersistentCache", "Users");
    const cached = findCachedSpotifyCanvas(trackUri, cacheRoot);
    if (cached) return { ok: true, url: cached, source: "spotify-cache" };
    const browserRoot = path.join(app.getPath("home"), "Library", "Caches", "com.spotify.client", "Browser", "Cache", "Cache_Data");
    const local = await materializeSpotifyStreamCanvas(trackUri, browserRoot, path.join(app.getPath("userData"), "canvas-cache"));
    if (local) return { ok: true, url: local, source: "spotify-stream-cache" };
    const token = await getToken();
    return fetchSpotifyCanvas(trackUri, token);
  }

  async function publicPlaylist(playlistId) {
    if (!PLAYLIST_ID_RE.test(String(playlistId || ""))) return { ok: false, error: "Invalid playlist" };
    try {
      const response = await fetch(`https://open.spotify.com/embed/playlist/${playlistId}`, {
        headers: { Accept: "text/html" },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) return { ok: false, status: response.status, error: `Spotify embed returned HTTP ${response.status}` };
      const html = await response.text();
      if (html.length > 8000000) return { ok: false, error: "Spotify playlist response was too large" };
      const data = parsePlaylistEmbed(html, playlistId, isSpotifyUri);
      return data?.tracks?.length ? { ok: true, data } : { ok: false, error: "Spotify did not expose playable songs for this playlist" };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  }

  function loadHistory() {
    if (history) return history;
    try {
      history = JSON.parse(fs.readFileSync(historyFile(), "utf8"));
      if (!Array.isArray(history)) history = [];
    } catch {
      history = [];
    }
    return history;
  }

  function addHistory(track) {
    const clip = (value, length) => String(value || "").slice(0, length);
    if (!track || !isSpotifyUri(track.uri)) return;
    const list = loadHistory();
    if (list[0]?.uri === track.uri) return;
    list.unshift({
      uri: track.uri,
      name: clip(track.name, 200),
      artist: clip(track.artist, 200),
      album: clip(track.album, 200),
      img: clip(track.img, 400),
      at: Date.now(),
    });
    if (list.length > 300) list.length = 300;
    try { fs.writeFileSync(historyFile(), JSON.stringify(list)); } catch {}
  }

  function logout() {
    auth = null;
    saveAuth();
    return true;
  }

  return { loadAuth, login, logout, status: () => {
    const granted = new Set(String(auth?.scope || "").split(/\s+/).filter(Boolean));
    return { connected: !!auth, writeAccess: !!auth && WRITE_SCOPES.every((scope) => granted.has(scope)) };
  }, api, canvas, publicPlaylist, loadHistory, addHistory };
}

module.exports = { createSpotifyLibrary, normaliseApiRequest, parsePlaylistEmbed };
