const fs = require("fs");
const path = require("path");

const DEFAULTS = {
  showLyrics: true,
  lyricsHighlight: "word",
  lyricsLayout: "scroll",
  lyricsHistoryLines: 4,
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
  backdropTourZoom: 65,
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
  musicMotion: true,
  motionStrength: 100,
  lyricsDanceStyle: "auto",
  performanceMode: "balanced",
  homeMode: "arcade",
};

const LIMITS = {
  lyricsSize: [18, 72],
  lyricsHistoryLines: [2, 6],
  glowStrength: [0, 300],
  glowThickness: [20, 300],
  backdropOpacity: [0, 100],
  backdropTourZoom: [20, 140],
  beatStrength: [0, 300],
  motionStrength: [0, 250],
};

const ENUMS = {
  lyricsHighlight: ["word", "sweep", "whole"],
  lyricsLayout: ["scroll", "stack", "wordstack", "flash", "wordstream"],
  lyricsMotion: ["punch", "slide", "glide", "cube"],
  lyricsAlign: ["center", "left"],
  lyricsFont: ["sans", "serif", "round"],
  backdropStyle: ["blur", "album", "canvas", "black"],
  backdropTourFocus: ["smart", "center", "corners"],
  glowStyle: ["steady", "rotate", "comet"],
  glowScope: ["everywhere", "tracker"],
  glowDisplays: ["all", "main"],
  lyricsDanceStyle: ["auto", "float", "punch", "sway", "shake", "bounce", "snap", "subtle"],
  performanceMode: ["battery", "balanced", "smooth"],
  homeMode: ["arcade", "vinyl", "cd", "midnight"],
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
      // Tape archive occupied the third home slot in older builds. That slot is
      // now the dedicated CD stereo, so existing installs move across cleanly.
      if (saved.homeMode === "tape") saved.homeMode = "cd";
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
