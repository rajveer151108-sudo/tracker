  const edge = document.getElementById("edge");
  const glowbox = document.getElementById("glowbox");
  const ringwrap = document.getElementById("ringwrap");
  const spin = document.getElementById("spin");

  const parse = (s) => String(s).split(",").map((n) => Number(n.trim()) || 0);
  let targetA = [29, 185, 84], targetB = [29, 185, 84];
  let curA = targetA.slice(), curB = targetB.slice();
  let style = "steady", thick = 1, strength = 1;
  let beatTarget = 0, beat = 0, energyTarget = 0, energy = 0, vocalTarget = 0, vocal = 0, liftTarget = 0, lift = 0, wordTarget = 0, word = 0;
  let lastShadow = "", lastRing = "";

  function layout() {
    ringwrap.style.display = style === "steady" ? "none" : "block";
    spin.className = style === "steady" ? "" : style;
    ringwrap.style.setProperty("--rb", Math.round(22 * thick) + "px");
    ringwrap.style.setProperty("--rt", Math.round(14 * thick) + "px");
  }

  window.overlay.onGlow(({ color, color2, on, strength: st, thickness, style: sty }) => {
    targetA = parse(color); targetB = parse(color2 || color);
    strength = (st == null ? 100 : st) / 100;
    thick = (thickness == null ? 100 : thickness) / 100;
    style = sty || "steady";
    edge.classList.toggle("on", !!on);
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
  });

  function render() {
    for (let i = 0; i < 3; i++) {                       // colours glide toward their targets
      curA[i] += (targetA[i] - curA[i]) * 0.04;
      curB[i] += (targetB[i] - curB[i]) * 0.04;
    }
    beat += (beatTarget - beat) * 0.5;                  // quick attack, quick release
    energy += (energyTarget - energy) * (energyTarget > energy ? 0.35 : 0.13);
    vocal += (vocalTarget - vocal) * (vocalTarget > vocal ? 0.24 : 0.10);
    lift += (liftTarget - lift) * (liftTarget > lift ? 0.2 : 0.08);
    word += (wordTarget - word) * 0.22;
    const A = curA.map(Math.round).join(", "), B = curB.map(Math.round).join(", ");

    // soft inner glow (weaker when the moving light is on, so it stands out)
    const soft = style === "steady" ? 1 : 0.45;
    const phraseGlow = word * vocal;
    const a1 = Math.min(1, (0.32 + 0.24 * energy + 0.20 * vocal + 0.25 * beat + 0.12 * lift + 0.14 * phraseGlow) * strength * soft).toFixed(2);
    const a2 = Math.min(1, (0.14 + 0.18 * energy + 0.12 * vocal + 0.16 * beat + 0.10 * lift + 0.08 * phraseGlow) * strength * soft).toFixed(2);
    const b1 = Math.round((58 + 34 * energy + 38 * beat + 24 * lift) * thick);
    const s1 = Math.round((4 + 18 * energy + 22 * beat + 12 * vocal) * thick);
    const b2 = Math.round((160 + 70 * energy + 70 * beat + 45 * lift) * thick);
    const s2 = Math.round((22 + 34 * energy + 42 * beat + 24 * vocal) * thick);
    const shadow = "inset 0 0 " + b1 + "px " + s1 + "px rgba(" + A + ", " + a1 + "), " +
                   "inset 0 0 " + b2 + "px " + s2 + "px rgba(" + B + ", " + a2 + ")";
    if (shadow !== lastShadow) { lastShadow = shadow; glowbox.style.boxShadow = shadow; }

    if (style !== "steady") {
      const grad = style === "comet"
        ? "conic-gradient(rgba(" + B + ",0) 0deg, rgba(" + B + ",0) 190deg, rgba(" + B + ",.9) 300deg, rgba(" + A + ",1) 352deg, rgba(" + A + ",0) 360deg)"
        : "conic-gradient(rgba(" + A + ",1), rgba(" + B + ",1) 50%, rgba(" + A + ",1))";
      if (grad !== lastRing) { lastRing = grad; spin.style.background = grad; }
      ringwrap.style.opacity = Math.min(1, (0.45 + 0.26 * energy + 0.22 * beat + 0.12 * lift) * Math.min(1.2, strength)).toFixed(2);
      const baseSpeed = style === "comet" ? 5 : 9;
      spin.style.animationDuration = Math.max(2.4, baseSpeed - energy * 1.8 - lift * 1.4 - beat) + "s";
    }
    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
