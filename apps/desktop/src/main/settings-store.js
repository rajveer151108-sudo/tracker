const fs = require("fs");
const path = require("path");

const DEFAULTS = {
  showLyrics: true,
  lyricsHighlight: "word",
  lyricsLayout: "scroll",
  lyricsMotion: "slide",
  lyricsEmoji: true,
  lyricsKeywords: true,
  lyricsWordSource: true,
  genreFeel: true,
  lyricsFit: true,
  lyricsEstimate: true,
  lyricsAlign: "center",
  lyricsFont: "sans",
  lyricsSize: 30,
  lyricsBlur: true,
  backdrop: true,
  backdropStyle: "blur",
  backdropTourFocus: "smart",
  backdropOpacity: 60,
  glow: true,
  glowStyle: "steady",
  glowScope: "everywhere",
  glowDisplays: "all",
  glowStrength: 100,
  glowThickness: 100,
  glowOverride: false,
  glowColorA: "#ff4d6d",
  glowColorB: "#7a5cff",
  beat: false,
  beatStrength: 100,
};

const LIMITS = {
  lyricsSize: [18, 60],
  glowStrength: [0, 300],
  glowThickness: [20, 300],
  backdropOpacity: [0, 100],
  beatStrength: [0, 300],
};

const ENUMS = {
  lyricsHighlight: ["word", "sweep", "whole"],
  lyricsLayout: ["scroll", "flash", "wordstream"],
  lyricsMotion: ["punch", "slide", "glide", "cube"],
  lyricsAlign: ["center", "left"],
  lyricsFont: ["sans", "serif", "round"],
  backdropStyle: ["blur", "album"],
  backdropTourFocus: ["smart", "center", "corners"],
  glowStyle: ["steady", "rotate", "comet"],
  glowScope: ["everywhere", "tracker"],
  glowDisplays: ["all", "main"],
};

function clean(key, value) {
  if (typeof value !== typeof DEFAULTS[key]) return undefined;
  if (typeof value === "number") {
    const [lo, hi] = LIMITS[key] || [0, 1000];
    return Math.min(hi, Math.max(lo, value));
  }
  if (ENUMS[key] && !ENUMS[key].includes(value)) return undefined;
  if (key.startsWith("glowColor") && !/^#[0-9a-fA-F]{6}$/.test(value)) return undefined;
  return value;
}

function createSettingsStore(app) {
  const file = () => path.join(app.getPath("userData"), "settings.json");
  let settings = { ...DEFAULTS };

  function load() {
    try {
      const saved = JSON.parse(fs.readFileSync(file(), "utf8"));
      for (const key of Object.keys(DEFAULTS)) {
        const value = clean(key, saved[key]);
        if (value !== undefined) settings[key] = value;
      }
    } catch {
      // First run uses defaults.
    }
    return settings;
  }

  function save() {
    try {
      fs.writeFileSync(file(), JSON.stringify(settings, null, 2));
    } catch {
      // Settings are non-critical; keep the in-memory copy if persistence fails.
    }
  }

  function update(patch) {
    const before = { ...settings };
    for (const key of Object.keys(DEFAULTS)) {
      if (!patch || !(key in patch)) continue;
      const value = clean(key, patch[key]);
      if (value !== undefined) settings[key] = value;
    }
    save();
    return { before, settings };
  }

  return { get: () => settings, load, update };
}

module.exports = { createSettingsStore };
