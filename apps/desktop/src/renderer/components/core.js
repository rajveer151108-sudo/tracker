const $ = (id) => document.getElementById(id);
  const root = document.documentElement;
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const fmt = (s) => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");

  const ICON_PLAY  = '<svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';

  function spotifyPlaybackBody(uri, context = null) {
    if (context) return { context_uri: context, offset: { uri } };
    return /^spotify:(?:track|episode):/.test(uri) ? { uris: [uri] } : { context_uri: uri };
  }

  const playbackWait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  function playbackNeedsDevice(result) {
    return result?.status === 404 || /device|player/i.test(String(result?.error || ""));
  }
  function availableSpotifyDevice(response) {
    const devices = Array.isArray(response?.data?.devices) ? response.data.devices : [];
    return devices.find((device) => device?.type === "Computer" && device?.is_active && !device?.is_restricted)
      || devices.find((device) => device?.type === "Computer" && !device?.is_restricted)
      || devices.find((device) => device?.is_active && !device?.is_restricted)
      || devices.find((device) => !device?.is_restricted)
      || null;
  }

  async function playSpotifyUri(uri, context = null) {
    // Spotify's playback API is asynchronous: a successful 204 means the
    // command was accepted, even when now-playing has not caught up yet. Do
    // not poll and resend that accepted command; duplicate play requests make
    // the desktop client pause, restart, and jump back to the beginning.
    const requestPlay = (body, deviceId = "") => window.tracker.spApi({
      path: "/me/player/play" + (deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : ""),
      method: "PUT",
      body,
    }).catch((error) => ({ ok: false, status: 0, error: error?.message }));

    let remote = await requestPlay(spotifyPlaybackBody(uri, context));
    if (remote?.ok) return { ...remote, source: "web-api" };

    // A playlist can change between loading and clicking, making its offset
    // invalid even though the song itself remains playable. Retry it directly.
    if (context && /^spotify:(?:track|episode):/.test(uri)) {
      remote = await requestPlay(spotifyPlaybackBody(uri));
      if (remote?.ok) return { ...remote, source: "web-api-direct" };
    }

    // Spotify returns 404 when no player is active. Pick an existing desktop
    // or phone device, transfer playback quietly, then issue the song once.
    if (playbackNeedsDevice(remote)) {
      const devices = await window.tracker.spApi("/me/player/devices")
        .catch((error) => ({ ok: false, error: error?.message }));
      const device = availableSpotifyDevice(devices);
      if (device?.id) {
        const transfer = await window.tracker.spApi({
          path: "/me/player",
          method: "PUT",
          body: { device_ids: [device.id], play: false },
        }).catch((error) => ({ ok: false, error: error?.message }));
        if (transfer?.ok) {
          await playbackWait(180);
          remote = await requestPlay(spotifyPlaybackBody(uri, context), device.id);
          if (!remote?.ok && context) remote = await requestPlay(spotifyPlaybackBody(uri), device.id);
          if (remote?.ok) return { ...remote, source: "web-api-device" };
        }
      }
    }

    // Last resort for expired API sessions and Spotify-side outages. The main
    // process shields Afterglow above Spotify while this desktop command runs.
    const fallback = await window.tracker.playUri(uri, context)
      .catch((error) => ({ ok: false, error: error?.message }));
    if (fallback?.ok) return { ...fallback, source: "desktop-shielded", remoteError: remote?.error || "" };
    let directFallback = fallback;
    if (context && /^spotify:(?:track|episode):/.test(uri)) {
      directFallback = await window.tracker.playUri(uri)
        .catch((error) => ({ ok: false, error: error?.message }));
      if (directFallback?.ok) return { ...directFallback, source: "desktop-shielded-direct", remoteError: remote?.error || "" };
    }
    return {
      ...remote,
      ok: false,
      source: "failed",
      error: directFallback?.error || remote?.error || "Spotify did not start playback",
    };
  }

  async function advanceSpotifyQueue(steps = 1) {
    const count = Math.max(1, Math.min(50, Math.trunc(Number(steps) || 1)));
    for (let index = 0; index < count; index++) {
      const result = await window.tracker.spApi({ path: "/me/player/next", method: "POST" })
        .catch((error) => ({ ok: false, status: 0, error: error?.message }));
      if (!result?.ok) return { ...result, source: "spotify-queue", advanced: index };
      if (index + 1 < count) await playbackWait(140);
    }
    return { ok: true, source: "spotify-queue", advanced: count };
  }

  function spotifyPagePath(next) {
    if (!next) return "";
    try {
      const parsed = new URL(next);
      if (parsed.protocol !== "https:" || parsed.hostname !== "api.spotify.com") return "";
      return parsed.pathname.replace(/^\/v1/, "") + parsed.search;
    } catch { return ""; }
  }

  async function spotifyPaged(path, maxPages = 100) {
    let next = path, first = null;
    const items = [];
    for (let page = 0; next && page < maxPages; page++) {
      const response = await window.tracker.spApi(next);
      if (!response?.ok) return first ? { ...response, data: { ...first, items } } : response;
      const data = response.data || {};
      if (!first) first = data;
      items.push(...(Array.isArray(data.items) ? data.items : []));
      next = spotifyPagePath(data.next);
    }
    return { ok: true, status: 200, data: { ...(first || {}), items, next: null } };
  }


