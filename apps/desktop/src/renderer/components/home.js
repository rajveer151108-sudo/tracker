// =====================================================================
// Home: themeable listening hub. Arcade is the first complete home mode.
// =====================================================================
  const homeState = { loadedAt: 0, loading: false, nowKey: "", recent: [], playlists: [], profile: null };

  const homeImage = (images) => images && images.length ? images[0]?.url || images[images.length - 1]?.url || "" : "";
  const homeArtists = (artists) => (artists || []).map((artist) => artist.name).filter(Boolean).join(", ");

  function homeElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
  }

  async function arcadePlay(uri, context, title) {
    const result = await window.tracker.playUri(uri, context || null);
    showToast(result?.ok ? `STARTING: ${title || "TRACK"}` : `COULDN'T START: ${result?.error || "UNKNOWN ERROR"}`);
    if (result?.ok) setTimeout(poll, 350);
  }

  function arcadeCard(item, type, index) {
    const card = homeElement("div", "arcadeCard");
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `Play ${item.title}`);
    const image = homeElement("img");
    image.alt = "";
    image.loading = "lazy";
    if (item.img) image.src = item.img;
    card.appendChild(image);
    card.appendChild(homeElement("span", "arcadeCardBadge", type === "playlist" ? `PACK ${String(index + 1).padStart(2, "0")}` : `STAGE ${String(index + 1).padStart(2, "0")}`));
    card.appendChild(homeElement("h3", "", item.title));
    card.appendChild(homeElement("p", "", item.sub || (type === "playlist" ? "PLAYLIST COLLECTION" : "SONG")));
    const play = () => arcadePlay(item.uri, item.context, item.title);
    card.addEventListener("click", play);
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); play(); }
    });
    return card;
  }

  function renderArcadeGrid(id, items, type) {
    const grid = $(id);
    grid.innerHTML = "";
    if (!items.length) {
      const empty = homeElement("div", "arcadeEmpty", type === "playlist"
        ? "No collections loaded yet. Connect Spotify to bring your playlists into the arcade."
        : "Play songs in Spotify and they will become stages here.");
      const button = homeElement("button", "arcadeBtn", "OPEN LIBRARY");
      button.addEventListener("click", () => { setTab(type === "playlist" ? "account" : "recent"); openLibrary(); });
      empty.appendChild(button);
      grid.appendChild(empty);
      return;
    }
    items.forEach((item, index) => grid.appendChild(arcadeCard(item, type, index)));
  }

  function localArcadeTracks(history) {
    return (history || []).slice(0, 12).map((track) => ({
      uri: track.uri, title: track.name || "Unknown stage", sub: track.artist || track.album || "Local history", img: track.img || "",
    }));
  }

  async function refreshArcadeHome(force = false) {
    if (homeState.loading || (!force && Date.now() - homeState.loadedAt < 60_000)) return;
    homeState.loading = true;
    try {
      const [status, history] = await Promise.all([window.tracker.spStatus(), window.tracker.historyGet()]);
      homeState.recent = localArcadeTracks(history);
      homeState.playlists = [];
      homeState.profile = null;
      if (status?.connected) {
        const [profile, recent, playlists] = await Promise.all([
          window.tracker.spApi("/me"),
          window.tracker.spApi("/me/player/recently-played?limit=16"),
          window.tracker.spApi("/me/playlists?limit=16"),
        ]);
        if (profile.ok) homeState.profile = profile.data;
        if (recent.ok) {
          const seen = new Set();
          homeState.recent = (recent.data?.items || []).flatMap((row) => {
            const track = row?.track;
            if (!track?.uri || seen.has(track.uri)) return [];
            seen.add(track.uri);
            return [{ uri: track.uri, title: track.name || "Unknown stage", sub: homeArtists(track.artists), img: homeImage(track.album?.images) }];
          }).slice(0, 12);
        }
        if (playlists.ok) {
          homeState.playlists = (playlists.data?.items || []).filter((playlist) => playlist?.uri).slice(0, 12).map((playlist) => ({
            uri: playlist.uri, title: playlist.name || "Untitled collection",
            sub: `${playlist.tracks?.total ?? playlist.items?.total ?? "?"} SONGS`, img: homeImage(playlist.images),
          }));
        }
      }
      $("arcadePlayer").textContent = String(homeState.profile?.display_name || "GUEST").toUpperCase().slice(0, 16);
      $("arcadePlays").textContent = String((history || []).length).padStart(3, "0").slice(-3);
      renderArcadeGrid("arcadeRecent", homeState.recent, "track");
      renderArcadeGrid("arcadeCollections", homeState.playlists, "playlist");
      homeState.loadedAt = Date.now();
    } finally {
      homeState.loading = false;
    }
  }

  function updateHomeNowPlaying(nowPlaying) {
    const active = nowPlaying && (nowPlaying.state === "playing" || nowPlaying.state === "paused");
    const key = active ? `${nowPlaying.id}:${nowPlaying.state}:${nowPlaying.artwork}` : "idle";
    if (key === homeState.nowKey) return;
    homeState.nowKey = key;
    const box = $("arcadeNow");
    box.innerHTML = "";
    const copy = homeElement("div", "arcadeNowCopy");
    copy.appendChild(homeElement("span", "", active ? (nowPlaying.state === "playing" ? "NOW PLAYING // LIVE RUN" : "RUN PAUSED") : "READY PLAYER ONE"));
    copy.appendChild(homeElement("h2", "", active ? nowPlaying.title : "CHOOSE YOUR NEXT STAGE"));
    copy.appendChild(homeElement("p", "", active ? `${nowPlaying.artist}${nowPlaying.album ? ` · ${nowPlaying.album}` : ""}` : "Songs are games. Playlists are collections. Your music is the world."));
    const actions = homeElement("div", "arcadeActions");
    const primary = homeElement("button", "arcadeBtn", active ? (nowPlaying.state === "playing" ? "PAUSE RUN" : "CONTINUE") : "BROWSE GAMES");
    primary.addEventListener("click", () => active ? control("playpause") : openLibrary());
    const lyrics = homeElement("button", "arcadeBtn secondary", "MIC // LYRICS");
    lyrics.addEventListener("click", () => setAppView("lyrics"));
    actions.append(primary, lyrics);
    copy.appendChild(actions);
    box.appendChild(copy);
    if (active && nowPlaying.artwork) {
      const art = homeElement("img", "arcadeNowArt"); art.alt = ""; art.src = nowPlaying.artwork; box.appendChild(art);
    } else {
      const art = homeElement("div", "arcadeNowArt"); art.setAttribute("aria-hidden", "true"); box.appendChild(art);
    }
  }

  function setAppView(view) {
    const wanted = view === "lyrics" ? "lyrics" : "home";
    if ($("library").classList.contains("open")) closeLibrary();
    if ($("trackerPanel").classList.contains("open")) closeTracker();
    if ($("settings").classList.contains("open")) closeSettings();
    document.body.dataset.view = wanted;
    $("homeBtn").classList.toggle("active", wanted === "home");
    $("lyricsBtn").classList.toggle("active", wanted === "lyrics");
    $("homeScreen").setAttribute("aria-hidden", wanted !== "home" ? "true" : "false");
    if (wanted === "home") refreshArcadeHome();
    else activeIdx = -2;
  }

  function initHome() {
    $("homeBtn").addEventListener("click", () => setAppView("home"));
    $("lyricsBtn").addEventListener("click", () => setAppView("lyrics"));
    $("arcadeLibraryBtn").addEventListener("click", () => { setTab("recent"); openLibrary(); });
    updateHomeNowPlaying(null);
    setAppView("home");
  }
