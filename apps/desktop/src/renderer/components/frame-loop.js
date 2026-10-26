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
    $("fill").style.width = durSec ? Math.min(100, (now / durSec) * 100) + "%" : "0%";
    $("pos").textContent = fmt(now);

    if (lines.length) {
      let idx = -1;
      for (let i = 0; i < lines.length; i++) { if (lines[i].t <= t) idx = i; else break; }

      if (idx !== activeIdx) {
        // tidy the line that was active before
        const old = lineEls[prevActive];
        if (old && prevActive !== idx) { old._w.spans.forEach((s) => s.classList.remove("cur", "nearL", "nearR")); old._w.cur = -1; }
        activeIdx = idx;
        prevActive = idx;
        lineEls.forEach((el, i) => {
          el.classList.toggle("active", i === idx);
          el.dataset.d = Math.min(Math.abs(i - Math.max(idx, 0)), 4);
        });
        clearFit();
        if (settings.lyricsLayout === "flash" && settings.lyricsFit) {
          const fi = Math.max(idx, 0);
          fitLine(lineEls[fi], lines[fi].text);
        }
        lineEls.forEach((el) => el.classList.remove("flash"));
        if (idx >= 0 && settings.lyricsLayout === "flash") {
          void lineEls[idx].offsetWidth;            // restart the animation
          lineEls[idx].classList.add("flash");
        }
        const focus = lineEls[Math.max(idx, 0)];
        const stageH = $("stage").clientHeight;
        $("lines").style.transform =
          "translateY(" + (stageH / 2 - (focus.offsetTop + focus.offsetHeight / 2)) + "px)";
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


