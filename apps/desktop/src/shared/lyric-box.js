(function exposeLyricBox(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.LyricBox = api;
})(typeof globalThis === "object" ? globalThis : this, function lyricBoxFactory() {
  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));

  function lyricBoxMetrics(control = 30, viewportWidth = 1280, viewportHeight = 720, immersive = false) {
    const normalized = clamp((Number(control) - 18) / (160 - 18), 0, 1);
    const widthRatio = (immersive ? .39 : .34) + normalized * (immersive ? .51 : .52);
    const heightRatio = (immersive ? .2 : .17) + normalized * (immersive ? .34 : .32);
    const width = clamp(viewportWidth * widthRatio, 230, viewportWidth * (immersive ? .92 : .88));
    const height = clamp(viewportHeight * heightRatio, 92, viewportHeight * (immersive ? .56 : .5));
    return { width, height, normalized };
  }

  function glyphUnits(text = "") {
    let units = 0;
    for (const character of String(text).normalize("NFKC")) {
      if (/\s/u.test(character)) units += .34;
      else if (/[ilI1'`.,:;!|]/u.test(character)) units += .31;
      else if (/[mwMW@%&QO]/u.test(character)) units += .9;
      else if (/[A-Z0-9]/u.test(character)) units += .66;
      else units += .57;
    }
    return Math.max(.72, units);
  }

  function fitTextToLyricBox(text, metrics = {}, options = {}) {
    const width = Math.max(1, Number(metrics.width) || 1);
    const height = Math.max(1, Number(metrics.height) || 1);
    const max = Math.max(18, Number(options.max) || 420);
    const min = Math.max(10, Math.min(max, Number(options.min) || 18));
    const widthFit = width * .93 / glyphUnits(text);
    const heightFit = height / Math.max(.72, Number(options.lineHeight) || .96);
    return clamp(Math.min(widthFit, heightFit, max), min, max);
  }

  return { lyricBoxMetrics, glyphUnits, fitTextToLyricBox };
});
