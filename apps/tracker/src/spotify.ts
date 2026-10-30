// Spotify login using Authorization Code + PKCE (no client secret in the browser).

const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string;

// Must match a Redirect URI in your Spotify app exactly (including trailing slash).
export const REDIRECT_URI = window.location.origin + window.location.pathname;

const SCOPES = [
  "user-read-private",
  "user-read-email",
  "user-read-recently-played",
  "user-top-read",
  "user-library-read",
  "user-read-playback-state",
  "user-modify-playback-state",
  "streaming",
].join(" ");

const AUTH_URL = "https://accounts.spotify.com/authorize";
const TOKEN_URL = "https://accounts.spotify.com/api/token";
const API = "https://api.spotify.com/v1";

const K = {
  verifier: "sp_verifier",
  access: "sp_access",
  refresh: "sp_refresh",
  expires: "sp_expires",
};

function randomString(len: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

async function sha256Base64Url(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  let str = "";
  new Uint8Array(digest).forEach((b) => (str += String.fromCharCode(b)));
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function login(): Promise<void> {
  if (!CLIENT_ID) throw new Error("Missing VITE_SPOTIFY_CLIENT_ID");
  const verifier = randomString(64);
  sessionStorage.setItem(K.verifier, verifier);
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge_method: "S256",
    code_challenge: await sha256Base64Url(verifier),
  });
  window.location.href = `${AUTH_URL}?${params}`;
}

function saveTokens(t: { access_token: string; refresh_token?: string; expires_in: number }) {
  localStorage.setItem(K.access, t.access_token);
  if (t.refresh_token) localStorage.setItem(K.refresh, t.refresh_token);
  localStorage.setItem(K.expires, String(Date.now() + t.expires_in * 1000));
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CLIENT_ID, ...body }),
  });
  if (!res.ok) throw new Error(`Spotify token error (${res.status})`);
  saveTokens(await res.json());
}

// Call once on page load: finishes the login if Spotify just redirected back.
export async function handleCallback(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const error = params.get("error");
  const code = params.get("code");
  if (!code && !error) return;
  // Clean the URL either way
  window.history.replaceState({}, "", window.location.pathname);
  if (error) throw new Error(`Spotify login failed: ${error}`);
  const verifier = sessionStorage.getItem(K.verifier);
  if (!verifier) throw new Error("Login session expired. Please try again.");
  await tokenRequest({
    grant_type: "authorization_code",
    code: code!,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
  });
  sessionStorage.removeItem(K.verifier);
}

export async function getAccessToken(): Promise<string | null> {
  const access = localStorage.getItem(K.access);
  if (!access) return null;
  const expires = Number(localStorage.getItem(K.expires) ?? 0);
  if (Date.now() < expires - 60_000) return access;
  const refresh = localStorage.getItem(K.refresh);
  if (!refresh) return null;
  try {
    await tokenRequest({ grant_type: "refresh_token", refresh_token: refresh });
    return localStorage.getItem(K.access);
  } catch {
    logout();
    return null;
  }
}

export function logout(): void {
  Object.values(K).forEach((k) => {
    localStorage.removeItem(k);
    sessionStorage.removeItem(k);
  });
}

export async function api<T>(path: string): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new Error("Not logged in");
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 429) throw new Error("Spotify is rate limiting requests. Try again soon.");
  if (!res.ok) throw new Error(`Spotify API error (${res.status})`);
  return res.json();
}

export interface SpotifyUser {
  id: string;
  display_name: string | null;
  images: { url: string }[];
}

export interface RecentItem {
  played_at: string;
  track: {
    id: string;
    name: string;
    artists: { name: string }[];
    album: { name: string; images: { url: string }[] };
  };
}

export const getMe = () => api<SpotifyUser>("/me");
export const getRecent = (limit = 15) =>
  api<{ items: RecentItem[] }>(`/me/player/recently-played?limit=${limit}`);
