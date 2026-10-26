  const edge = document.getElementById("edge");
  const glowbox = document.getElementById("glowbox");
  const ringwrap = document.getElementById("ringwrap");
  const spin = document.getElementById("spin");

  const parse = (s) => String(s).split(",").map((n) => Number(n.trim()) || 0);
  let targetA = [29, 185, 84], targetB = [29, 185, 84];
  let curA = targetA.slice(), curB = targetB.slice();
  let style = "steady", thick = 1, strength = 1;
  let beatTarget = 0, beat = 0;
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
  window.overlay.onBeat((v) => { beatTarget = Math.max(0, Math.min(1.5, v)); });

  function render() {
    for (let i = 0; i < 3; i++) {                       // colours glide toward their targets
      curA[i] += (targetA[i] - curA[i]) * 0.04;
      curB[i] += (targetB[i] - curB[i]) * 0.04;
    }
    beat += (beatTarget - beat) * 0.5;                  // quick attack, quick release
    const A = curA.map(Math.round).join(", "), B = curB.map(Math.round).join(", ");

    // soft inner glow (weaker when the moving light is on, so it stands out)
    const soft = style === "steady" ? 1 : 0.45;
    const a1 = Math.min(1, (0.55 + 0.30 * beat) * strength * soft).toFixed(2);
    const a2 = Math.min(1, (0.25 + 0.20 * beat) * strength * soft).toFixed(2);
    const b1 = Math.round((70 + 40 * beat) * thick), s1 = Math.round((6 + 26 * beat) * thick);
    const b2 = Math.round((200 + 80 * beat) * thick), s2 = Math.round((30 + 50 * beat) * thick);
    const shadow = "inset 0 0 " + b1 + "px " + s1 + "px rgba(" + A + ", " + a1 + "), " +
                   "inset 0 0 " + b2 + "px " + s2 + "px rgba(" + B + ", " + a2 + ")";
    if (shadow !== lastShadow) { lastShadow = shadow; glowbox.style.boxShadow = shadow; }

    if (style !== "steady") {
      const grad = style === "comet"
        ? "conic-gradient(rgba(" + B + ",0) 0deg, rgba(" + B + ",0) 190deg, rgba(" + B + ",.9) 300deg, rgba(" + A + ",1) 352deg, rgba(" + A + ",0) 360deg)"
        : "conic-gradient(rgba(" + A + ",1), rgba(" + B + ",1) 50%, rgba(" + A + ",1))";
      if (grad !== lastRing) { lastRing = grad; spin.style.background = grad; }
      ringwrap.style.opacity = Math.min(1, (0.7 + 0.3 * beat) * Math.min(1.2, strength)).toFixed(2);
    }
    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
