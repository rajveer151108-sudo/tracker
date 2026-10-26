// =====================================================================
  // Library: your playlists, liked songs, recent plays, search, play history
  // =====================================================================
  const lib = { tab: "playlists", connected: false, detail: null, searchText: "", rid: 0 };
  const TABS = [["playlists", "Playlists"], ["liked", "Liked"], ["recent", "Recent"], ["search", "Search"], ["history", "History"], ["account", "Account"]];

  function mk(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  let toastTimer = null;
  function showToast(msg) {
    const t = $("toast");
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2800);
  }

  async function playFromLibrary(uri, ctx, label) {
    const r = await window.tracker.playUri(uri, ctx || null);
    showToast(r && r.ok ? "Playing" + (label ? ": " + label : "") : "Couldn't play: " + ((r && r.error) || "unknown error"));
    setTimeout(poll, 600);
  }

  function parseSpotifyLink(s) {
    s = (s || "").trim();
    let m = s.match(/^spotify:(track|album|playlist|artist|episode|show):([A-Za-z0-9]+)$/);
    if (m) return "spotify:" + m[1] + ":" + m[2];
    m = s.match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?(track|album|playlist|artist|episode|show)\/([A-Za-z0-9]+)/);
    return m ? "spotify:" + m[1] + ":" + m[2] : null;
  }

  const smallImg = (imgs) => (imgs && imgs.length ? imgs[imgs.length - 1].url : "");
  function normTrack(t) {
    if (!t || !t.uri) return null;
    return { uri: t.uri, name: t.name || "Unknown", sub: (t.artists || []).map((a) => a.name).join(", "), img: smallImg(t.album && t.album.images) };
  }

  function row(o) {
    const r = mk("div", "item");
    const im = mk("img"); im.alt = ""; if (o.img) im.src = o.img;
    r.appendChild(im);
    const mid = mk("div", "mid");
    mid.appendChild(mk("div", "t", o.title));
    if (o.sub) mid.appendChild(mk("div", "s", o.sub));
    r.appendChild(mid);
    if (o.action) {
      const b = mk("button", "btn small", o.action.label);
      b.addEventListener("click", (e) => { e.stopPropagation(); o.action.fn(); });
      r.appendChild(b);
    }
    if (o.onClick) r.addEventListener("click", o.onClick);
    return r;
  }

  function friendlyError(res) {
    if (res.status === 401) return "Spotify says you're not connected. Reconnect in the Account tab.";
    if (res.status === 403) return "Spotify refused this request (403). Your app may not be allowed to use it. " + (res.error || "");
    if (res.status === 429) return "Spotify says to slow down. Try again in a moment.";
    return res.error || "Something went wrong.";
  }
  function showApiError(container, what, res, extra) {
    container.appendChild(mk("div", "hintline err", "Couldn't load " + what + ". " + friendlyError(res)));
    if (extra) container.appendChild(mk("div", "hintline", extra));
  }
  function needConnect(body) {
    body.appendChild(mk("div", "hintline", "Connect your Spotify account to browse this."));
    const b = mk("button", "btn primary", "Go to Account");
    b.addEventListener("click", () => setTab("account"));
    body.appendChild(b);
  }

  async function renderTrackList(body, rid, path, what, dedupe) {
    if (!lib.connected) return needConnect(body);
    body.appendChild(mk("div", "hintline", "Loading " + what + "\u2026"));
    const res = await window.tracker.spApi(path);
    if (rid !== lib.rid) return;
    body.innerHTML = "";
    if (!res.ok) return showApiError(body, what, res);
    const seen = new Set();
    let n = 0;
    for (const it of (res.data && res.data.items) || []) {
      const t = normTrack(it && (it.track || it.item));
      if (!t || (dedupe && seen.has(t.uri))) continue;
      seen.add(t.uri); n++;
      body.appendChild(row({ img: t.img, title: t.name, sub: t.sub, onClick: () => playFromLibrary(t.uri, null, t.name) }));
    }
    if (!n) body.appendChild(mk("div", "hintline", "Nothing came back."));
  }

  async function renderPlaylists(body, rid) {
    if (!lib.connected) return needConnect(body);
    if (lib.detail) return renderPlaylistDetail(body, rid);
    body.appendChild(mk("div", "hintline", "Loading your playlists\u2026"));
    const res = await window.tracker.spApi("/me/playlists?limit=50");
    if (rid !== lib.rid) return;
    body.innerHTML = "";
    if (!res.ok) return showApiError(body, "your playlists", res, "You can still play a playlist by pasting its link in the Search tab.");
    const items = ((res.data && res.data.items) || []).filter(Boolean);
    if (!items.length) { body.appendChild(mk("div", "hintline", "No playlists came back.")); return; }
    for (const p of items) {
      const count = p.tracks && p.tracks.total != null ? p.tracks.total : (p.items && p.items.total);
      body.appendChild(row({
        img: smallImg(p.images), title: p.name || "Untitled",
        sub: (count != null ? count + " songs" : "Playlist") + (p.owner && p.owner.display_name ? " \u00B7 " + p.owner.display_name : ""),
        onClick: () => { lib.detail = p; renderLibrary(); },
        action: { label: "Play", fn: () => playFromLibrary(p.uri, null, p.name) },
      }));
    }
  }

  async function renderPlaylistDetail(body, rid) {
    const p = lib.detail;
    const top = mk("div", "detailTop");
    const back = mk("button", "btn", "\u2190 Back");
    back.addEventListener("click", () => { lib.detail = null; renderLibrary(); });
    const play = mk("button", "btn primary", "Play playlist");
    play.addEventListener("click", () => playFromLibrary(p.uri, null, p.name));
    top.appendChild(back); top.appendChild(mk("div", "detailName", p.name || "")); top.appendChild(play);
    body.appendChild(top);
    const holder = mk("div"); body.appendChild(holder);
    holder.appendChild(mk("div", "hintline", "Loading songs\u2026"));
    let res = await window.tracker.spApi("/playlists/" + p.id + "/items?limit=100");
    if (!res.ok && (res.status === 404 || res.status === 400)) res = await window.tracker.spApi("/playlists/" + p.id + "/tracks?limit=100");
    if (rid !== lib.rid) return;
    holder.innerHTML = "";
    if (!res.ok) {
      showApiError(holder, "this playlist's songs", res, "Spotify may only let this app read songs in playlists you own or collaborate on. You can still press Play playlist.");
      return;
    }
    let n = 0;
    for (const it of (res.data && res.data.items) || []) {
      const t = normTrack(it && (it.track || it.item));
      if (!t) continue;
      n++;
      holder.appendChild(row({ img: t.img, title: t.name, sub: t.sub, onClick: () => playFromLibrary(t.uri, p.uri, t.name) }));
    }
    if (!n) holder.appendChild(mk("div", "hintline", "No songs came back."));
  }

  function renderSearch(body, rid) {
    const input = mk("input", "search");
    input.type = "text"; input.placeholder = "Search songs, or paste a Spotify link"; input.value = lib.searchText;
    const results = mk("div");
    body.appendChild(input); body.appendChild(results);
    let timer = null;

    const section = (title, rows) => {
      if (!rows.length) return;
      results.appendChild(mk("div", "secTitle", title));
      rows.forEach((r) => results.appendChild(r));
    };
    const run = async () => {
      const q = input.value.trim();
      lib.searchText = q;
      results.innerHTML = "";
      if (!q) return;
      const uri = parseSpotifyLink(q);
      if (uri) {
        results.appendChild(row({ title: "Play this Spotify link", sub: uri, onClick: () => playFromLibrary(uri, null, "link"),
                                  action: { label: "Play", fn: () => playFromLibrary(uri, null, "link") } }));
        return;
      }
      if (!lib.connected) { results.appendChild(mk("div", "hintline", "Connect Spotify in the Account tab to search, or paste a Spotify link.")); return; }
      results.appendChild(mk("div", "hintline", "Searching\u2026"));
      const res = await window.tracker.spApi("/search?q=" + encodeURIComponent(q) + "&type=track,album,playlist&limit=8");
      if (q !== lib.searchText || rid !== lib.rid) return;
      results.innerHTML = "";
      if (!res.ok) return showApiError(results, "search results", res);
      const d = res.data || {};
      section("Songs", ((d.tracks && d.tracks.items) || []).map(normTrack).filter(Boolean).map((t) =>
        row({ img: t.img, title: t.name, sub: t.sub, onClick: () => playFromLibrary(t.uri, null, t.name) })));
      section("Albums", ((d.albums && d.albums.items) || []).filter(Boolean).map((a) =>
        row({ img: smallImg(a.images), title: a.name, sub: (a.artists || []).map((x) => x.name).join(", "), onClick: () => playFromLibrary(a.uri, null, a.name) })));
      section("Playlists", ((d.playlists && d.playlists.items) || []).filter(Boolean).map((p) =>
        row({ img: smallImg(p.images), title: p.name, sub: p.owner && p.owner.display_name, onClick: () => playFromLibrary(p.uri, null, p.name) })));
      if (!results.children.length) results.appendChild(mk("div", "hintline", "No results."));
    };
    input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(run, 400); });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { clearTimeout(timer); run(); } });
    if (lib.searchText) run(); else input.focus();
  }

  async function renderHistory(body, rid) {
    const list = await window.tracker.historyGet();
    if (rid !== lib.rid) return;
    if (!list.length) { body.appendChild(mk("div", "hintline", "Songs you play while this app is open will show up here.")); return; }
    for (const t of list) {
      body.appendChild(row({ img: t.img, title: t.name, sub: t.artist, onClick: () => playFromLibrary(t.uri, null, t.name) }));
    }
  }

  async function runApiTest(out) {
    out.textContent = "Testing\u2026";
    const lines = [];
    const add = (name, res, extra) =>
      lines.push((res.ok ? "OK    " : "FAIL  ") + name + " (" + res.status + ")" + (res.ok ? (extra ? "  " + extra : "") : "  " + (res.error || "")));
    let res = await window.tracker.spApi("/me");
    add("your profile", res, res.ok ? ((res.data.display_name || "") + (res.data.product ? ", plan: " + res.data.product : "")) : "");
    const pl = await window.tracker.spApi("/me/playlists?limit=5");
    add("your playlists", pl, pl.ok ? ((pl.data.items || []).length + " returned") : "");
    res = await window.tracker.spApi("/me/tracks?limit=5");
    add("liked songs", res, res.ok ? ((res.data.items || []).length + " returned") : "");
    res = await window.tracker.spApi("/me/player/recently-played?limit=5");
    add("recently played", res, res.ok ? ((res.data.items || []).length + " returned") : "");
    res = await window.tracker.spApi("/search?q=love&type=track&limit=5");
    add("search", res, res.ok ? "works" : "");
    const first = pl.ok && pl.data && (pl.data.items || []).find(Boolean);
    if (first) {
      res = await window.tracker.spApi("/playlists/" + first.id + "/items?limit=3");
      add("songs in \"" + first.name + "\" (new items call)", res, res.ok ? "works" : "");
      if (!res.ok) { res = await window.tracker.spApi("/playlists/" + first.id + "/tracks?limit=3"); add("songs in the same playlist (old tracks call)", res, res.ok ? "works" : ""); }
    } else {
      lines.push("SKIP  playlist songs (no playlist to try)");
    }
    out.textContent = lines.join("\n");
  }

  function renderAccount(body) {
    body.appendChild(mk("div", "hintline", lib.connected
      ? "Spotify is connected. Your login stays on this Mac."
      : "Connect your Spotify account so the app can list your playlists and search. Playing songs works without it."));
    const btn = mk("button", "btn primary", lib.connected ? "Disconnect" : "Connect Spotify");
    btn.addEventListener("click", async () => {
      if (lib.connected) { await window.tracker.spLogout(); showToast("Disconnected"); renderLibrary(); return; }
      btn.disabled = true; btn.textContent = "Waiting for your browser\u2026";
      const r = await window.tracker.spLogin();
      showToast(r.ok ? "Connected" : "Login failed: " + (r.error || ""));
      renderLibrary();
    });
    body.appendChild(btn);
    if (lib.connected) {
      body.appendChild(mk("div", "secTitle", "Check what Spotify lets this app do"));
      const out = mk("pre", "testOut", "Press the button to test.");
      const t = mk("button", "btn", "Run API test");
      t.addEventListener("click", () => runApiTest(out));
      body.appendChild(t); body.appendChild(out);
    }
  }

  async function renderLibrary() {
    const rid = ++lib.rid;
    const st = await window.tracker.spStatus();
    if (rid !== lib.rid) return;
    lib.connected = !!st.connected;
    [...$("tabs").children].forEach((b) => b.classList.toggle("active", b.dataset.tab === lib.tab));
    const body = $("libBody");
    body.innerHTML = "";
    if (lib.tab === "playlists") await renderPlaylists(body, rid);
    else if (lib.tab === "liked") await renderTrackList(body, rid, "/me/tracks?limit=50", "your liked songs", false);
    else if (lib.tab === "recent") await renderTrackList(body, rid, "/me/player/recently-played?limit=50", "your recent plays", true);
    else if (lib.tab === "search") renderSearch(body, rid);
    else if (lib.tab === "history") await renderHistory(body, rid);
    else renderAccount(body);
  }
  function setTab(name) { lib.tab = name; lib.detail = null; renderLibrary(); }

  function buildTabs() {
    for (const [id, label] of TABS) {
      const b = mk("button", null, label); b.dataset.tab = id;
      b.addEventListener("click", () => setTab(id));
      $("tabs").appendChild(b);
    }
  }
  const openLibrary = () => { $("library").classList.add("open"); closeSettings(); renderLibrary(); };
  const closeLibrary = () => $("library").classList.remove("open");
  $("libBtn").addEventListener("click", () => $("library").classList.contains("open") ? closeLibrary() : openLibrary());
  $("closeLibrary").addEventListener("click", closeLibrary);


