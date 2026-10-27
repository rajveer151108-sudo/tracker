const fs = require("fs");
const path = require("path");
const http = require("http");
const crypto = require("crypto");
const { findCachedSpotifyCanvas, fetchSpotifyCanvas } = require("./spotify-canvas");

const CLIENT_ID = "6b5feb739f1540f58d5a82acf5ebf724";
const PORT = 8888;
const REDIRECT_URI = `http://127.0.0.1:${PORT}/callback`;
const SCOPES = [
  "playlist-read-private",
  "playlist-read-collaborative",
  "user-library-read",
  "user-read-recently-played",
  "user-read-playback-state",
].join(" ");

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

  async function api(requestPath) {
    if (typeof requestPath !== "string" || !ALLOWED_PATHS.some((pattern) => pattern.test(requestPath))) {
      return { ok: false, status: 0, error: "Blocked request" };
    }
    try {
      const token = await getToken();
      if (!token) return { ok: false, status: 401, error: "Not connected" };
      const response = await fetch(`https://api.spotify.com/v1${requestPath}`, {
        headers: { Authorization: `Bearer ${token}` },
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
    const token = await getToken();
    return fetchSpotifyCanvas(trackUri, token);
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

  return { loadAuth, login, logout, status: () => ({ connected: !!auth }), api, canvas, loadHistory, addHistory };
}

module.exports = { createSpotifyLibrary };
