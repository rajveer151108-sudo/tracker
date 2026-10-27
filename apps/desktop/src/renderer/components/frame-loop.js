// =====================================================================
  // Per-frame loop
  // =====================================================================
  let lastFrameT = performance.now();
  function frame(tNow) {
    const dt = Math.max(0.001, Math.min(0.1, (tNow - lastFrameT) / 1000));
    lastFrameT = tNow;
    beatStep(tNow, dt);

    const now = posSec + (playing ? (performance.now() - syncAt) / 1000 : 0);
    const t = now + offset;
    const seekPercent = durSec ? Math.max(0, Math.min(100, (now / durSec) * 100)) : 0;
    $("fill").style.width = seekPercent + "%";
    $("bar").setAttribute("aria-valuemax", String(Math.round(durSec)));
    $("bar").setAttribute("aria-valuenow", String(Math.round(Math.max(0, Math.min(durSec, now)))));
    $("bar").setAttribute("aria-valuetext", fmt(Math.max(0, now)) + " of " + fmt(durSec));
    $("pos").textContent = fmt(now);

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
        clearFit();
        const impactLayout = settings.lyricsLayout === "flash" || settings.lyricsLayout === "wordstream";
        if ((settings.lyricsLayout === "wordstream" || settings.lyricsLayout === "wordstack") && idx >= 0) {
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
        lineEls.forEach((el) => el.classList.remove("flash", "word-hit"));
        if (idx >= 0 && impactLayout) {
          void lineEls[idx].offsetWidth;            // restart the animation
          lineEls[idx].classList.add(settings.lyricsLayout === "wordstream" ? "word-hit" : "flash");
        }
        if (idx >= 0) {
          const focus = lineEls[idx];
          const stageH = $("stage").clientHeight;
          const focusY = stackLayout ? stageH * 0.7 : stageH / 2;
          $("lines").style.transform =
            "translateY(" + (focusY - (focus.offsetTop + focus.offsetHeight / 2)) + "px)";
        }
      }

      if (idx >= 0) {
        const el = lineEls[idx];
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
          if (pw > 0 && pw < 1) curIdx = i;
          const key = Math.round(pw * 200);
          if (W.cache[i] !== key) { W.cache[i] = key; W.spans[i].style.setProperty("--p", (pw * 100).toFixed(1) + "%"); }
        }
        const popIdx = mode === "word" ? curIdx : -1;
        if (W.cur !== popIdx) setPop(W, popIdx);
      }
    }
    requestAnimationFrame(frame);
  }

  window.addEventListener("resize", () => { activeIdx = -2; });


