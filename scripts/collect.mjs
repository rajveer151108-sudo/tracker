// Saves your recent Spotify plays into Supabase. Runs on a schedule in GitHub Actions.

const { SPOTIFY_CLIENT_ID, SPOTIFY_REFRESH_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;

for (const [k, v] of Object.entries({ SPOTIFY_CLIENT_ID, SPOTIFY_REFRESH_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY })) {
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

async function getAccessToken() {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: SPOTIFY_REFRESH_TOKEN,
      client_id: SPOTIFY_CLIENT_ID,
    }),
  });
  if (!res.ok) throw new Error(`Spotify token refresh failed (${res.status}): ${await res.text()}`);
  return (await res.json()).access_token;
}

async function spotify(token, path) {
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Spotify ${path} failed (${res.status}): ${await res.text()}`);
  return res.json();
}

async function supabase(path, { prefer, body }) {
  const res = await fetch(`${base}/rest/v1/${path}`, {
    method: "POST",
    headers: { ...sbHeaders, Prefer: prefer },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Supabase ${path} failed (${res.status}): ${await res.text()}`);
  return res.json();
}

const token = await getAccessToken();
const me = await spotify(token, "/me");

// Make sure this account has a profile row, and get its id
const [profile] = await supabase("profiles?on_conflict=spotify_id", {
  prefer: "resolution=merge-duplicates,return=representation",
  body: [{ spotify_id: me.id, display_name: me.display_name ?? me.id }],
});

const recent = await spotify(token, "/me/player/recently-played?limit=50");
const items = recent.items.filter((i) => i.track);
items.sort((a, b) => new Date(a.played_at) - new Date(b.played_at)); // oldest first

// Skip filter: a play counts unless the gap since the previous play was shorter than
// min(30s, half the song). Pauses make the real listen time shorter than the gap, so this
// only catches clear restarts and quick skips. Raw rows are always kept.
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

if (rows.length === 0) {
  console.log("No recent plays returned.");
} else {
  const inserted = await supabase("plays?on_conflict=profile_id,played_at,track_name", {
    prefer: "resolution=ignore-duplicates,return=representation",
    body: rows,
  });
  console.log(`Checked ${rows.length} plays, saved ${inserted.length} new.`);
}
