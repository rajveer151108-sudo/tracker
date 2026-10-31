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

  function lyricLineStats(line, nextLine) {
    if (!line) return { words: 0, duration: 0, wpm: 0, density: 0, pace: 0, timingConfidence: 0 };
    const words = Array.isArray(line.words) && line.words.length
      ? line.words.filter((word) => String(word?.text || "").trim())
      : String(line.text || "").trim().split(/\s+/).filter(Boolean);
    const start = Math.max(0, Number(line.t) || 0);
    const wordEnd = Array.isArray(line.words) && line.words.length ? Number(line.words[line.words.length - 1]?.end) : NaN;
    const end = Math.max(start + .35, Number(line.end) || wordEnd || Number(nextLine?.t) || start + Math.max(1.2, words.length * .42));
    const duration = Math.max(.35, Math.min(12, end - start));
    const wpm = Math.min(420, words.length / duration * 60);
    return {
      words: words.length,
      duration,
      wpm,
      density: Math.max(0, Math.min(1, words.length / duration / 5.2)),
      pace: Math.max(0, Math.min(1, (wpm - 70) / 250)),
      timingConfidence: Array.isArray(line.words) && line.words.length && !line.words.some((word) => word?.estimated) ? 1 : .55,
      end,
    };
  }

  function lyricDirectorContext(lines = [], activeIndex = -1, time = 0, duration = 0) {
    const input = Array.isArray(lines) ? lines : [];
    let currentIndex = Number.isInteger(activeIndex) ? activeIndex : -1;
    let upcomingIndex = currentIndex >= 0 ? currentIndex + 1 : input.findIndex((line) => Number(line?.t) > time);
    if (upcomingIndex < 0) upcomingIndex = input.length;
    const current = currentIndex >= 0 ? input[currentIndex] : null;
    const next = input[upcomingIndex] || null;
    const currentStats = lyricLineStats(current, input[currentIndex + 1]);
    const nextStats = lyricLineStats(next, input[upcomingIndex + 1]);
    const currentEnd = currentStats.end || Number(next?.t) || time;
    const nextStart = Number(next?.t);
    const nextGap = next && Number.isFinite(nextStart) ? Math.max(0, nextStart - currentEnd) : 0;
    const previous = currentIndex > 0 ? input[currentIndex - 1] : null;
    const previousStats = lyricLineStats(previous, current);
    const previousEnd = previousStats.end || Number(current?.t) || time;
    const continuityGap = current ? Math.max(0, (Number(current.t) || 0) - previousEnd) : nextGap;
    const flow = current ? Math.max(0, Math.min(1, currentStats.pace * .62 + currentStats.density * .38 - continuityGap * .32)) : 0;
    const normalise = (text) => String(text || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    const currentText = normalise(current?.text);
    const repeated = currentText && currentIndex > 0
      ? input.slice(Math.max(0, currentIndex - 16), currentIndex).some((line) => normalise(line?.text) === currentText)
      : false;
    return {
      hasLyrics: input.length > 0,
      lineIndex: currentIndex,
      vocalGap: currentIndex < 0 ? 1 : 0,
      wpm: currentStats.wpm,
      pace: currentStats.pace,
      density: currentStats.density,
      flow,
      timingConfidence: currentStats.timingConfidence || nextStats.timingConfidence,
      lineWords: currentStats.words,
      boundaryIn: current ? Math.max(0, currentEnd - time) : next && Number.isFinite(nextStart) ? Math.max(0, nextStart - time) : 99,
      nextWpm: nextStats.wpm,
      nextPace: nextStats.pace,
      nextDensity: nextStats.density,
      nextGap,
      paceTrend: Math.max(-1, Math.min(1, nextStats.pace - currentStats.pace)),
      forecastFlow: Math.max(0, Math.min(1, nextStats.pace * .58 + nextStats.density * .42 - nextGap * .28)),
      hook: repeated ? 1 : 0,
      progress: duration > 0 ? Math.max(0, Math.min(1, time / duration)) : 0,
    };
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

  const bounded = (value) => Math.max(0, Math.min(1.5, Number(value) || 0));
  function directorDecision(signal = {}, current = "steady") {
    const keys = ["energy", "vocal", "phrase", "build", "duck", "drop", "impact", "pace", "density", "flow",
      "timingConfidence", "vocalGap", "nextPace", "nextDensity", "nextGap", "paceTrend", "forecastFlow", "hook", "structure",
      "timbreShift", "switchUp", "switchDown", "beatConfidence", "bass", "flux", "emotion"];
    const s = Object.fromEntries(keys.map((key) => [key, bounded(signal[key])]));
    const audio = bounded(signal.audioConfidence == null ? 1 : signal.audioConfidence);
    const wpm = Math.max(0, Number(signal.wpm) || 0);
    const nextWpm = Math.max(0, Number(signal.nextWpm) || 0);
    const pace = Math.max(s.pace || 0, wpm / 320);
    const futurePace = Math.max(s.nextPace || 0, nextWpm / 320, s.nextDensity * .86, s.forecastFlow || 0);
    const rising = Math.max(0, Number(signal.loudnessTrend) || 0);
    const falling = Math.max(0, -(Number(signal.loudnessTrend) || 0));
    const vocalRising = Math.max(0, Number(signal.vocalTrend) || 0);
    const vocalFalling = Math.max(0, -(Number(signal.vocalTrend) || 0));
    const bpm = Math.max(0, Number(signal.bpm) || 0);
    const tempo = Math.max(0, Math.min(1, (bpm - 70) / 110));
    const boundaryIn = Math.max(0, Number(signal.boundaryIn) || 0);
    const forecastNear = Math.max(.25, Math.min(1, (4.5 - boundaryIn) / 3.5));
    const progress = Math.max(0, Math.min(1, Number(signal.progress) || 0));
    const scores = {
      steady: .82 + s.energy * .12 + s.vocal * .1 - Math.max(s.switchUp, s.switchDown, s.drop) * .35,
      quiet: .12 + audio * ((1 - Math.min(1, s.energy)) * .7 + s.duck * .86 + s.switchDown * 1.35 + falling * .65)
        + s.vocalGap * .45 + vocalFalling * .22 + Math.max(0, .4 - pace) * .32 + Math.min(.34, s.nextGap * .18),
      build: .12 + audio * (s.build * 1.15 + rising * .82 + s.timbreShift * .28 + s.beatConfidence * .16 + s.energy * .34)
        + vocalRising * .24 + forecastNear * (Math.max(0, s.paceTrend) * .62 + Math.max(0, futurePace - pace) * .78)
        + s.hook * .16,
      drop: .08 + audio * (s.drop * 1.55 + s.switchUp * 1.5 + s.structure * .5 + s.impact * .42
        + s.bass * .28 + rising * .32 - s.duck * .2),
      rapid: .1 + pace * .88 + s.density * .55 + s.flow * .72 + s.vocal * .34 + s.flux * .3
        + forecastNear * (futurePace * .36 + Math.max(0, s.paceTrend) * .28) + tempo * s.beatConfidence * .16
        + s.energy * audio * .18 + s.emotion * .1 - s.vocalGap * .38,
      sustain: .1 + s.phrase * 1.02 + s.vocal * .7 + Math.max(0, .58 - pace) * .58
        + s.timingConfidence * .18 + s.hook * .22 + s.emotion * .2 - s.flux * .18,
    };
    if (progress > .965) scores.steady += .18;
    if (Object.hasOwn(scores, current)) scores[current] += .16;
    const ordered = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    let section = ordered[0][0];
    const margin = ordered[0][1] - ordered[1][1];
    if (section !== current && margin < .04 && Object.hasOwn(scores, current)) section = current;
    const reasonWeights = [
      ["structure", Math.max(s.switchUp, s.switchDown, s.structure)],
      ["flow", Math.max(pace, s.flow, s.density)],
      ["forecast", Math.max(futurePace, Math.abs(Number(signal.paceTrend) || 0))],
      ["vocals", Math.max(s.vocal, s.phrase)],
      ["loudness", Math.max(s.energy, rising, falling)],
      ["beat", Math.max(s.drop, s.impact, s.bass, s.beatConfidence)],
    ].sort((a, b) => b[1] - a[1]);
    return {
      section,
      confidence: Math.max(0, Math.min(1, .42 + margin * .58)),
      margin,
      scores,
      reasons: reasonWeights.slice(0, 2).map(([reason]) => reason),
    };
  }

  function directorSection(signal = {}, current = "steady") {
    return directorDecision(signal, current).section;
  }

  function directorSectionTiming(next = "steady", current = "steady") {
    const stable = { drop: 0, build: 600, rapid: 700, sustain: 850, quiet: 850, steady: 1200 };
    return {
      stableMs: Number.isFinite(stable[next]) ? stable[next] : stable.steady,
      holdMs: next === "drop" ? 1400 : current === "drop" ? 2400 : 3200,
    };
  }

  function directorCutAllowed({ hasLyrics = false, lineBoundary = false } = {}) {
    return !hasLyrics || !!lineBoundary;
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
        name: "Beat switch", lyricsLayout: genre === "rock" ? "poster" : "kinetic", lyricsMotion: "punch", lyricsSize: 86,
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

  return {
    VISUAL_KEYS, extractPreset, averageWordGap, lyricLineStats, lyricDirectorContext,
    directorScene, directorDecision, directorSection,
    directorSectionTiming, directorCutAllowed, directorSectionScene,
  };
});
