(function exposeVisualScenes(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.VisualScenes = api;
})(typeof globalThis === "object" ? globalThis : this, function visualScenesFactory() {
  const VISUAL_KEYS = Object.freeze([
    "lyricsHighlight", "lyricsLayout", "phraseAccents", "lyricsMotion",
    "lyricsEmoji", "lyricsKeywords", "lyricsAlign", "lyricsFont", "lyricsSize", "lyricsBlur",
    "backdrop", "backdropStyle", "backdropTourFocus", "backdropTourZoom", "backdropOpacity",
    "glow", "glowStyle", "glowStrength", "glowThickness", "glowOverride", "glowColorA", "glowColorB",
    "genreFeel", "lyricsDance", "glowDance", "motionStrength", "lyricsDanceStyle",
  ]);

  function extractPreset(settings = {}) {
    const visual = {};
    for (const key of VISUAL_KEYS) {
      const value = settings[key];
      if (["string", "number", "boolean"].includes(typeof value)) visual[key] = value;
    }
    return visual;
  }

  function averageWordGap(lines = []) {
    const starts = [];
    for (const line of Array.isArray(lines) ? lines : []) {
      for (const word of Array.isArray(line?.words) ? line.words : []) {
        const start = Number(word?.t);
        if (Number.isFinite(start)) starts.push(start);
      }
    }
    starts.sort((a, b) => a - b);
    const gaps = [];
    for (let i = 1; i < starts.length; i++) {
      const gap = starts[i] - starts[i - 1];
      if (gap >= .06 && gap <= 1.6) gaps.push(gap);
    }
    if (!gaps.length) return NaN;
    return gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
  }

  const SCENES = Object.freeze({
    rap: {
      name: "Flow chamber", lyricsLayout: "prism", lyricsHighlight: "word", lyricsMotion: "punch",
      lyricsFont: "round", lyricsSize: 94, backdropStyle: "black", backdropOpacity: 100,
      glowStyle: "flowline", glowStrength: 120, glowThickness: 180,
      lyricsDanceStyle: "punch", motionStrength: 135,
    },
    rnb: {
      name: "Velvet depth", lyricsLayout: "morphstack", lyricsHighlight: "whole", lyricsMotion: "glide",
      lyricsFont: "round", lyricsSize: 92, backdropStyle: "album", backdropOpacity: 54,
      glowStyle: "comet", glowStrength: 105, glowThickness: 135,
      lyricsDanceStyle: "float", motionStrength: 92,
    },
    pop: {
      name: "Editorial lift", lyricsLayout: "buildstack", lyricsHighlight: "word", lyricsMotion: "slide",
      lyricsFont: "sans", lyricsSize: 78, backdropStyle: "canvas", backdropOpacity: 58,
      glowStyle: "frame", glowStrength: 105, glowThickness: 120,
      lyricsDanceStyle: "bounce", motionStrength: 108,
    },
    rock: {
      name: "Cutout stage", lyricsLayout: "poster", lyricsHighlight: "word", lyricsMotion: "punch",
      lyricsFont: "sans", lyricsSize: 76, backdropStyle: "album", backdropOpacity: 62,
      glowStyle: "frame", glowStrength: 125, glowThickness: 145,
      lyricsDanceStyle: "shake", motionStrength: 126,
    },
    electronic: {
      name: "Neon velocity", lyricsLayout: "kinetic", lyricsHighlight: "word", lyricsMotion: "punch",
      lyricsFont: "sans", lyricsSize: 96, backdropStyle: "canvas", backdropOpacity: 64,
      glowStyle: "flowline", glowStrength: 135, glowThickness: 170,
      lyricsDanceStyle: "snap", motionStrength: 142,
    },
    jazz: {
      name: "Midnight cards", lyricsLayout: "captioncards", lyricsHighlight: "whole", lyricsMotion: "glide",
      lyricsFont: "serif", lyricsSize: 66, backdropStyle: "album", backdropOpacity: 46,
      glowStyle: "steady", glowStrength: 82, glowThickness: 100,
      lyricsDanceStyle: "sway", motionStrength: 74,
    },
    other: {
      name: "Afterglow adaptive", lyricsLayout: "morphstack", lyricsHighlight: "word", lyricsMotion: "slide",
      lyricsFont: "round", lyricsSize: 82, backdropStyle: "album", backdropOpacity: 56,
      glowStyle: "comet", glowStrength: 100, glowThickness: 125,
      lyricsDanceStyle: "subtle", motionStrength: 96,
    },
  });

  function directorScene({ genre = "other", wordGap = NaN } = {}) {
    const bucket = Object.hasOwn(SCENES, genre) ? genre : "other";
    const scene = { ...SCENES[bucket] };
    // Dense, accurately timed vocals benefit from one physical word per face.
    // Sparse performances retain their genre's calmer line composition.
    if (Number.isFinite(wordGap) && wordGap < .34 && bucket !== "jazz") {
      Object.assign(scene, {
        name: bucket === "rap" ? "Flow chamber" : "Velocity prism",
        lyricsLayout: "prism",
        lyricsHighlight: "word",
        lyricsMotion: "punch",
        lyricsSize: Math.max(92, scene.lyricsSize || 0),
      });
    }
    const { name, ...visual } = scene;
    return { name, visual };
  }

  return { VISUAL_KEYS, extractPreset, averageWordGap, directorScene };
});
