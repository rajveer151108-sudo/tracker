  const edge = document.getElementById("edge");
  const glowbox = document.getElementById("glowbox");
  const ringwrap = document.getElementById("ringwrap");
  const spin = document.getElementById("spin");
  const frame = document.getElementById("frame");
  const frameSpark = frame.querySelector(".spark");
  const frameSparkTwin = frame.querySelector(".spark2");

  const parse = (s) => String(s).split(",").map((n) => Number(n.trim()) || 0);
  let targetA = [29, 185, 84], targetB = [29, 185, 84];
  let curA = targetA.slice(), curB = targetB.slice();
  let style = "steady", thick = 1, strength = 1, trackSpeed = 9;
  let beatTarget = 0, beat = 0, energyTarget = 0, energy = 0, vocalTarget = 0, vocal = 0, liftTarget = 0, lift = 0, wordTarget = 0, word = 0, paceTarget = 0, pace = 0;
  let buildTarget = 0, build = 0, duckTarget = 0, duck = 0, dropTarget = 0, drop = 0, emotionTarget = 0, emotion = 0;
  let lastShadow = "", lastRing = "";
  let enabled = false, frameMs = 33, lastFrameT = 0, framePhase = 0;

  function layout() {
    ringwrap.style.display = style === "rotate" || style === "comet" ? "block" : "none";
    const frameStyle = style === "frame" || style === "orbitline" || style === "twinline";
    frame.style.display = frameStyle ? "block" : "none";
    frame.dataset.mode = style;
    spin.className = style === "rotate" || style === "comet" ? style : "";
    ringwrap.style.setProperty("--rb", Math.round(22 * thick) + "px");
    ringwrap.style.setProperty("--rt", Math.round(14 * thick) + "px");
  }

  window.overlay.onGlow(({ color, color2, on, strength: st, thickness, style: sty, speed, performance: perf }) => {
    targetA = parse(color); targetB = parse(color2 || color);
    strength = (st == null ? 100 : st) / 100;
    thick = (thickness == null ? 100 : thickness) / 100;
    style = sty || "steady";
    trackSpeed = Math.max(2, Math.min(24, Number(speed) || 9));
    enabled = !!on;
    // Full-screen transparent shadows are the hottest visual in the app. They
    // remain fluid at 24fps; CSS and temporal smoothing fill the gaps.
    frameMs = perf === "smooth" ? 17 : perf === "battery" ? 67 : 42;
    edge.classList.toggle("on", enabled);
    layout();
  });
  window.overlay.onBeat((motion) => {
    if (typeof motion === "number") {
      beatTarget = Math.max(0, Math.min(1.5, motion));
      return;
    }
    beatTarget = Math.max(0, Math.min(1.5, motion?.impact || 0));
    energyTarget = Math.max(0, Math.min(1.5, motion?.energy || 0));
    vocalTarget = Math.max(0, Math.min(1.5, motion?.vocal || 0));
    liftTarget = Math.max(0, Math.min(1.5, motion?.lift || 0));
    wordTarget = Math.max(0, Math.min(1, motion?.word || 0));
    paceTarget = Math.max(0, Math.min(1.5, motion?.pace || 0));
    buildTarget = Math.max(0, Math.min(1.5, motion?.build || 0));
    duckTarget = Math.max(0, Math.min(1.5, motion?.duck || 0));
    dropTarget = Math.max(0, Math.min(1.5, motion?.drop || 0));
    emotionTarget = Math.max(0, Math.min(1.5, motion?.emotion || 0));
  });

  function render(tNow) {
    requestAnimationFrame(render);
    const wantedMs = enabled ? frameMs : 250;
    if (tNow - lastFrameT < wantedMs - 1) return;
    const elapsed = lastFrameT ? tNow - lastFrameT : wantedMs;
    lastFrameT = tNow;
    const frames = Math.max(1, elapsed / 16.67);
    const step = (base) => 1 - Math.pow(1 - base, frames);
    for (let i = 0; i < 3; i++) {                       // colours glide toward their targets
      curA[i] += (targetA[i] - curA[i]) * step(0.04);
      curB[i] += (targetB[i] - curB[i]) * step(0.04);
    }
    beat += (beatTarget - beat) * step(0.5);                  // quick attack, quick release
    energy += (energyTarget - energy) * step(energyTarget > energy ? 0.35 : 0.13);
    vocal += (vocalTarget - vocal) * step(vocalTarget > vocal ? 0.24 : 0.10);
    lift += (liftTarget - lift) * step(liftTarget > lift ? 0.2 : 0.08);
    word += (wordTarget - word) * step(0.22);
    pace += (paceTarget - pace) * step(paceTarget > pace ? 0.24 : 0.09);
    build += (buildTarget - build) * step(buildTarget > build ? 0.16 : 0.08);
    duck += (duckTarget - duck) * step(duckTarget > duck ? 0.45 : 0.16);
    drop += (dropTarget - drop) * step(dropTarget > drop ? 0.65 : 0.18);
    emotion += (emotionTarget - emotion) * step(emotionTarget > emotion ? 0.18 : 0.08);
    const A = curA.map(Math.round).join(", "), B = curB.map(Math.round).join(", ");

    // soft inner glow (weaker when the moving light is on, so it stands out)
    const edgeLine = style === "orbitline" || style === "twinline";
    const soft = style === "steady" ? 1 : style === "frame" ? 0.22 : edgeLine ? 0.1 : 0.45;
    const phraseGlow = word * vocal;
    const a1 = Math.max(0, Math.min(1, (0.28 + 0.2 * energy + 0.16 * vocal + 0.18 * beat + 0.1 * lift +
      0.16 * build + 0.52 * drop + 0.2 * emotion + 0.12 * phraseGlow - 0.32 * duck) * strength * soft)).toFixed(2);
    const a2 = Math.max(0, Math.min(1, (0.12 + 0.14 * energy + 0.09 * vocal + 0.12 * beat + 0.08 * lift +
      0.1 * build + 0.34 * drop + 0.12 * emotion + 0.06 * phraseGlow - 0.2 * duck) * strength * soft)).toFixed(2);
    const b1 = Math.round((58 + 28 * energy + 32 * beat + 18 * lift + 28 * build + 72 * drop + 24 * emotion) * thick);
    const s1 = Math.round((4 + 14 * energy + 18 * beat + 10 * vocal + 18 * build + 46 * drop + 18 * emotion) * thick);
    const b2 = Math.round((150 + 58 * energy + 58 * beat + 36 * lift + 42 * build + 120 * drop + 42 * emotion) * thick);
    const s2 = Math.round((20 + 28 * energy + 34 * beat + 20 * vocal + 28 * build + 72 * drop + 28 * emotion) * thick);
    const shadow = "inset 0 0 " + b1 + "px " + s1 + "px rgba(" + A + ", " + a1 + "), " +
                   "inset 0 0 " + b2 + "px " + s2 + "px rgba(" + B + ", " + a2 + ")";
    if (shadow !== lastShadow) { lastShadow = shadow; glowbox.style.boxShadow = shadow; }

    if (style === "rotate" || style === "comet") {
      const grad = style === "comet"
        ? "conic-gradient(rgba(" + B + ",0) 0deg, rgba(" + B + ",0) 190deg, rgba(" + B + ",.9) 300deg, rgba(" + A + ",1) 352deg, rgba(" + A + ",0) 360deg)"
        : "conic-gradient(rgba(" + A + ",1), rgba(" + B + ",1) 50%, rgba(" + A + ",1))";
      if (grad !== lastRing) { lastRing = grad; spin.style.background = grad; }
      ringwrap.style.opacity = Math.max(0, Math.min(1, (0.38 + 0.2 * energy + 0.16 * beat + 0.1 * lift +
        0.18 * build + 0.55 * drop + 0.16 * emotion - 0.3 * duck) * Math.min(1.2, strength))).toFixed(2);
      const baseSpeed = style === "comet" ? 5 : 9;
      spin.style.animationDuration = Math.max(2.4, baseSpeed - energy * 1.8 - lift * 1.4 - beat) + "s";
    }
    if (style === "frame" || edgeLine) {
      frame.style.setProperty("--frame-a", A);
      frame.style.setProperty("--frame-bc", B);
      frame.style.setProperty("--frame-o", Math.max(edgeLine ? .05 : .2, Math.min(1, (.34 + energy * .18 + vocal * .27 + beat * .13 + drop * .35 - duck * .24) * strength)).toFixed(2));
      frame.style.setProperty("--frame-w", Math.max(1.5, ((edgeLine ? 3.2 : 2.2) + vocal * 1.2 + beat * .7) * thick).toFixed(1) + "px");
      frame.style.setProperty("--frame-b", Math.round((10 + vocal * 22 + energy * 10 + drop * 28) * thick) + "px");
      const frameDash = Math.round(edgeLine ? 72 + pace * 24 + vocal * 18 : 42 + vocal * 65 + word * 28);
      frameSpark.style.strokeDasharray = frameDash + " " + (1000 - frameDash);
      frameSparkTwin.style.strokeDasharray = frameDash + " " + (1000 - frameDash);
      const frameRate = edgeLine
        ? 1 / trackSpeed + pace * .08 + energy * .035 + beat * .06 + drop * .15
        : .025 + pace * .16 + energy * .045 + beat * .09 + drop * .28;
      framePhase = (framePhase + elapsed / 1000 * frameRate) % 1;
      frame.style.setProperty("--frame-offset", String(Math.round(-1000 * framePhase)));
      frame.style.setProperty("--frame-offset-twin", String(Math.round(-1000 * ((framePhase + .5) % 1))));
    }
  }
  requestAnimationFrame(render);
