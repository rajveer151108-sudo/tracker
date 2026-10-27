// =====================================================================
  // Lyrics (line list + estimated word timing)
  // =====================================================================
  let trackId = null;
  let lyricsGeneration = 0;
  let pollInFlight = false;
  let sourceLines = [];      // canonical lyric lines, kept independent of the visual layout
  let lines = [];            // currently rendered rows (lines or individual words)
  let timingInfo = "";
  let lineEls = [];
  let activeIdx = -2;
  let prevActive = -1;
  let posSec = 0, syncAt = performance.now(), playing = false, durSec = 0, seeking = false;
  let offset = 0;            // user lyric shift, seconds

  function parseLrc(text) {
    const out = [];
    for (const raw of text.split("\n")) {
      const stamps = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
      if (!stamps.length) continue;
      const lyric = raw.replace(/\[[^\]]*\]/g, "").trim();
      for (const m of stamps) out.push({ t: Number(m[1]) * 60 + Number(m[2]), text: lyric });
    }
    return out.sort((a, b) => a.t - b.t);
  }

  // ---- genre feel: each genre gets its own speeds and highlight style ----
  const FEELS = {
    rap:        { tour: 16, spin: 5,  lines: 350,  highlight: null,    beat: 1.25 },   // fast and punchy
    rnb:        { tour: 38, spin: 16, lines: 1000, highlight: "whole", beat: 0.8 },    // slow and dreamy, lines light up whole
    pop:        { tour: 24, spin: 8,  lines: 500,  highlight: null,    beat: 1.0 },
    rock:       { tour: 20, spin: 6,  lines: 420,  highlight: null,    beat: 1.2 },
    electronic: { tour: 14, spin: 4,  lines: 380,  highlight: null,    beat: 1.3 },
  };
  const DEFAULT_FEEL = { tour: 26, spin: 9, lines: 550, highlight: null, beat: 1.0 };
  let feel = DEFAULT_FEEL;
  function applyFeel() {
    const bucket = document.body.dataset.genre || "";
    feel = settings.genreFeel ? (FEELS[bucket] || DEFAULT_FEEL) : DEFAULT_FEEL;
    root.style.setProperty("--tour", feel.tour + "s");
    if (typeof setAlbumTourDuration === "function") setAlbumTourDuration(feel.tour);
    root.style.setProperty("--lines-ms", feel.lines + "ms");
    document.body.dataset.hl = (settings.genreFeel && feel.highlight) || settings.lyricsHighlight || "word";
    window.tracker.sendGlow({ speed: feel.spin });
  }

  let lastInfo = null;
  async function runLyricsDiag() {
    const out = $("diagOut");
    out.style.display = "block";
    out.textContent = "Checking\u2026";
    out.textContent = lastInfo ? await window.tracker.lyricsDiag(lastInfo) : "Play a song first, then run the check.";
    out.scrollIntoView({ block: "center" });
  }

  // rough syllable count, so words that take longer to sing get more of the line's time
  function syllables(word) {
    const w = word.toLowerCase().replace(/[^a-z\u00c0-\u024f]/g, "");
    if (!w) return 1;
    const groups = w.replace(/e$/, "").match(/[aeiouy\u00e0-\u00f6\u00f8-\u00ff]+/g);
    return Math.max(1, groups ? groups.length : 1);
  }

  function wordWeight(word) {
    return syllables(word) * 2 + word.replace(/[^\p{L}\p{N}]/gu, "").length * 0.15 + 0.5;
  }

  function estimatedWords(line, nextStart) {
    const textWords = (line.text || "").split(/\s+/).filter(Boolean);
    if (!textWords.length) return [];
    const start = Number(line.t) || 0;
    const end = Math.max(start + 0.12, Number(line.end) || Number(nextStart) || start + 4);
    const weights = textWords.map(wordWeight);
    const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;
    let elapsed = 0;
    return textWords.map((text, index) => {
      const t = start + (elapsed / total) * (end - start);
      elapsed += weights[index];
      return { text, t, end: start + (elapsed / total) * (end - start), estimated: true };
    });
  }

  function timedWords(line, nextStart) {
    if (!Array.isArray(line.words) || !line.words.length) return estimatedWords(line, nextStart);
    const lineEnd = Math.max(Number(line.t) + 0.12, Number(line.end) || Number(nextStart) || Number(line.t) + 4);
    return line.words.flatMap((word, index) => {
      const text = String(word.text || "").trim();
      const t = Number(word.t);
      if (!text || !Number.isFinite(t)) return [];
      const nextWordStart = Number(line.words[index + 1]?.t);
      const rawEnd = Number(word.end);
      const end = Number.isFinite(rawEnd) && rawEnd > t
        ? rawEnd
        : Number.isFinite(nextWordStart) && nextWordStart > t ? nextWordStart : lineEnd;
      return [{ text, t, end: Math.max(t + 0.06, end) }];
    });
  }

  function wordStreamRows(input) {
    const rows = input.flatMap((line, index) => {
      const words = timedWords(line, input[index + 1]?.t);
      return words.map((word) => ({
        t: word.t,
        end: word.end,
        text: word.text,
        words: [word],
        wordStream: true,
      }));
    }).sort((a, b) => a.t - b.t);
    return window.LyricEffects.decorateRows(rows);
  }

  function updateTimingInfo() {
    $("estimate").textContent = timingInfo
      ? timingInfo + (settings.lyricsLayout === "wordstream" ? " \u00b7 Word stream" : "")
      : "";
  }

  function rebuildLyricsLayout() {
    lines = settings.lyricsLayout === "wordstream" ? wordStreamRows(sourceLines) : sourceLines;
    buildLines();
    updateTimingInfo();
  }

  function setLyrics(nextLines, info) {
    sourceLines = Array.isArray(nextLines) ? nextLines : [];
    timingInfo = info || "";
    rebuildLyricsLayout();
  }

  function clearLyrics() {
    document.body.classList.remove("lyrics-waiting");
    setLyrics([], "");
  }

  // Each line becomes a row of word spans. Words get a share of the line's time
  // based on how long they are (we don't have real per-word timing from LRCLIB).
  function buildLines() {
    const box = $("lines");
    box.innerHTML = "";
    prevActive = -1;
    lineEls = lines.map((l) => {
      const div = document.createElement("div");
      div.className = "line";
      if (l.wordStream && l.tone) {
        div.classList.add("keyword");
        div.dataset.tone = l.tone;
      }
      const timed = Array.isArray(l.words) && l.words.length > 0;
      const words = timed ? l.words.map((w) => w.text) : (l.text || "\u266A").split(/\s+/).filter(Boolean);
      const spans = words.map((w, i) => {
        const s = document.createElement("span");
        s.className = "w";
        s.textContent = w;
        div.appendChild(s);
        if (i < words.length - 1) div.appendChild(document.createTextNode(" "));
        return s;
      });
      const W = { spans, cache: spans.map(() => -1), cur: -1, timed };
      if (l.wordStream && l.emoji) {
        const emoji = document.createElement("span");
        emoji.className = "lyric-emoji";
        emoji.textContent = l.emoji;
        emoji.setAttribute("aria-hidden", "true");
        div.appendChild(document.createTextNode(" "));
        div.appendChild(emoji);
      }
      if (timed) {
        W.wt = l.words.map((w) => w.t);
        W.we = l.words.map((w) => w.end);
      } else {
        const weights = words.map(wordWeight);
        const total = weights.reduce((a, b) => a + b, 0);
        let acc = 0;
        W.starts = []; W.ends = [];
        weights.forEach((wt) => { W.starts.push(acc / total); acc += wt; W.ends.push(acc / total); });
      }
      div._w = W;
      box.appendChild(div);
      return div;
    });
    activeIdx = -2;
  }

  // ---- fit a line into an invisible box that is proportional to the screen ----
  // Few words -> the line grows to fill the box. Many words -> it stays at its normal size.
  let fittedEl = null;
  function clearFit() {
    if (!fittedEl) return;
    ["font-size", "max-width", "margin-left", "margin-right"].forEach((p) => fittedEl.style.removeProperty(p));
    fittedEl = null;
  }
  function fitLine(el, text) {
    clearFit();
    const words = (text || "").split(/\s+/).filter(Boolean).length;
    if (!words || !(text || "").replace(/[\u266A\s]/g, "")) return;       // empty or just a note symbol
    const stage = $("stage");
    const immersiveNow = document.body.classList.contains("immersive");
    const cubeNow = settings.lyricsLayout === "wordstream" && settings.lyricsMotion === "cube";
    const boxW = stage.clientWidth * (cubeNow ? (immersiveNow ? 0.84 : 0.82) : (immersiveNow ? 0.95 : 0.9));
    const boxH = stage.clientHeight * 0.62;
    const base = parseFloat(getComputedStyle(el).fontSize);
    // how much this line may grow, by number of words
    const boost = words >= 7 ? 1 : words >= 5 ? 1.25 : words >= 3 ? 1.8 : words === 2 ? 2.6 : 4.5;
    el.style.maxWidth = boxW + "px";
    if (cubeNow || document.body.classList.contains("center")) {
      el.style.marginLeft = "auto";
      el.style.marginRight = "auto";
    }
    const fits = (s) => {
      el.style.fontSize = s + "px";
      return el.scrollWidth <= el.clientWidth + 1 && el.offsetHeight <= boxH;
    };
    let lo = base * 0.6, hi = base * boost, chosen;
    if (fits(hi)) chosen = hi;
    else {
      for (let i = 0; i < 9; i++) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; }
      chosen = lo;
    }
    el.style.fontSize = chosen + "px";
    fittedEl = el;
  }

  // ---- songs with no synced lyrics: spread the plain lines over the song ----
  function plainToLines(plain, dur) {
    const items = [];
    for (const raw of plain.split("\n")) {
      const line = raw.trim();
      if (!line) { if (items.length) items[items.length - 1].weight += 1.5; continue; }   // blank line = a pause
      if (/^\[[^\]]*\]$/.test(line)) continue;                                           // [Chorus] style tags
      items.push({ text: line, weight: Math.max(2, line.split(/\s+/).length) + 1 });
    }
    const start = Math.min(12, dur * 0.06);
    const end = Math.max(start + 10, dur - Math.min(10, dur * 0.05));
    const total = items.reduce((a, b) => a + b.weight, 0) || 1;
    let acc = 0;
    return items.map((it) => { const t = start + (acc / total) * (end - start); acc += it.weight; return { t, text: it.text }; });
  }

  function setPop(W, idx) {
    const old = W.cur;
    if (old >= 0) {
      W.spans[old].classList.remove("cur");
      if (W.spans[old - 1]) W.spans[old - 1].classList.remove("nearL");
      if (W.spans[old + 1]) W.spans[old + 1].classList.remove("nearR");
    }
    if (idx >= 0) {
      W.spans[idx].classList.add("cur");
      if (W.spans[idx - 1]) W.spans[idx - 1].classList.add("nearL");
      if (W.spans[idx + 1]) W.spans[idx + 1].classList.add("nearR");
    }
    W.cur = idx;
  }

  function setNotice(msg) { $("notice").textContent = msg || ""; }

  function currentTrackKey(np) {
    return [np.id, np.title, np.artist, np.album, Math.round(Number(np.durationMs) || 0)]
      .map((value) => String(value || "").normalize("NFKC").trim().toLowerCase())
      .join("|");
  }

  // set the glow colour here and on the full-screen edge glow
  function applyGlow(rgb, rgb2) {
    root.style.setProperty("--glow", rgb);
    window.tracker.sendGlow({ color: rgb, color2: rgb2 || rgb });
  }
  let lastActive = null;
  function sendActive(a) {
    if (a !== lastActive) { lastActive = a; window.tracker.sendGlow({ active: a }); }
  }

  // glow colour from the cover art (falls back to green if the image can't be read)
  function setGlowFromCover() {
    try {
      const img = $("cover");
      const S = 32;
      const c = document.createElement("canvas");
      c.width = c.height = S;
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0, S, S);
      const d = g.getImageData(0, 0, S, S).data;

      // group the pixels by hue (12 slices of the colour wheel) and weight vivid, bright ones more
      const bins = Array.from({ length: 12 }, (_, i) => ({ i, w: 0, r: 0, g: 0, b: 0 }));
      let tr = 0, tg = 0, tb = 0, tw = 0;
      for (let i = 0; i < d.length; i += 4) {
        const R = d[i], G = d[i + 1], B = d[i + 2];
        const mx = Math.max(R, G, B), mn = Math.min(R, G, B), delta = mx - mn;
        const sat = mx === 0 ? 0 : delta / mx;
        const wt = 0.1 + sat * sat * mx / 255;
        tr += R * wt; tg += G * wt; tb += B * wt; tw += wt;
        if (mx < 40 || sat < 0.2) continue;                      // skip near-black and grey pixels
        let hue;
        if (mx === R) hue = ((G - B) / delta) % 6; else if (mx === G) hue = (B - R) / delta + 2; else hue = (R - G) / delta + 4;
        hue *= 60; if (hue < 0) hue += 360;
        const bin = bins[Math.floor(hue / 30) % 12];
        const bw = sat * sat * mx / 255;
        bin.w += bw; bin.r += R * bw; bin.g += G * bw; bin.b += B * bw;
      }
      const bright = (r, gg, b) => {                              // lift the colour so the glow is visible
        const m = Math.max(r, gg, b) || 1, k = 235 / m;
        return [r, gg, b].map((v) => Math.min(255, Math.round(v * k)));
      };
      const sorted = bins.filter((b) => b.w > 0).sort((a, b) => b.w - a.w);
      if (!sorted.length) {                                       // black-and-white cover: use the overall tone
        const a = bright(tr / tw, tg / tw, tb / tw);
        const soft = a.map((v) => Math.round(v * 0.6 + 255 * 0.4));
        applyGlow(a.join(", "), soft.join(", "));
        return;
      }
      const A = sorted[0];
      const dist = (x, y) => { const d1 = Math.abs(x.i - y.i); return Math.min(d1, 12 - d1); };
      const Bbin = sorted.find((b) => b !== A && dist(A, b) >= 2 && b.w >= A.w * 0.15);
      const a = bright(A.r / A.w, A.g / A.w, A.b / A.w);
      const b2 = Bbin ? bright(Bbin.r / Bbin.w, Bbin.g / Bbin.w, Bbin.b / Bbin.w)
                      : a.map((v) => Math.round(v * 0.65 + 255 * 0.35));   // no second colour: use a lighter tint of the first
      applyGlow(a.join(", "), b2.join(", "));
    } catch (e) {
      applyGlow("29, 185, 84", "122, 92, 255");
    }
  }
  $("cover").addEventListener("load", setGlowFromCover);

  async function loadTrack(np) {
    const gid = currentTrackKey(np);
    const generation = ++lyricsGeneration;
    trackId = gid;
    lastInfo = { id: np.id, title: np.title, artist: np.artist, album: np.album, durationSec: np.durationMs / 1000 };
    clearLyrics();
    document.body.dataset.genre = ""; $("genre").textContent = "";
    applyFeel();
    window.tracker.genre({ id: np.id, title: np.title, artist: np.artist, album: np.album }).then((g) => {
      if (trackId !== gid || generation !== lyricsGeneration || !g) return;
      document.body.dataset.genre = g.bucket || "other";      // CSS can key off body[data-genre="rap"] etc.
      applyFeel();
      $("genre").textContent = g.raw || "";
    }).catch(() => {});
    if (!settings.showLyrics) { setNotice("Lyrics are off. Turn them on in settings."); return; }
    setNotice("Looking for lyrics\u2026");
    const res = await window.tracker.lyrics(lastInfo);
    if (trackId !== gid || generation !== lyricsGeneration || !settings.showLyrics) return;
    if (res && Array.isArray(res.words) && res.words.length) {
      setLyrics(res.words.map((l) => ({ t: l.t, end: l.end, text: l.text, words: l.words })),
        "Real word timing \u00b7 " + (res.source || "Timed source"));
      setNotice("");
    } else if (res && res.synced) {
      const parsed = parseLrc(res.synced);
      setLyrics(parsed, "Line timing");
      setNotice(parsed.length ? "" : "No synced lyrics for this song.");
    } else if (res && res.plain && settings.lyricsEstimate) {
      const estimated = plainToLines(res.plain, np.durationMs / 1000);
      setLyrics(estimated, estimated.length ? "Estimated timing" : "");
      setNotice(estimated.length ? "" : "No synced lyrics found for this song.");
    } else if (res && res.error) {
      setNotice("Could not reach the lyrics service: " + res.error);
    } else {
      setNotice("No synced lyrics found for this song.");
    }
  }

  async function poll() {
    if (pollInFlight) return;
    pollInFlight = true;
    try {
      const np = await window.tracker.nowPlaying();
      if (np.state === "playing" || np.state === "paused") {
        window.tracker.observeForTracker(np);
        $("title").textContent = np.title;
        $("artist").textContent = np.artist;
        $("album").textContent = np.album;
        if (np.artwork && $("cover").getAttribute("src") !== np.artwork) {
          $("cover").src = np.artwork;
          lastArtwork = np.artwork;
          if (settings.backdrop) setBackdrop(np.artwork);
        }
        durSec = np.durationMs / 1000;
        if (!seeking) {
          posSec = np.positionSec;
          syncAt = performance.now();
        }
        playing = np.state === "playing";
        sendActive(playing);
        $("dur").textContent = fmt(durSec);
        const nextTrackId = currentTrackKey(np);
        if (nextTrackId !== trackId) {
          window.tracker.historyAdd({ uri: np.id, name: np.title, artist: np.artist, album: np.album, img: np.artwork });
          loadTrack(np);
        }
      } else {
        window.tracker.observeForTracker(null);
        playing = false;
        sendActive(false);
        if (trackId !== null) lyricsGeneration++;
        trackId = null; clearLyrics();
        document.body.dataset.genre = ""; $("genre").textContent = "";
        $("title").textContent = np.state === "closed" ? "Spotify is not open" : "Nothing playing";
        $("artist").textContent = ""; $("album").textContent = "";
        setNotice(np.state === "error" ? ("Could not read Spotify: " + (np.message || "")) : "Press play in Spotify.");
      }
      $("playpause").innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
    } finally {
      pollInFlight = false;
    }
  }


