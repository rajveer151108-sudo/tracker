// =====================================================================
  // Per-frame loop
  // =====================================================================
  let lastFrameT = performance.now(), lastUiT = 0;
  let edgeFramePhase = 0;
  const CONSTELLATION_SIZE = 16;
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
  function constellationLayout(groupStart, wordLengths = []) {
    const cacheKey = groupStart + ":" + wordLengths.join(",");
    if (constellationLayouts.has(cacheKey)) return constellationLayouts.get(cacheKey);
    const random = constellationRandom(groupStart + 31);
    const points = [];
    const boxes = [];
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const halfWidth = (index) => clamp(3.8 + (wordLengths[index] || 4) * .48, 5.2, 11.5);
    const fits = (x, y, index) => {
      const hw = halfWidth(index);
      return !boxes.some((box) => Math.abs(x - box.x) < hw + box.hw + 2.2 && Math.abs(y - box.y) < 9.2);
    };
    for (let index = 0; index < CONSTELLATION_SIZE; index++) {
      const previous = points[index - 1] || [48 + (random() - .5) * 8, 48 + (random() - .5) * 8];
      let chosen = null;
      // The reference grows from the last star. Try nearby positions first so
      // consecutive words stay readable without making the viewer hunt.
      for (let attempt = 0; attempt < 100 && !chosen; attempt++) {
        const angle = random() * Math.PI * 2;
        const radiusX = 10 + random() * 15;
        const radiusY = 8 + random() * 12;
        const x = clamp(previous[0] + Math.cos(angle) * radiusX, 18, 82);
        const y = clamp(previous[1] + Math.sin(angle) * radiusY, 19, 81);
        if (fits(x, y, index)) chosen = [x, y];
      }
      // Dense final words use a compact fallback grid, selected by distance
      // from the last word. Lines may cross; lyric boxes never do.
      if (!chosen) {
        const candidates = [];
        for (let y = 20; y <= 80; y += 10) for (let x = 19; x <= 81; x += 9) {
          if (fits(x, y, index)) candidates.push([x, y]);
        }
        candidates.sort((a, b) => Math.hypot(a[0] - previous[0], a[1] - previous[1]) - Math.hypot(b[0] - previous[0], b[1] - previous[1]));
        chosen = candidates[Math.min(candidates.length - 1, Math.floor(random() * Math.min(4, candidates.length)))] || [50, 50];
      }
      points.push(chosen);
      boxes.push({ x: chosen[0], y: chosen[1], hw: halfWidth(index) });
    }
    constellationLayouts.set(cacheKey, points);
    return points;
  }
  function paceFromGap(gap) {
    if (!Number.isFinite(gap) || gap <= 0) return 0;
    return Math.max(0, Math.min(1.5, (1 / gap - .7) / 3.8));
  }
  function starPath(cx, cy, outer, inner = outer * .44, points = 5) {
    const vertices = [];
    for (let i = 0; i < points * 2; i++) {
      const angle = -Math.PI / 2 + i * Math.PI / points;
      const radius = i % 2 ? inner : outer;
      vertices.push((cx + Math.cos(angle) * radius).toFixed(2) + "," + (cy + Math.sin(angle) * radius).toFixed(2));
    }
    return "M" + vertices.join(" L") + " Z";
  }
  function updateCreativeLayout(idx) {
    const layout = settings.lyricsLayout;
    const creative = isCreativeLayout(layout);
    if (creative) $("lines").style.transform = "none";
    const constellation = layout === "constellation" && idx >= 0;
    const groupStart = constellation ? Math.floor(idx / CONSTELLATION_SIZE) * CONSTELLATION_SIZE : -1;
    const constellationLengths = constellation
      ? lineEls.slice(groupStart, groupStart + CONSTELLATION_SIZE).map((el) => (el?.textContent || "").trim().length)
      : [];
    const template = constellation ? constellationLayout(groupStart, constellationLengths) : null;
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
          el.style.setProperty("--node-font-scale", lyricLength > 52 ? ".25" : lyricLength > 36 ? ".29" : lyricLength > 24 ? ".33" : ".38");
        }
      } else {
        el.classList.remove("constellation-current");
        const visible = layout === "buildstack"
          ? relative <= 0 && relative >= -3
          : Math.abs(relative) <= (layout === "prism" || layout === "ribbon" ? 2
            : layout === "morphstack" || layout === "kinetic" || layout === "splitstage" ? 1 : 0);
        el.classList.toggle("creative-hidden", creative && !visible);
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
      const star = document.createElementNS("http://www.w3.org/2000/svg", "path");
      star.classList.add("constellation-star");
      star.setAttribute("d", starPath(point[0] * 10, point[1] * 6, current ? 8.5 : 5.4));
      if (current) star.classList.add("current");
      return star;
    }));
  }

  function frame(tNow) {
    requestAnimationFrame(frame);
    const requestedFps = settings.performanceMode === "smooth" ? 60 : settings.performanceMode === "battery" ? 20 : 30;
    // Keep full fidelity while music and the visible experience need it. A
    // paused or hidden window has no new audio/lyric information, so waking
    // the renderer 60 times a second only creates heat.
    const fps = document.hidden ? 10 : playing ? requestedFps : Math.min(15, requestedFps);
    if (tNow - lastFrameT < 1000 / fps - 1) return;
    const dt = Math.max(0.001, Math.min(0.1, (tNow - lastFrameT) / 1000));
    lastFrameT = tNow;
    beatStep(tNow, dt);
    if (document.body.dataset.view === "lyrics") {
      edgeFramePhase = (edgeFramePhase + dt * (.025 + lyricWordPace * .16 + motionEnergy * .045 + outLevel * .09 + dropFlash * .28)) % 1;
      root.style.setProperty("--edge-offset", (-1000 * edgeFramePhase).toFixed(1));
    }

    const now = posSec + (playing ? (performance.now() - syncAt) / 1000 : 0);
    const t = now + offset;
    if ((settings.directorMode || settings.songPresetsEnabled) && typeof updateVisualAutomationPerformance === "function") {
      const directorLineIndex = sourceLines.length ? window.LyricTiming.activeLyricIndex(sourceLines, t) : -1;
      const lyricContext = window.VisualScenes.lyricDirectorContext(sourceLines, directorLineIndex, t, durSec);
      updateVisualAutomationPerformance({
        energy: motionEnergy,
        vocal: motionVocal,
        phrase: motionPhrase,
        build: motionBuild,
        duck: motionDuck,
        drop: dropFlash,
        impact: outLevel,
        pace: Math.max(lyricWordPace, lyricContext.pace),
        wpm: lyricContext.wpm,
        density: lyricContext.density,
        flow: lyricContext.flow,
        timingConfidence: lyricContext.timingConfidence,
        vocalGap: lyricContext.vocalGap,
        lineActive: lyricContext.lineActive,
        wordSustain: lyricWordSustain * lyricTimingConfidence,
        nextWpm: lyricContext.nextWpm,
        nextPace: lyricContext.nextPace,
        nextDensity: lyricContext.nextDensity,
        nextGap: lyricContext.nextGap,
        paceTrend: lyricContext.paceTrend,
        forecastFlow: lyricContext.forecastFlow,
        boundaryIn: lyricContext.boundaryIn,
        hook: lyricContext.hook,
        progress: lyricContext.progress,
        structure: structureContrast,
        timbreShift: structureTimbreShift,
        switchUp: structureSwitchUp,
        switchDown: structureSwitchDown,
        productionSwitch: structureProductionSwitch,
        switchConfidence: structureSwitchConfidence,
        arrangementLift: structureArrangementLift,
        timbreEvidence: structureTimbreEvidence,
        loudnessEvidence: structureLoudnessEvidence,
        lowActivity: structureLowActivity,
        quietHold: structureQuietHold,
        quietConfidence: structureQuietConfidence,
        reentry: structureReentry,
        loudnessTrend: audioLoudnessTrend,
        vocalTrend: audioVocalTrend,
        vocalLayering: audioVocalLayering,
        beatConfidence: audioBeatConfidence,
        bpm: audioBpm,
        bass: audioBassLevel,
        flux: audioFluxLevel,
        drumChange: audioDrumChange,
        harmonyChange: audioHarmonyChange,
        productionAgreement: audioProductionAgreement,
        tonality: audioTonality,
        onsetDensity: audioOnsetDensity,
        emotion: lyricMotionEmotion,
        audioConfidence: settings.beat && beatOn ? .82 + audioBeatConfidence * .18 : 0,
        audioActive: settings.beat && beatOn,
        hasLyrics: lyricContext.hasLyrics,
        lineIndex: directorLineIndex,
        wordIndex: lyricContext.wordIndex,
        lyricLayers: lyricContext.layeredVocals,
      }, tNow);
    }
    if (tNow - lastUiT >= 100) {
      lastUiT = tNow;
      const seekPercent = durSec ? Math.max(0, Math.min(100, (now / durSec) * 100)) : 0;
      $("fill").style.width = seekPercent + "%";
      $("bar").setAttribute("aria-valuemax", String(Math.round(durSec)));
      $("bar").setAttribute("aria-valuenow", String(Math.round(Math.max(0, Math.min(durSec, now)))));
      $("bar").setAttribute("aria-valuetext", fmt(Math.max(0, now)) + " of " + fmt(durSec));
      $("pos").textContent = fmt(now);
      $("homeScreen")?.style.setProperty("--home-progress", seekPercent.toFixed(2) + "%");
      if (document.body.dataset.view === "home") document.querySelectorAll(".arcadeStageProgress,.homeCdProgress,.homeCdDisc,.homeStereoSeek").forEach((homeProgress) => {
          homeProgress.setAttribute("aria-valuemax", String(Math.round(durSec)));
          homeProgress.setAttribute("aria-valuenow", String(Math.round(Math.max(0, Math.min(durSec, now)))));
          homeProgress.setAttribute("aria-valuetext", fmt(Math.max(0, now)) + " of " + fmt(durSec));
        });
      if (document.body.dataset.view === "home" && typeof updateArcadeDialogue === "function") {
        const dialogueIndex = sourceLines.length ? window.LyricTiming.activeLyricIndex(sourceLines, t) : -1;
        updateArcadeDialogue(sourceLines[dialogueIndex], sourceLines[dialogueIndex + 1], dialogueIndex, sourceLines);
      }
    }

    let wordLife = 0, wordAttack = 0, wordSustain = 0, timingConfidence = 0, lineEmotion = 0, wordPaceTarget = 0;
    if (document.body.dataset.view === "lyrics" && lines.length) {
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
        const buildStack = settings.lyricsLayout === "buildstack";
        lineEls.forEach((el, i) => {
          el.classList.toggle("active", i === idx);
          el.classList.toggle("stack-hidden", stackLayout && idx >= 0 && (i > idx || i <= idx - stackLines));
          el.dataset.d = idx < 0 ? "4" : String(Math.min(Math.abs(i - idx), 4));
          el.dataset.side = idx < 0 ? "next" : i < idx ? "past" : i > idx ? "next" : "current";
          if (buildStack) {
            el._w.spans.forEach((span, wordIndex) => {
              span.classList.remove("revealed", "build-enter");
              const revealed = idx >= 0 && i < idx;
              span.classList.toggle("revealed", revealed);
              el._w.revealed[wordIndex] = revealed;
            });
          }
          if (el._w.emojiSpan) el._w.emojiSpan.classList.toggle("word-revealed", idx >= 0 && i < idx);
        });
        updateCreativeLayout(idx);
        clearFit();
        const impactLayout = settings.lyricsLayout === "flash" || settings.lyricsLayout === "wordstream";
        const fitLayout = impactLayout || settings.lyricsLayout === "captioncards" || settings.lyricsLayout === "poster";
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
        timingConfidence = W.timed && !(lines[idx].words || []).some((word) => word.estimated) ? 1 : .58;
        const start = lines[idx].t;
        const end = idx + 1 < lines.length ? lines[idx + 1].t : start + 4;
        if (isWordLayout()) wordPaceTarget = paceFromGap(Math.max(.06, end - start));
        // the line "finishes" a little before the next one starts so it reads as sung
        const span = Math.max(0.4, Math.min(end - start, 8) * 0.9);
        const p = clamp01((t - start) / span);
        const buildStack = settings.lyricsLayout === "buildstack";
        const mode = buildStack ? "word" : (document.body.dataset.hl || settings.lyricsHighlight);

        let curIdx = -1;
        for (let i = 0; i < W.spans.length; i++) {
          const rawPw = W.timed ? clamp01((t - W.wt[i]) / Math.max(0.06, W.we[i] - W.wt[i]))
            : clamp01((p - W.starts[i]) / (W.ends[i] - W.starts[i]));
          const pw = mode === "whole" ? 1 : rawPw;
          if (pw > 0 && pw < 1) wordLife = Math.max(wordLife, Math.sin(Math.PI * pw));
          if (rawPw > 0 && rawPw < 1) {
            wordAttack = Math.max(wordAttack, Math.exp(-rawPw * 8));
            wordSustain = Math.max(wordSustain, Math.sin(Math.PI * rawPw));
          }
          if (pw > 0 && pw < 1) curIdx = i;
          const key = Math.round(pw * 200);
          if (W.cache[i] !== key) { W.cache[i] = key; W.spans[i].style.setProperty("--p", (pw * 100).toFixed(1) + "%"); }
          if (buildStack) {
            const revealed = pw > 0;
            if (revealed && !W.revealed[i]) {
              W.spans[i].classList.remove("build-enter");
              void W.spans[i].offsetWidth;
              W.spans[i].classList.add("build-enter");
            }
            W.spans[i].classList.toggle("revealed", revealed);
            W.revealed[i] = revealed;
          }
          if (W.emojiSpan && i === W.emojiWordIndex) W.emojiSpan.classList.toggle("word-revealed", rawPw > 0);
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
    lyricWordAttack += (wordAttack - lyricWordAttack) * (wordAttack > lyricWordAttack ? .62 : .2);
    lyricWordSustain += (wordSustain - lyricWordSustain) * (wordSustain > lyricWordSustain ? .38 : .14);
    lyricTimingConfidence = timingConfidence;
    root.style.setProperty("--word-life", wordLife.toFixed(3));
    root.style.setProperty("--line-emotion", lineEmotion.toFixed(3));
  }

  window.addEventListener("resize", () => { activeIdx = -2; refreshLyricBoxSizing(); });


