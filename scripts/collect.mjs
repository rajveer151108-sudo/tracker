// Saves recent Spotify plays for every connected account into Supabase.

const {
  SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN,
  SUPABASE_URL, SUPABASE_SERVICE_KEY,
} = process.env;

for (const [k, v] of Object.entries({ SPOTIFY_CLIENT_ID, SUPABASE_URL, SUPABASE_SERVICE_KEY })) {
  if (!v) {
    console.error(`Missing ${k}`);
    process.exit(1);
  }
}

const base = SUPABASE_URL.replace(/\/+$/, "");
const sbHeaders = {
  apikey: SUPABASE_SERVICE_KEY,
  "Content-Type": "application/json",
  // Older-style keys are JWTs and also go in Authorization; new "secret" keys do not.
  ...(SUPABASE_SERVICE_KEY.startsWith("eyJ") ? { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } : {}),
};

async function sb(method, path, { prefer, body } = {}) {
  const res = await fetch(`${base}/rest/v1/${path}`, {
    method,
    headers: { ...sbHeaders, ...(prefer ? { Prefer: prefer } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Supabase ${path} failed (${res.status}): ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function refreshAccess(refreshToken, useSecret) {
  const headers = { "Content-Type": "application/x-www-form-urlencoded" };
  const params = { grant_type: "refresh_token", refresh_token: refreshToken };
  if (useSecret) {
    headers.Authorization =
      "Basic " + Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString("base64");
  } else {
    params.client_id = SPOTIFY_CLIENT_ID;
  }
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers,
    body: new URLSearchParams(params),
  });
  if (!res.ok) throw new Error(`Spotify token refresh failed (${res.status}): ${await res.text()}`);
  return res.json();
}

async function spotify(token, path) {
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Spotify ${path} failed (${res.status}): ${await res.text()}`);
  return res.json();
}

async function collect(account) {
  const t = await refreshAccess(account.refreshToken, account.useSecret);
  // Spotify sometimes hands back a new refresh token; keep the saved one current.
  if (t.refresh_token && account.userId) {
    await sb("PATCH", `spotify_tokens?user_id=eq.${account.userId}`, {
      body: { refresh_token: t.refresh_token, updated_at: new Date().toISOString() },
    });
  }

  const me = await spotify(t.access_token, "/me");
  const profileRow = { spotify_id: me.id, display_name: me.display_name ?? me.id };
  if (account.userId) profileRow.user_id = account.userId;
  const [profile] = await sb("POST", "profiles?on_conflict=spotify_id", {
    prefer: "resolution=merge-duplicates,return=representation",
    body: [profileRow],
  });

  const recent = await spotify(t.access_token, "/me/player/recently-played?limit=50");
  const items = recent.items.filter((i) => i.track);
  items.sort((a, b) => new Date(a.played_at) - new Date(b.played_at)); // oldest first

  // Skip filter: a play counts unless the gap since the previous play was shorter than
  // min(30s, half the song). Raw rows are always kept.
  const rows = items.map((it, idx) => {
    const duration = it.track.duration_ms ?? 0;
    const needed = Math.min(30000, duration / 2);
    let counted = true;
    if (idx > 0) {
      const gap = new Date(it.played_at) - new Date(items[idx - 1].played_at);
      if (gap < needed) counted = false;
    }
    return {
      profile_id: profile.id,
      played_at: it.played_at,
      source: "spotify",
      track_id: it.track.id,
      track_name: it.track.name,
      artist_names: it.track.artists.map((a) => a.name),
      album_name: it.track.album?.name ?? null,
      album_image: it.track.album?.images?.[0]?.url ?? null,
      duration_ms: it.track.duration_ms ?? null,
      counted,
    };
  });

  let saved = 0;
  if (rows.length > 0) {
    const inserted = await sb("POST", "plays?on_conflict=profile_id,played_at,track_name", {
      prefer: "resolution=ignore-duplicates,return=representation",
      body: rows,
    });
    saved = inserted.length;
  }
  console.log(`${profileRow.display_name}: checked ${rows.length}, saved ${saved} new.`);
}

// Everyone who logged in on the site, plus the old single-account token if it is still set.
const accounts = [];
if (SPOTIFY_CLIENT_SECRET) {
  try {
    const tokens = await sb("GET", "spotify_tokens?select=user_id,refresh_token");
    for (const t of tokens ?? []) {
      accounts.push({ userId: t.user_id, refreshToken: t.refresh_token, useSecret: true });
    }
  } catch (e) {
    console.error(`Could not read connected accounts: ${e.message}`);
  }
} else {
  console.log("SPOTIFY_CLIENT_SECRET is not set, skipping connected accounts.");
}
if (SPOTIFY_REFRESH_TOKEN) {
  accounts.push({ userId: null, refreshToken: SPOTIFY_REFRESH_TOKEN, useSecret: false });
}

if (accounts.length === 0) {
  console.error("No accounts to collect.");
  process.exit(1);
}

let failed = 0;
for (const account of accounts) {
  try {
    await collect(account);
  } catch (e) {
    failed++;
    console.error(e.message);
  }
}
process.exit(failed ? 1 : 0);
