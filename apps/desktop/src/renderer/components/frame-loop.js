// =====================================================================
  // Per-frame loop
  // =====================================================================
  let lastFrameT = performance.now(), lastUiT = 0;
  const CONSTELLATION_POINTS = [
    [12, 23], [27, 72], [41, 34], [57, 78], [50, 50], [69, 27], [84, 61], [91, 18], [77, 84],
  ];
  function updateCreativeLayout(idx) {
    const layout = settings.lyricsLayout;
    const creative = isCreativeLayout(layout);
    if (creative) $("lines").style.transform = "none";
    lineEls.forEach((el, i) => {
      const relative = idx < 0 ? 99 : i - idx;
      el.dataset.slot = String(Math.max(-5, Math.min(5, relative)));
      el.classList.toggle("creative-hidden", creative && Math.abs(relative) > (layout === "constellation" || layout === "orbit" ? 4 : 2));
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
    for (let slot = -4; slot <= 4; slot++) {
      const line = lineEls[idx + slot];
      if (!line) continue;
      const point = CONSTELLATION_POINTS[slot + 4];
      line.style.setProperty("--node-x", point[0] + "%");
      line.style.setProperty("--node-y", point[1] + "%");
      visible.push({ slot, point });
    }
    path.setAttribute("points", visible.map(({ point }) => point[0] * 10 + "," + point[1] * 6).join(" "));
    nodes.replaceChildren(...visible.map(({ slot, point }) => {
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", String(point[0] * 10));
      circle.setAttribute("cy", String(point[1] * 6));
      circle.setAttribute("r", slot === 0 ? "9" : "4");
      if (slot === 0) circle.classList.add("current");
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

    let wordLife = 0, lineEmotion = 0;
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
        const impactLayout = settings.lyricsLayout === "flash" || settings.lyricsLayout === "wordstream" ||
          settings.lyricsLayout === "captioncards" || settings.lyricsLayout === "poster";
        if (isWordLayout() && idx >= 0) {
          const gap = Math.max(0.06, (lines[idx + 1]?.t || lines[idx].end || lines[idx].t + 0.25) - lines[idx].t);
          const motion = settings.lyricsMotion || "slide";
          const factor = motion === "cube" ? 900 : motion === "glide" ? 850 : motion === "slide" ? 700 : 450;
          const min = motion === "cube" ? 120 : motion === "glide" ? 110 : motion === "slide" ? 75 : 55;
          const max = motion === "cube" ? 280 : motion === "glide" ? 320 : motion === "slide" ? 220 : 110;
          root.style.setProperty("--word-step-ms", Math.round(Math.max(min, Math.min(max, gap * factor))) + "ms");
        }
        if (impactLayout && settings.lyricsFit && idx >= 0) {
          fitLine(lineEls[idx], lines[idx].text);
        }
        lineEls.forEach((el) => el.classList.remove("flash", "word-hit", "line-arrive"));
        if (idx >= 0) {
          void lineEls[idx].offsetWidth;
          lineEls[idx].classList.add("line-arrive");
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
      }
    }
    lyricMotionLife = wordLife;
    lyricMotionEmotion = lineEmotion;
    root.style.setProperty("--word-life", wordLife.toFixed(3));
    root.style.setProperty("--line-emotion", lineEmotion.toFixed(3));
  }

  window.addEventListener("resize", () => { activeIdx = -2; });


