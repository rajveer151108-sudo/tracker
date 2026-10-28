const $ = (id) => document.getElementById(id);
  const root = document.documentElement;
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const fmt = (s) => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");

  const ICON_PLAY  = '<svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';

  async function playSpotifyUri(uri, context = null) {
    const fallback = await window.tracker.playUri(uri, context).catch((error) => ({ ok: false, error: error?.message }));
    return { ...fallback, source: "desktop" };
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


