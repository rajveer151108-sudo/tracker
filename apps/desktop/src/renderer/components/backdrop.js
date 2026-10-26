// =====================================================================
  // Backdrop (blurred album art that cross-fades between songs)
  // =====================================================================
  let lastArtwork = null;
  let backdropKey = null;
  function setBackdrop(url) {
    const box = $("backdrop");
    const old = [...box.children];
    const u = 'url("' + String(url).replace(/"/g, "%22") + '")';
    const wrap = document.createElement("div");
    wrap.className = "bdw";
    const blur = document.createElement("div");
    blur.className = "bd"; blur.style.backgroundImage = u;
    wrap.appendChild(blur);
    if (settings.backdropStyle === "album") {
      const alb = document.createElement("div");
      alb.className = "alb"; alb.style.backgroundImage = u;
      wrap.appendChild(alb);
    }
    box.appendChild(wrap);
    backdropKey = settings.backdropStyle;
    requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add("in")));
    setTimeout(() => old.forEach((o) => o.remove()), 1600);
  }


