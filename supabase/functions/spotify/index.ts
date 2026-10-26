import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing server secret ${name}`);
  return value;
}

async function spotifyFetch(path: string, accessToken: string): Promise<any> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(`https://api.spotify.com/v1${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.ok) return response.json();
    if (response.status === 429 && attempt === 0) {
      const retrySeconds = Math.min(Number(response.headers.get("retry-after") ?? 1), 5);
      await new Promise((resolve) => setTimeout(resolve, retrySeconds * 1000));
      continue;
    }
    throw new HttpError(response.status, `Spotify request failed (${response.status})`);
  }
}

async function refreshSpotifyToken(refreshToken: string) {
  const credentials = btoa(`${required("SPOTIFY_CLIENT_ID")}:${required("SPOTIFY_CLIENT_SECRET")}`);
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new HttpError(response.status, `Spotify authorization expired (${response.status}): ${detail.slice(0, 160)}`);
  }
  return response.json() as Promise<{ access_token: string; expires_in: number; refresh_token?: string }>;
}

async function removeUserStorage(admin: any, userId: string) {
  const bucket = admin.storage.from("own-files");
  const files: string[] = [];
  async function walk(prefix: string) {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await bucket.list(prefix, { limit: 1000, offset });
      if (error) throw error;
      const entries = data ?? [];
      for (const entry of entries) {
        const fullPath = `${prefix}/${entry.name}`;
        if (entry.id) files.push(fullPath);
        else await walk(fullPath);
      }
      if (entries.length < 1000) break;
    }
  }
  await walk(userId);
  for (let index = 0; index < files.length; index += 100) {
    const { error } = await bucket.remove(files.slice(index, index + 100));
    if (error) throw error;
  }
  return files.length;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = required("SUPABASE_URL");
    const anonKey = required("SUPABASE_ANON_KEY");
    const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
    const authorization = request.headers.get("Authorization");
    if (!authorization) throw new HttpError(401, "Log in with Spotify first");

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) throw new HttpError(401, "Your login has expired");

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const body = await request.json().catch(() => ({}));
    const action = typeof body?.action === "string" ? body.action : "";

    if (action === "connect") {
      const refreshToken = typeof body.refresh_token === "string" ? body.refresh_token.trim() : "";
      if (!refreshToken) throw new HttpError(400, "Spotify did not return a tracking permission; log out and reconnect");
      const { error } = await admin.from("spotify_tokens").upsert({
        user_id: user.id,
        refresh_token: refreshToken,
        updated_at: new Date().toISOString(),
        last_error: null,
      });
      if (error) throw error;
      return json({ connected: true });
    }

    if (action === "disconnect") {
      const { error } = await admin.from("spotify_tokens").delete().eq("user_id", user.id);
      if (error) throw error;
      return json({ connected: false });
    }

    if (action === "status") {
      const { data, error } = await admin.from("spotify_tokens")
        .select("last_synced_at, last_error")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return json({
        connected: !!data,
        last_synced_at: data?.last_synced_at ?? null,
        healthy: !data?.last_error,
      });
    }

    if (action === "delete_history") {
      const { data: profile, error: profileError } = await admin.from("profiles")
        .select("id").eq("user_id", user.id).maybeSingle();
      if (profileError) throw profileError;
      if (profile?.id) {
        const { error } = await admin.from("plays").delete().eq("profile_id", profile.id);
        if (error) throw error;
      }
      return json({ deleted: true });
    }

    if (action === "delete_account") {
      const removedFiles = await removeUserStorage(admin, user.id);
      const { error } = await admin.auth.admin.deleteUser(user.id);
      if (error) throw error;
      return json({ deleted: true, removed_files: removedFiles });
    }

    if (action !== "token" && action !== "sync") throw new HttpError(400, "Unknown Spotify action");

    const { data: saved, error: savedError } = await admin
      .from("spotify_tokens")
      .select("refresh_token, last_synced_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (savedError) throw savedError;
    if (!saved?.refresh_token) throw new HttpError(409, "Reconnect Spotify to enable tracking");
    if (action === "sync" && saved.last_synced_at) {
      const elapsed = Date.now() - Date.parse(saved.last_synced_at);
      if (Number.isFinite(elapsed) && elapsed >= 0 && elapsed < 45_000) {
        return json({ checked: 0, saved: 0, skipped: true });
      }
    }

    let refreshed;
    try {
      refreshed = await refreshSpotifyToken(saved.refresh_token);
    } catch (error) {
      await admin.from("spotify_tokens").update({
        last_error: error instanceof Error ? error.message : "Spotify authorization failed",
        updated_at: new Date().toISOString(),
      }).eq("user_id", user.id);
      throw error;
    }

    if (refreshed.refresh_token) {
      const { error } = await admin.from("spotify_tokens").update({
        refresh_token: refreshed.refresh_token,
        updated_at: new Date().toISOString(),
        last_error: null,
      }).eq("user_id", user.id);
      if (error) throw error;
    }

    if (action === "token") {
      return json({ access_token: refreshed.access_token, expires_in: refreshed.expires_in });
    }

    const [me, recent] = await Promise.all([
      spotifyFetch("/me", refreshed.access_token),
      spotifyFetch("/me/player/recently-played?limit=50", refreshed.access_token),
    ]);

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .upsert({
        user_id: user.id,
        spotify_id: me.id,
        display_name: me.display_name ?? me.id,
      }, { onConflict: "user_id" })
      .select("id")
      .single();
    if (profileError) throw profileError;

    const items = (recent.items ?? [])
      .filter((item: any) => item?.track && item?.played_at)
      .sort((a: any, b: any) => Date.parse(a.played_at) - Date.parse(b.played_at));

    const rows = items.map((item: any, index: number) => {
      const duration = Number(item.track.duration_ms ?? 0);
      const threshold = Math.min(30_000, duration / 2);
      const previousTime = index > 0 ? Date.parse(items[index - 1].played_at) : null;
      const gap = previousTime === null ? Number.POSITIVE_INFINITY : Date.parse(item.played_at) - previousTime;
      return {
        profile_id: profile.id,
        played_at: item.played_at,
        source: "spotify",
        track_id: item.track.id,
        track_name: item.track.name,
        artist_names: item.track.artists.map((artist: any) => artist.name),
        album_name: item.track.album?.name ?? null,
        album_image: item.track.album?.images?.[0]?.url ?? null,
        duration_ms: duration || null,
        counted: gap >= threshold,
      };
    });

    let savedCount = 0;
    if (rows.length) {
      const { data, error } = await admin.from("plays")
        .upsert(rows, { onConflict: "profile_id,played_at,track_name", ignoreDuplicates: true })
        .select("id");
      if (error) throw error;
      savedCount = data?.length ?? 0;
    }

    const syncedAt = new Date().toISOString();
    await admin.from("spotify_tokens").update({
      last_synced_at: syncedAt,
      last_error: null,
      updated_at: syncedAt,
    }).eq("user_id", user.id);

    return json({ checked: rows.length, saved: savedCount, skipped: savedCount === 0 });
  } catch (error) {
    console.error(error);
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return json({ error: status >= 500 ? "Spotify sync is temporarily unavailable" : message }, status);
  }
});
