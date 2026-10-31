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

  // Auto-fit is intentionally dramatic for a single lyric, but layouts that
  // keep several lyrics on screen have to size the whole composition rather
  // than letting every word claim the entire lyric box. These caps follow the
  // spacing used by each layout and remain responsive to the stage dimensions.
  function compositionFontCap(layout = "", viewportWidth = 1280, viewportHeight = 720, options = {}) {
    const width = Math.max(320, Number(viewportWidth) || 1280);
    const height = Math.max(240, Number(viewportHeight) || 720);
    const historyLines = clamp(options.historyLines || 4, 2, 6);
    const immersive = !!options.immersive;
    const profiles = {
      buildstack: { height: .115, width: .09 },
      wordstream: { height: .2, width: .15 },
      kinetic: { height: .2, width: .14 },
      morphstack: { height: .17, width: .12 },
      prism: { height: .16, width: .12 },
      ribbon: { height: .16, width: .11 },
      splitstage: { height: .18, width: .1 },
    };
    let profile = profiles[layout];
    if (layout === "stack" || layout === "wordstack") {
      profile = { height: clamp(.56 / historyLines, .09, .2), width: .11 };
    }
    if (!profile) return Infinity;
    const absoluteMax = immersive ? 190 : 170;
    return clamp(Math.min(height * profile.height, width * profile.width), 34, absoluteMax);
  }

  return { lyricBoxMetrics, glyphUnits, fitTextToLyricBox, compositionFontCap };
});
