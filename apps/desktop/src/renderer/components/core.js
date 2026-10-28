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

  async function confirmSpotifyPlayback(uri) {
    let last = null;
    for (const delay of [120, 240, 440]) {
      await playbackWait(delay);
      last = await window.tracker.nowPlaying()
        .catch((error) => ({ state: "error", message: error?.message }));
      const playingUri = String(last?.uri || last?.id || "");
      if (last?.state === "playing" && playingUri === uri) return { ok: true, data: last };
    }
    return { ok: false, data: last };
  }

  async function playSpotifyUri(uri, context = null) {
    // Start with the focus-safe Web API, but trust observed desktop playback
    // rather than Spotify's 204 response: Spotify sometimes acknowledges a
    // request without starting any player at all.
    const requestPlay = (body, deviceId = "") => window.tracker.spApi({
      path: "/me/player/play" + (deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : ""),
      method: "PUT",
      body,
    }).catch((error) => ({ ok: false, status: 0, error: error?.message }));
    const confirmed = async (result, source) => {
      if (!result?.ok) return null;
      const playback = await confirmSpotifyPlayback(uri);
      return playback.ok ? { ...result, source } : null;
    };
    const rejectedAcknowledgement = (result) => ({
      ...result,
      ok: false,
      status: 409,
      error: "Spotify acknowledged playback but no active desktop player started",
    });

    let remote = await requestPlay(spotifyPlaybackBody(uri, context));
    let verified = await confirmed(remote, "web-api");
    if (verified) return verified;
    if (remote?.ok) remote = rejectedAcknowledgement(remote);

    // A playlist can change between loading and clicking, making its offset
    // invalid even though the song itself remains playable. Retry it directly.
    if (context && /^spotify:(?:track|episode):/.test(uri)) {
      remote = await requestPlay(spotifyPlaybackBody(uri));
      verified = await confirmed(remote, "web-api-direct");
      if (verified) return verified;
      if (remote?.ok) remote = rejectedAcknowledgement(remote);
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
          verified = await confirmed(remote, "web-api-device");
          if (verified) return verified;
          if (remote?.ok) remote = rejectedAcknowledgement(remote);
        }
      }
    }

    // Last resort for expired API sessions and Spotify-side outages. The main
    // process shields Afterglow above Spotify while this desktop command runs.
    const fallback = await window.tracker.playUri(uri, context)
      .catch((error) => ({ ok: false, error: error?.message }));
    verified = await confirmed(fallback, "desktop-shielded");
    if (verified) return { ...verified, remoteError: remote?.error || "" };
    // Context-aware desktop commands can also be acknowledged without taking
    // effect when Spotify has stale playlist state. One direct retry is safe
    // after confirmation proves that the first command never started.
    let directFallback = fallback;
    if (fallback?.ok && context && /^spotify:(?:track|episode):/.test(uri)) {
      directFallback = await window.tracker.playUri(uri)
        .catch((error) => ({ ok: false, error: error?.message }));
      verified = await confirmed(directFallback, "desktop-shielded-direct");
      if (verified) return { ...verified, remoteError: remote?.error || "" };
    }
    return {
      ...remote,
      ok: false,
      source: "failed",
      error: directFallback?.error || remote?.error || "Spotify did not start playback",
    };
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


