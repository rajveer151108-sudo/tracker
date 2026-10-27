// =====================================================================
  // Backdrop (blurred album art that cross-fades between songs)
  // =====================================================================
  let lastArtwork = null;
  let backdropKey = null;
  let albumTourSeconds = 26;

  const TOUR_ROUTES = {
    center: [{ x: 0.5, y: 0.38 }, { x: 0.42, y: 0.52 }, { x: 0.58, y: 0.52 }, { x: 0.5, y: 0.65 }],
    corners: [{ x: 0.16, y: 0.16 }, { x: 0.84, y: 0.16 }, { x: 0.84, y: 0.84 }, { x: 0.16, y: 0.84 }],
  };

  function tourTransform(point, zoom, size, width, height) {
    const wantedX = -zoom * (point.x - 0.5) * size;
    const wantedY = -zoom * (point.y - 0.5) * size;
    const maxX = Math.max(0, size * zoom / 2 - width / 2);
    const maxY = Math.max(0, size * zoom / 2 - height / 2);
    const x = Math.max(-maxX, Math.min(maxX, wantedX));
    const y = Math.max(-maxY, Math.min(maxY, wantedY));
    return `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${zoom.toFixed(3)})`;
  }

  function runAlbumTour(element, points) {
    if (!element.isConnected) return;
    if (element._tour) element._tour.cancel();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      element.style.transform = "none";
      return;
    }
    const box = element.parentElement?.parentElement || $("backdrop");
    const width = Math.max(1, box.clientWidth);
    const height = Math.max(1, box.clientHeight);
    const size = Math.max(width, height);
    const useful = (points && points.length ? points : TOUR_ROUTES.center).slice(0, 3);
    const peak = Math.max(...useful.map((point) => point.score || 0), 0.01);
    const zoomStrength = Math.max(0.2, Math.min(1.4, Number(settings.backdropTourZoom || 65) / 100));
    const frames = [
      { offset: 0, transform: "translate(0px, 0px) scale(1)" },
      { offset: 0.08, transform: "translate(0px, 0px) scale(1)" },
    ];
    useful.forEach((point, index) => {
      const start = 0.14 + index * (0.58 / useful.length);
      const confidence = Math.max(0, Math.min(1, (point.score || peak) / peak));
      const zoom = 1.25 + zoomStrength * (0.58 + confidence * 0.22);
      const transform = tourTransform(point, zoom, size, width, height);
      frames.push({ offset: start, transform }, { offset: start + 0.075, transform });
    });
    frames.push(
      { offset: 0.82, transform: `translate(0px, 0px) scale(${(1.12 + zoomStrength * 0.28).toFixed(3)})` },
      { offset: 0.89, transform: `translate(0px, 0px) scale(${(1.12 + zoomStrength * 0.28).toFixed(3)})` },
      { offset: 1, transform: "translate(0px, 0px) scale(1)" },
    );
    frames.sort((a, b) => a.offset - b.offset);
    element._tour = element.animate(frames, {
      duration: albumTourSeconds * 1000,
      easing: "ease-in-out",
      iterations: Infinity,
    });
    element._tourPoints = useful;
  }

  function analyseAlbum(url, element) {
    const mode = settings.backdropTourFocus || "smart";
    if (mode !== "smart") return runAlbumTour(element, TOUR_ROUTES[mode] || TOUR_ROUTES.center);
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      if (!element.isConnected) return;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 112;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
        runAlbumTour(element, window.AlbumFocus.findFocusPoints(pixels, canvas.width, canvas.height));
      } catch {
        runAlbumTour(element, TOUR_ROUTES.center);
      }
    };
    image.onerror = () => runAlbumTour(element, TOUR_ROUTES.center);
    image.src = url;
  }

  function setAlbumTourDuration(seconds) {
    albumTourSeconds = Number(seconds) || 26;
    document.querySelectorAll(".alb").forEach((element) => {
      if (element._tour) element._tour.effect.updateTiming({ duration: albumTourSeconds * 1000 });
    });
  }

  function refreshAlbumTours() {
    document.querySelectorAll(".alb").forEach((element) => runAlbumTour(element, element._tourPoints));
  }

  let albumResizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(albumResizeTimer);
    albumResizeTimer = setTimeout(() => {
      refreshAlbumTours();
    }, 120);
  });

  function setBackdrop(url) {
    const box = $("backdrop");
    const old = [...box.children];
    const u = 'url("' + String(url).replace(/"/g, "%22") + '")';
    const wrap = document.createElement("div");
    wrap.className = "bdw";
    let albumLayer = null;
    if (settings.backdropStyle === "album") {
      const alb = document.createElement("div");
      alb.className = "alb"; alb.style.backgroundImage = u;
      wrap.appendChild(alb);
      albumLayer = alb;
    } else {
      const blur = document.createElement("div");
      blur.className = "bd"; blur.style.backgroundImage = u;
      wrap.appendChild(blur);
    }
    box.appendChild(wrap);
    if (albumLayer) analyseAlbum(url, albumLayer);
    backdropKey = settings.backdropStyle + ":" + (settings.backdropTourFocus || "smart");
    requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add("in")));
    setTimeout(() => old.forEach((o) => o.remove()), 1600);
  }


