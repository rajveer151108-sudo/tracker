// =====================================================================
  // Per-frame loop
  // =====================================================================
  let lastFrameT = performance.now(), lastUiT = 0;
  let edgeFramePhase = 0;
  const CONSTELLATION_SIZE = 11;
  const constellationLayouts = new Map();
  function constellationRandom(seed) {
    let state = (seed ^ 0x9e3779b9) >>> 0;
    return () => {
      state = Math.imul(state ^ state >>> 16, 0x21f0aaad);
      state = Math.imul(state ^ state >>> 15, 0x735a2d97);
      state ^= state >>> 15;
      return (state >>> 0) / 4294967296;
    };
  }
  function constellationLayout(groupStart) {
    if (constellationLayouts.has(groupStart)) return constellationLayouts.get(groupStart);
    const random = constellationRandom(groupStart + 31);
    // Five columns and three rows are invisible collision-safe zones. Shuffling
    // the zones keeps each constellation organic while lyric labels never stack.
    const cells = [];
    [17, 50, 83].forEach((y) => [10, 30, 50, 70, 90].forEach((x) => cells.push([x, y])));
    const shuffled = (input) => input.map((cell) => ({ cell, key: random() })).sort((a, b) => a.key - b.key).map(({ cell }) => cell);
    function findNearbyPath(path, remaining) {
      if (path.length === CONSTELLATION_SIZE) return path;
      const current = path[path.length - 1];
      const candidates = shuffled(remaining.filter((cell) => Math.hypot(cell[0] - current[0], cell[1] - current[1]) <= 42));
      for (const next of candidates) {
        const result = findNearbyPath([...path, next], remaining.filter((cell) => cell !== next));
        if (result) return result;
      }
      return null;
    }
    const starts = shuffled(cells);
    let ordered = null;
    for (const start of starts) {
      ordered = findNearbyPath([start], cells.filter((cell) => cell !== start));
      if (ordered) break;
    }
    ordered ||= cells.slice(0, CONSTELLATION_SIZE);
    const points = ordered.map(([x, y]) => [
      x + (random() - .5) * 3.2,
      y + (random() - .5) * 5,
    ]);
    constellationLayouts.set(groupStart, points);
    return points;
  }
  function paceFromGap(gap) {
    if (!Number.isFinite(gap) || gap <= 0) return 0;
    return Math.max(0, Math.min(1.5, (1 / gap - .7) / 3.8));
  }
  function updateCreativeLayout(idx) {
    const layout = settings.lyricsLayout;
    const creative = isCreativeLayout(layout);
    if (creative) $("lines").style.transform = "none";
    const constellation = layout === "constellation" && idx >= 0;
    const groupStart = constellation ? Math.floor(idx / CONSTELLATION_SIZE) * CONSTELLATION_SIZE : -1;
    const template = constellation ? constellationLayout(groupStart) : null;
    lineEls.forEach((el, i) => {
      const relative = idx < 0 ? 99 : i - idx;
      el.dataset.slot = String(Math.max(-5, Math.min(5, relative)));
      if (constellation) {
        const constellationSlot = i - groupStart;
        const visible = constellationSlot >= 0 && constellationSlot < CONSTELLATION_SIZE && i <= idx;
        el.classList.toggle("creative-hidden", !visible);
        el.classList.toggle("constellation-current", i === idx);
        if (constellationSlot >= 0 && constellationSlot < CONSTELLATION_SIZE) {
          const point = template[constellationSlot];
          const lyricLength = (el.textContent || "").trim().length;
          el.style.setProperty("--node-x", point[0] + "%");
          el.style.setProperty("--node-y", point[1] + "%");
          el.style.setProperty("--node-font-scale", lyricLength > 52 ? ".29" : lyricLength > 36 ? ".33" : lyricLength > 24 ? ".38" : ".44");
        }
      } else {
        el.classList.remove("constellation-current");
        const visibleRange = layout === "kinetic" ? 1 : 0;
        el.classList.toggle("creative-hidden", creative && Math.abs(relative) > visibleRange);
      }
    });

    const path = $("constellationPath");
    const nodes = $("constellationNodes");
    if (!path || !nodes) return;
    if (layout !== "constellation" || idx < 0) {
      path.setAttribute("points", "");
      nodes.replaceChildren();
      return;
    }
    const visible = [];
    for (let i = groupStart; i <= idx && i < groupStart + CONSTELLATION_SIZE; i++) {
      if (!lineEls[i]) continue;
      visible.push({ current: i === idx, point: template[i - groupStart] });
    }
    path.setAttribute("points", visible.map(({ point }) => point[0] * 10 + "," + point[1] * 6).join(" "));
    nodes.replaceChildren(...visible.map(({ current, point }) => {
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", String(point[0] * 10));
      circle.setAttribute("cy", String(point[1] * 6));
      circle.setAttribute("r", current ? "5" : "3.5");
      if (current) circle.classList.add("current");
      return circle;
    }));
  }

  function frame(tNow) {
    requestAnimationFrame(frame);
    const fps = settings.performanceMode === "smooth" ? 60 : settings.performanceMode === "battery" ? 20 : 30;
    if (tNow - lastFrameT < 1000 / fps - 1) return;
    const dt = Math.max(0.001, Math.min(0.1, (tNow - lastFrameT) / 1000));
    lastFrameT = tNow;
    beatStep(tNow, dt);
    edgeFramePhase = (edgeFramePhase + dt * (.025 + lyricWordPace * .16 + motionEnergy * .045 + outLevel * .09 + dropFlash * .28)) % 1;
    root.style.setProperty("--edge-offset", (-1000 * edgeFramePhase).toFixed(1));

    const now = posSec + (playing ? (performance.now() - syncAt) / 1000 : 0);
    const t = now + offset;
    if (tNow - lastUiT >= 100) {
      lastUiT = tNow;
      const seekPercent = durSec ? Math.max(0, Math.min(100, (now / durSec) * 100)) : 0;
      $("fill").style.width = seekPercent + "%";
      $("bar").setAttribute("aria-valuemax", String(Math.round(durSec)));
      $("bar").setAttribute("aria-valuenow", String(Math.round(Math.max(0, Math.min(durSec, now)))));
      $("bar").setAttribute("aria-valuetext", fmt(Math.max(0, now)) + " of " + fmt(durSec));
      $("pos").textContent = fmt(now);
      $("homeScreen")?.style.setProperty("--home-progress", seekPercent.toFixed(2) + "%");
      document.querySelectorAll(".arcadeStageProgress,.homeCdProgress,.homeCdDisc,.homeStereoSeek").forEach((homeProgress) => {
        homeProgress.setAttribute("aria-valuemax", String(Math.round(durSec)));
        homeProgress.setAttribute("aria-valuenow", String(Math.round(Math.max(0, Math.min(durSec, now)))));
        homeProgress.setAttribute("aria-valuetext", fmt(Math.max(0, now)) + " of " + fmt(durSec));
      });
      if (typeof updateArcadeDialogue === "function") {
        const dialogueIndex = sourceLines.length ? window.LyricTiming.activeLyricIndex(sourceLines, t) : -1;
        updateArcadeDialogue(sourceLines[dialogueIndex], sourceLines[dialogueIndex + 1], dialogueIndex, sourceLines);
      }
    }

    let wordLife = 0, lineEmotion = 0, wordPaceTarget = 0;
    if (lines.length) {
      const idx = window.LyricTiming.activeLyricIndex(lines, t);

      if (idx !== activeIdx) {
        // tidy the line that was active before
        const old = lineEls[prevActive];
        if (old && prevActive !== idx) { old._w.spans.forEach((s) => s.classList.remove("cur", "nearL", "nearR")); old._w.cur = -1; }
        activeIdx = idx;
        prevActive = idx;
        document.body.classList.toggle("lyrics-waiting", idx < 0);
        const stackLayout = settings.lyricsLayout === "stack" || settings.lyricsLayout === "wordstack";
        const stackLines = Math.max(2, Math.min(6, Number(settings.lyricsHistoryLines) || 4));
        lineEls.forEach((el, i) => {
          el.classList.toggle("active", i === idx);
          el.classList.toggle("stack-hidden", stackLayout && idx >= 0 && (i > idx || i <= idx - stackLines));
          el.dataset.d = idx < 0 ? "4" : String(Math.min(Math.abs(i - idx), 4));
          el.dataset.side = idx < 0 ? "next" : i < idx ? "past" : i > idx ? "next" : "current";
        });
        updateCreativeLayout(idx);
        clearFit();
        const impactLayout = settings.lyricsLayout === "flash" || settings.lyricsLayout === "wordstream";
        const fitLayout = impactLayout || settings.lyricsLayout === "captioncards" ||
          settings.lyricsLayout === "monitorframe" || settings.lyricsLayout === "poster";
        if (isWordLayout() && idx >= 0) {
          const gap = Math.max(0.06, (lines[idx + 1]?.t || lines[idx].end || lines[idx].t + 0.25) - lines[idx].t);
          wordPaceTarget = paceFromGap(gap);
          const motion = settings.lyricsMotion || "slide";
          const factor = motion === "cube" ? 900 : motion === "glide" ? 850 : motion === "slide" ? 700 : 450;
          const min = motion === "cube" ? 120 : motion === "glide" ? 110 : motion === "slide" ? 75 : 55;
          const max = motion === "cube" ? 280 : motion === "glide" ? 320 : motion === "slide" ? 220 : 110;
          root.style.setProperty("--word-step-ms", Math.round(Math.max(min, Math.min(max, gap * factor))) + "ms");
        }
        if (fitLayout && settings.lyricsFit && idx >= 0) {
          fitLine(lineEls[idx], lines[idx].text);
        }
        lineEls.forEach((el) => el.classList.remove("flash", "word-hit", "line-arrive", "creative-arrive"));
        if (idx >= 0) {
          void lineEls[idx].offsetWidth;
          lineEls[idx].classList.add(isCreativeLayout() ? "creative-arrive" : "line-arrive");
        }
        if (idx >= 0 && impactLayout) {
          lineEls[idx].classList.add(settings.lyricsLayout === "wordstream" ? "word-hit" : "flash");
        }
        if (idx >= 0) {
          const focus = lineEls[idx];
          const stageH = $("stage").clientHeight;
          const focusY = stackLayout ? stageH * 0.7 : stageH / 2;
          if (!isCreativeLayout()) {
            $("lines").style.transform =
              "translateY(" + (focusY - (focus.offsetTop + focus.offsetHeight / 2)) + "px)";
          }
        }
      }

      if (idx >= 0) {
        const el = lineEls[idx];
        lineEmotion = Number(el.dataset.expression) || 0;
        const W = el._w;
        const start = lines[idx].t;
        const end = idx + 1 < lines.length ? lines[idx + 1].t : start + 4;
        if (isWordLayout()) wordPaceTarget = paceFromGap(Math.max(.06, end - start));
        // the line "finishes" a little before the next one starts so it reads as sung
        const span = Math.max(0.4, Math.min(end - start, 8) * 0.9);
        const p = clamp01((t - start) / span);
        const mode = document.body.dataset.hl || settings.lyricsHighlight;

        let curIdx = -1;
        for (let i = 0; i < W.spans.length; i++) {
          const pw = mode === "whole" ? 1
            : W.timed ? clamp01((t - W.wt[i]) / Math.max(0.06, W.we[i] - W.wt[i]))
            : clamp01((p - W.starts[i]) / (W.ends[i] - W.starts[i]));
          if (pw > 0 && pw < 1) wordLife = Math.max(wordLife, Math.sin(Math.PI * pw));
          if (pw > 0 && pw < 1) curIdx = i;
          const key = Math.round(pw * 200);
          if (W.cache[i] !== key) { W.cache[i] = key; W.spans[i].style.setProperty("--p", (pw * 100).toFixed(1) + "%"); }
        }
        const popIdx = mode === "word" ? curIdx : -1;
        if (W.cur !== popIdx) setPop(W, popIdx);
        if (!isWordLayout()) {
          const nextWord = curIdx >= 0 ? Number(W.wt?.[curIdx + 1]) : NaN;
          const thisWord = curIdx >= 0 ? Number(W.wt?.[curIdx]) : NaN;
          const fallbackGap = W.spans.length ? (end - start) / W.spans.length : 0;
          wordPaceTarget = paceFromGap(Number.isFinite(nextWord - thisWord) ? nextWord - thisWord : fallbackGap);
        }
      }
    }
    const wantedPace = playing ? wordPaceTarget : 0;
    lyricWordPace += (wantedPace - lyricWordPace) * (wantedPace > lyricWordPace ? .34 : .1);
    lyricMotionLife = wordLife;
    lyricMotionEmotion = lineEmotion;
    root.style.setProperty("--word-life", wordLife.toFixed(3));
    root.style.setProperty("--line-emotion", lineEmotion.toFixed(3));
  }

  window.addEventListener("resize", () => { activeIdx = -2; });


