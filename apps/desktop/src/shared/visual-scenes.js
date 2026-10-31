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

  function directorSection(signal = {}) {
    const energy = Number(signal.energy) || 0;
    const vocal = Number(signal.vocal) || 0;
    const phrase = Number(signal.phrase) || 0;
    const build = Number(signal.build) || 0;
    const duck = Number(signal.duck) || 0;
    const drop = Number(signal.drop) || 0;
    const impact = Number(signal.impact) || 0;
    const pace = Number(signal.pace) || 0;
    if (drop > .58 || (impact > .82 && energy > .74 && duck < .34)) return "drop";
    if (pace > .78 && vocal > .34 && energy > .38) return "rapid";
    if (build > .46 && energy > .46 && drop < .3) return "build";
    if (phrase > .68 && vocal > .55 && pace < .42) return "sustain";
    if ((duck > .58 && energy < .52) || (energy < .27 && vocal < .3)) return "quiet";
    return "steady";
  }

  function directorSectionScene({ section = "steady", genre = "other", baseVisual = {} } = {}) {
    const base = { ...baseVisual };
    const sectionPatches = {
      quiet: {
        name: "Quiet break", lyricsLayout: "morphstack", lyricsMotion: "glide", lyricsSize: 78,
        glowStyle: "steady", glowStrength: 70, glowThickness: 88,
        backdropOpacity: 42, lyricsDanceStyle: "subtle", motionStrength: 68,
      },
      build: {
        name: "Pressure rising", lyricsLayout: "buildstack", lyricsMotion: "slide", lyricsSize: 82,
        glowStyle: "frame", glowStrength: 112, glowThickness: 128,
        backdropOpacity: 58, lyricsDanceStyle: "bounce", motionStrength: 112,
      },
      drop: {
        name: "Beat switch", lyricsLayout: genre === "rock" ? "poster" : "kinetic", lyricsMotion: "punch", lyricsSize: 104,
        glowStyle: "flowline", glowStrength: 145, glowThickness: 190,
        backdropOpacity: 68, lyricsDanceStyle: genre === "rock" ? "shake" : "snap", motionStrength: 148,
      },
      rapid: {
        name: "Flow run", lyricsLayout: "prism", lyricsHighlight: "word", lyricsMotion: "punch", lyricsSize: 98,
        glowStyle: "flowline", glowStrength: 126, glowThickness: 168,
        lyricsDanceStyle: "punch", motionStrength: 138,
      },
      sustain: {
        name: "Held note", lyricsLayout: "morphstack", lyricsHighlight: "whole", lyricsMotion: "glide", lyricsSize: 96,
        glowStyle: "comet", glowStrength: 100, glowThickness: 130,
        backdropOpacity: 52, lyricsDanceStyle: "float", motionStrength: 86,
      },
    };
    if (section === "steady" || !sectionPatches[section]) return { name: "Main scene", visual: base };
    const { name, ...patch } = sectionPatches[section];
    return { name, visual: { ...base, ...patch } };
  }

  return { VISUAL_KEYS, extractPreset, averageWordGap, directorScene, directorSection, directorSectionScene };
});
