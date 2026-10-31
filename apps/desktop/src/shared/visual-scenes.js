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

  function sameVisualValue(a, b) {
    return typeof a === "number" && typeof b === "number" ? Math.abs(a - b) < .001 : a === b;
  }

  function changedVisualKeys(nextSettings = {}, previousSettings = {}) {
    const next = extractPreset(nextSettings);
    const previous = extractPreset(previousSettings);
    return VISUAL_KEYS.filter((key) => Object.hasOwn(next, key)
      && Object.hasOwn(previous, key)
      && !sameVisualValue(next[key], previous[key]));
  }

  function filterVisualPatch(patch = {}, lockedKeys = []) {
    const locked = lockedKeys instanceof Set ? lockedKeys : new Set(lockedKeys);
    return Object.fromEntries(Object.entries(extractPreset(patch)).filter(([key]) => !locked.has(key)));
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

  function lyricWordIndex(line, nextLine, time) {
    if (!line) return -1;
    const timed = Array.isArray(line.words) ? line.words.filter((word) => Number.isFinite(Number(word?.t))) : [];
    if (timed.length) {
      let index = -1;
      for (let i = 0; i < timed.length; i++) {
        if (Number(timed[i].t) <= time + .025) index = i;
        else break;
      }
      return index;
    }
    const words = String(line.text || "").trim().split(/\s+/).filter(Boolean);
    if (!words.length) return -1;
    const stats = lyricLineStats(line, nextLine);
    const start = Number(line.t) || 0;
    const progress = Math.max(0, Math.min(.9999, (time - start) / Math.max(.35, stats.duration)));
    return Math.min(words.length - 1, Math.floor(progress * words.length));
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
      wordIndex: lyricWordIndex(current, input[currentIndex + 1], time),
      lineActive: currentIndex >= 0 ? 1 : 0,
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
      lyricsFont: "round", backdropStyle: "black", backdropOpacity: 100,
      glowStyle: "flowline", glowStrength: 120, glowThickness: 180,
      lyricsDanceStyle: "punch", motionStrength: 135,
    },
    rnb: {
      name: "Velvet depth", lyricsLayout: "morphstack", lyricsHighlight: "whole", lyricsMotion: "glide",
      lyricsFont: "round", backdropStyle: "album", backdropOpacity: 54,
      glowStyle: "aurora", glowStrength: 105, glowThickness: 135,
      lyricsDanceStyle: "float", motionStrength: 92,
    },
    pop: {
      name: "Editorial lift", lyricsLayout: "buildstack", lyricsHighlight: "word", lyricsMotion: "slide",
      lyricsFont: "sans", backdropStyle: "canvas", backdropOpacity: 58,
      glowStyle: "horizon", glowStrength: 105, glowThickness: 120,
      lyricsDanceStyle: "bounce", motionStrength: 108,
    },
    rock: {
      name: "Cutout stage", lyricsLayout: "poster", lyricsHighlight: "word", lyricsMotion: "punch",
      lyricsFont: "sans", backdropStyle: "album", backdropOpacity: 62,
      glowStyle: "frame", glowStrength: 125, glowThickness: 145,
      lyricsDanceStyle: "shake", motionStrength: 126,
    },
    electronic: {
      name: "Neon velocity", lyricsLayout: "kinetic", lyricsHighlight: "word", lyricsMotion: "punch",
      lyricsFont: "sans", backdropStyle: "canvas", backdropOpacity: 64,
      glowStyle: "prism", glowStrength: 135, glowThickness: 170,
      lyricsDanceStyle: "snap", motionStrength: 142,
    },
    jazz: {
      name: "Midnight cards", lyricsLayout: "captioncards", lyricsHighlight: "whole", lyricsMotion: "glide",
      lyricsFont: "serif", backdropStyle: "album", backdropOpacity: 46,
      glowStyle: "halo", glowStrength: 82, glowThickness: 100,
      lyricsDanceStyle: "sway", motionStrength: 74,
    },
    other: {
      name: "Afterglow adaptive", lyricsLayout: "morphstack", lyricsHighlight: "word", lyricsMotion: "slide",
      lyricsFont: "round", backdropStyle: "album", backdropOpacity: 56,
      glowStyle: "aurora", glowStrength: 100, glowThickness: 125,
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
      });
    }
    const { name, ...visual } = scene;
    return { name, visual };
  }

  const CADENCE_VARIANTS = Object.freeze([
    {
      name: "Starlit verse", lyricsLayout: "constellation", lyricsHighlight: "whole", lyricsMotion: "glide",
      glowStyle: "comet", glowStrength: 104, glowThickness: 128,
      backdropOpacity: 52, lyricsDanceStyle: "sway", motionStrength: 82,
    },
    {
      name: "Lunar ribbon", lyricsLayout: "ribbon", lyricsHighlight: "whole", lyricsMotion: "glide",
      glowStyle: "eclipse", glowStrength: 108, glowThickness: 142,
      backdropOpacity: 50, lyricsDanceStyle: "sway", motionStrength: 88,
    },
    {
      name: "Type ascent", lyricsLayout: "buildstack", lyricsHighlight: "word", lyricsMotion: "slide",
      glowStyle: "horizon", glowStrength: 112, glowThickness: 138,
      backdropOpacity: 58, lyricsDanceStyle: "bounce", motionStrength: 108,
    },
    {
      name: "Orbit verse", lyricsLayout: "constellation", lyricsHighlight: "whole", lyricsMotion: "glide",
      glowStyle: "rotate", glowStrength: 112, glowThickness: 150,
      backdropOpacity: 56, lyricsDanceStyle: "float", motionStrength: 88,
    },
    {
      name: "Nebula poster", lyricsLayout: "poster", lyricsHighlight: "whole", lyricsMotion: "glide",
      glowStyle: "nebula", glowStrength: 116, glowThickness: 158,
      backdropOpacity: 54, lyricsDanceStyle: "sway", motionStrength: 94,
    },
    {
      name: "Velvet words", lyricsLayout: "morphstack", lyricsHighlight: "whole", lyricsMotion: "glide",
      glowStyle: "aurora", glowStrength: 102, glowThickness: 136,
      backdropOpacity: 50, lyricsDanceStyle: "float", motionStrength: 84,
    },
    {
      name: "Film captions", lyricsLayout: "captioncards", lyricsHighlight: "word", lyricsMotion: "glide",
      glowStyle: "halo", glowStrength: 88, glowThickness: 108,
      backdropOpacity: 48, lyricsDanceStyle: "subtle", motionStrength: 74,
    },
    {
      name: "Cover-story cut", lyricsLayout: "poster", lyricsHighlight: "word", lyricsMotion: "punch",
      glowStyle: "frame", glowStrength: 116, glowThickness: 142,
      backdropOpacity: 62, lyricsDanceStyle: "punch", motionStrength: 116,
    },
    {
      name: "Type tower", lyricsLayout: "wordstack", lyricsHighlight: "word", lyricsMotion: "cube",
      glowStyle: "rotate", glowStrength: 110, glowThickness: 146,
      backdropOpacity: 54, lyricsDanceStyle: "bounce", motionStrength: 102,
    },
    {
      name: "River text", lyricsLayout: "wordstream", lyricsHighlight: "word", lyricsMotion: "slide",
      glowStyle: "comet", glowStrength: 118, glowThickness: 152,
      backdropOpacity: 57, lyricsDanceStyle: "punch", motionStrength: 122,
    },
    {
      name: "Layered verse", lyricsLayout: "stack", lyricsHighlight: "whole", lyricsMotion: "glide",
      glowStyle: "nebula", glowStrength: 94, glowThickness: 124,
      backdropOpacity: 48, lyricsDanceStyle: "float", motionStrength: 78,
    },
    {
      name: "Flashpoint", lyricsLayout: "flash", lyricsHighlight: "whole", lyricsMotion: "punch",
      glowStyle: "steady", glowStrength: 124, glowThickness: 164,
      backdropOpacity: 64, lyricsDanceStyle: "snap", motionStrength: 128,
    },
    {
      name: "Voltage field", lyricsLayout: "kinetic", lyricsHighlight: "word", lyricsMotion: "punch",
      glowStyle: "prism", glowStrength: 138, glowThickness: 176,
      backdropOpacity: 62, lyricsDanceStyle: "snap", motionStrength: 140,
    },
    {
      name: "Clean cinema", lyricsLayout: "scroll", lyricsHighlight: "whole", lyricsMotion: "glide",
      glowStyle: "eclipse", glowStrength: 92, glowThickness: 118,
      backdropOpacity: 46, lyricsDanceStyle: "subtle", motionStrength: 70,
    },
    {
      name: "Faceted flow", lyricsLayout: "prism", lyricsHighlight: "word", lyricsMotion: "cube",
      glowStyle: "flowline", glowStrength: 132, glowThickness: 172,
      backdropOpacity: 59, lyricsDanceStyle: "punch", motionStrength: 134,
    },
  ]);

  function directorCadenceScene({ baseVisual = {}, previousVisual = {}, sequence = 0, signal = {} } = {}) {
    const pace = Math.max(0, Number(signal.pace) || 0);
    const density = Math.max(0, Number(signal.density) || 0);
    const futurePace = Math.max(0, Number(signal.nextPace) || 0, Number(signal.forecastFlow) || 0);
    const normalVerse = pace >= .12 && pace <= .72 && density <= .82;
    let index = Math.abs(Math.trunc(sequence)) % CADENCE_VARIANTS.length;
    const previous = { ...baseVisual, ...previousVisual };
    for (let offset = 0; offset < CADENCE_VARIANTS.length; offset++) {
      const candidate = CADENCE_VARIANTS[(index + offset) % CADENCE_VARIANTS.length];
      if (candidate.lyricsLayout !== previous.lyricsLayout && candidate.glowStyle !== previous.glowStyle) {
        index = (index + offset) % CADENCE_VARIANTS.length;
        break;
      }
    }
    const { name, ...patch } = CADENCE_VARIANTS[index];
    return {
      name,
      visual: { ...baseVisual, ...patch },
      reasons: normalVerse
        ? ["normal-paced verse", "scheduled scene evolution"]
        : futurePace > pace + .28 ? ["faster phrase ahead", "scheduled scene evolution"]
        : ["scene cadence", "visual variety"],
    };
  }

  function directorCadenceDelay(sequence = 0, first = false) {
    const firstPattern = [10500, 12500, 14000];
    const pattern = [14500, 17500, 15500, 19000, 16500, 13500];
    const values = first ? firstPattern : pattern;
    return values[Math.abs(Math.trunc(sequence)) % values.length];
  }

  const bounded = (value) => Math.max(0, Math.min(1.5, Number(value) || 0));
  function directorDecision(signal = {}, current = "steady") {
    const keys = ["energy", "vocal", "phrase", "build", "duck", "drop", "impact", "pace", "density", "flow",
      "timingConfidence", "vocalGap", "nextPace", "nextDensity", "nextGap", "paceTrend", "forecastFlow", "hook", "structure",
      "timbreShift", "timbreEvidence", "loudnessEvidence", "switchUp", "switchDown", "productionSwitch",
      "switchConfidence", "lowActivity", "quietHold", "quietConfidence", "reentry", "beatConfidence", "bass", "flux",
      "emotion", "lineActive", "wordSustain", "vocalSustain", "flowHold", "drumChange", "harmonyChange",
      "productionAgreement", "tonality", "onsetDensity", "arrangementLift"];
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
    const quietEvidence = Math.min(1, s.quietConfidence)
      * Math.min(1, s.lowActivity * .62 + s.quietHold * .58);
    const arrangementReturn = s.reentry > .4 && (s.onsetDensity > .12 || s.productionAgreement > .25);
    const verifiedProductionSwitch = s.productionSwitch > .3 && s.switchConfidence > .33
      && s.productionAgreement > .26
      && (s.drumChange > .18 || s.harmonyChange > .25
        || (s.timbreEvidence > .48 && s.loudnessEvidence > .48))
      && (s.timbreEvidence > .25 || s.timbreShift > .27 || s.structure > .3);
    const productionSwitch = verifiedProductionSwitch
      ? Math.min(1, s.switchConfidence * .48 + s.productionAgreement * .38
        + s.drumChange * .12 + s.harmonyChange * .12 + s.loudnessEvidence * .12)
      : 0;
    const structuralLift = Math.max(
      arrangementReturn ? s.reentry : 0,
      verifiedProductionSwitch ? Math.max(s.productionSwitch, s.switchUp, s.switchDown) : 0,
      Math.min(1, s.drop * Math.max(.45, s.structure) * (.45 + productionSwitch * .55)),
    );
    const actualFlow = Math.min(1, s.flowHold);
    const heldVocal = Math.max(s.vocalSustain, Math.min(s.wordSustain, s.phrase, s.vocal));
    const scores = {
      steady: .92 + s.energy * .08 + s.vocal * .08 - Math.max(s.reentry, s.switchUp, s.drop * s.structure) * .58,
      quiet: .08 + audio * (quietEvidence * 1.72 + s.quietHold * .22 + falling * .12)
        + (audio < .2 && s.nextGap > 1.8 ? Math.min(.5, (s.nextGap - 1.8) * .18) : 0),
      build: .12 + audio * (s.build * 1.28 + rising * .7 + s.timbreShift * .2 + s.beatConfidence * .1 + s.energy * .22
        + s.arrangementLift * 1.7)
        + vocalRising * .24 + forecastNear * (Math.max(0, s.paceTrend) * .5
          + Math.max(0, futurePace - pace) * 1.3 + futurePace * .3)
        + s.hook * .16,
      drop: .08 + audio * ((arrangementReturn ? s.reentry : 0) * 2.05 + s.drop * .82
        + (verifiedProductionSwitch ? s.productionSwitch : 0) * 1.28 + productionSwitch * 1.2
        + structuralLift * s.structure * .38 + structuralLift * s.timbreShift * .28
        + structuralLift * rising * .34 - s.duck * .14),
      rapid: .1 + actualFlow * 1.24 + pace * .42 + s.density * .3 + s.flow * .38 + s.vocal * .12
        + actualFlow * (tempo * s.beatConfidence * .12 + s.flux * .14 + s.energy * audio * .12)
        - s.vocalGap * .28,
      sustain: .1 + heldVocal * 1.46 + s.wordSustain * .34 + s.phrase * .22 + s.vocal * .16
        + Math.max(0, .5 - pace) * .18 + s.emotion * .12 - s.flux * .12,
    };
    // Semantic gates prevent an ordinary sentence ending from becoming a
    // "Quiet break" or "Held note", and keep a fast upcoming line from being
    // labelled a Flow run before the performance actually sustains that pace.
    if (s.quietHold < .62 || s.quietConfidence < .5) scores.quiet = Math.min(scores.quiet, .78);
    if (actualFlow < .42) scores.rapid = Math.min(scores.rapid, .82 + actualFlow * .1);
    if (s.lineActive < .5 || s.wordSustain < .5 || s.vocalSustain < .48 || heldVocal < .52) scores.sustain = Math.min(scores.sustain, .78);
    if (!arrangementReturn && !verifiedProductionSwitch) scores.drop = Math.min(scores.drop, .82);
    if (progress > .965) scores.steady += .18;
    if (Object.hasOwn(scores, current)) scores[current] += .14;
    const ordered = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    let section = ordered[0][0];
    const margin = ordered[0][1] - ordered[1][1];
    if (section !== current && margin < .04 && Object.hasOwn(scores, current)) section = current;
    const sectionReasons = {
      drop: arrangementReturn
        ? ["arrangement return", "drum re-entry"]
        : s.drumChange > .38 && s.harmonyChange > .38 ? ["drum pattern change", "harmonic shift"]
        : s.harmonyChange > .38 ? ["harmonic shift", "production change"]
        : s.drumChange > .3 ? ["drum pattern change", "timbre shift"]
        : ["production pivot", "loudness shift"],
      quiet: ["sustained arrangement space", "reduced drum activity"],
      rapid: [wpm >= 120 ? `${Math.round(wpm)} WPM` : "dense delivery", "sustained flow"],
      sustain: ["held vocal", "long word sustain"],
      build: s.arrangementLift > .34 ? ["new instrumental layer", "rising intensity"]
        : Math.max(0, futurePace - pace) > .22
          ? ["faster phrase ahead", "rising intensity"] : ["rising intensity", "arrangement lift"],
      steady: ["stable arrangement"],
    };
    return {
      section,
      confidence: Math.max(0, Math.min(1, .42 + margin * .58)),
      margin,
      scores,
      reasons: sectionReasons[section] || sectionReasons.steady,
      priority: section === "drop" && verifiedProductionSwitch ? "beat-switch"
        : arrangementReturn ? "reentry"
        : section === "build" && s.arrangementLift > .34 ? "instrument-lift"
        : structuralLift > .68 && ["drop", "quiet"].includes(section) ? "structural" : "normal",
    };
  }

  function directorSection(signal = {}, current = "steady") {
    return directorDecision(signal, current).section;
  }

  function directorSectionTiming(next = "steady", current = "steady") {
    const stable = { drop: 120, build: 1500, rapid: 2100, sustain: 1900, quiet: 2200, steady: 2200 };
    return {
      stableMs: Number.isFinite(stable[next]) ? stable[next] : stable.steady,
      holdMs: current === "drop" ? 10000
        : next === "quiet" ? 8500
        : next === "drop" ? 4500
        : next === "steady" ? 6500
        : 7500,
    };
  }

  function directorCutAllowed({ hasLyrics = false, lineActive = true, lineBoundary = false, wordBoundary = false, priority = "normal" } = {}) {
    const musicalCut = priority === "beat-switch" || priority === "instrument-lift" || priority === "reentry";
    return !hasLyrics || lineActive === false || !!lineBoundary || (musicalCut && !!wordBoundary);
  }

  function directorSectionScene({ section = "steady", genre = "other", baseVisual = {}, previousVisual = {}, cue = "beat-switch", sequence = 0 } = {}) {
    const base = { ...baseVisual };
    const sectionPatches = {
      quiet: [{
        name: "Quiet break", lyricsLayout: "morphstack", lyricsMotion: "glide",
        glowStyle: "halo", glowStrength: 72, glowThickness: 110,
        backdropOpacity: 42, lyricsDanceStyle: "subtle", motionStrength: 68,
      }, {
        name: "Open space", lyricsLayout: "captioncards", lyricsHighlight: "whole", lyricsMotion: "glide",
        glowStyle: "eclipse", glowStrength: 68, glowThickness: 102,
        backdropOpacity: 38, lyricsDanceStyle: "float", motionStrength: 62,
      }, {
        name: "Low tide", lyricsLayout: "stack", lyricsHighlight: "whole", lyricsMotion: "glide",
        glowStyle: "aurora", glowStrength: 70, glowThickness: 108,
        backdropOpacity: 40, lyricsDanceStyle: "sway", motionStrength: 64,
      }],
      build: [{
        name: "Pressure rising", lyricsLayout: "buildstack", lyricsMotion: "slide",
        glowStyle: "horizon", glowStrength: 116, glowThickness: 142,
        backdropOpacity: 58, lyricsDanceStyle: "bounce", motionStrength: 112,
      }, {
        name: "Ignition", lyricsLayout: "kinetic", lyricsHighlight: "word", lyricsMotion: "punch",
        glowStyle: "comet", glowStrength: 124, glowThickness: 154,
        backdropOpacity: 60, lyricsDanceStyle: "snap", motionStrength: 124,
      }, {
        name: "Arrangement bloom", lyricsLayout: "ribbon", lyricsHighlight: "whole", lyricsMotion: "slide",
        glowStyle: "nebula", glowStrength: 114, glowThickness: 146,
        backdropOpacity: 56, lyricsDanceStyle: "sway", motionStrength: 106,
      }],
      drop: [{
        name: cue === "reentry" ? "Arrangement return" : cue === "beat-switch" ? "Beat switch" : "Production drop",
        lyricsLayout: genre === "rock" ? "poster" : "kinetic", lyricsMotion: "punch",
        glowStyle: "prism", glowStrength: 165, glowThickness: 210,
        backdropOpacity: 68, lyricsDanceStyle: genre === "rock" ? "shake" : "snap", motionStrength: 148,
      }, {
        name: cue === "beat-switch" ? "Beat switch: hard cut" : "Impact frame", lyricsLayout: "poster", lyricsHighlight: "word", lyricsMotion: "punch",
        glowStyle: "frame", glowStrength: 172, glowThickness: 220,
        backdropOpacity: 72, lyricsDanceStyle: genre === "rock" ? "shake" : "punch", motionStrength: 154,
      }, {
        name: cue === "reentry" ? "Arrangement return" : "Drop flare", lyricsLayout: "flash", lyricsHighlight: "whole", lyricsMotion: "punch",
        glowStyle: "comet", glowStrength: 178, glowThickness: 228,
        backdropOpacity: 70, lyricsDanceStyle: "snap", motionStrength: 160,
      }, {
        name: cue === "beat-switch" ? "Beat switch: refraction" : "Production refraction", lyricsLayout: "prism", lyricsHighlight: "word", lyricsMotion: "cube",
        glowStyle: "flowline", glowStrength: 168, glowThickness: 214,
        backdropOpacity: 66, lyricsDanceStyle: "punch", motionStrength: 152,
      }],
      rapid: [{
        name: "Flow run", lyricsLayout: "prism", lyricsHighlight: "word", lyricsMotion: "punch",
        glowStyle: "flowline", glowStrength: 126, glowThickness: 168,
        lyricsDanceStyle: "punch", motionStrength: 138,
      }, {
        name: "Velocity script", lyricsLayout: "wordstream", lyricsHighlight: "word", lyricsMotion: "slide",
        glowStyle: "comet", glowStrength: 132, glowThickness: 174,
        lyricsDanceStyle: "snap", motionStrength: 142,
      }, {
        name: "Kinetic verse", lyricsLayout: "kinetic", lyricsHighlight: "word", lyricsMotion: "punch",
        glowStyle: "nebula", glowStrength: 128, glowThickness: 166,
        lyricsDanceStyle: "punch", motionStrength: 140,
      }],
      sustain: [{
        name: "Held note", lyricsLayout: "morphstack", lyricsHighlight: "whole", lyricsMotion: "glide",
        glowStyle: "aurora", glowStrength: 104, glowThickness: 145,
        backdropOpacity: 52, lyricsDanceStyle: "float", motionStrength: 86,
      }, {
        name: "Vocal ribbon", lyricsLayout: "ribbon", lyricsHighlight: "whole", lyricsMotion: "glide",
        glowStyle: "eclipse", glowStrength: 100, glowThickness: 138,
        backdropOpacity: 50, lyricsDanceStyle: "sway", motionStrength: 82,
      }, {
        name: "Long exposure", lyricsLayout: "captioncards", lyricsHighlight: "whole", lyricsMotion: "glide",
        glowStyle: "halo", glowStrength: 96, glowThickness: 132,
        backdropOpacity: 48, lyricsDanceStyle: "float", motionStrength: 80,
      }],
    };
    if (section === "steady" || !sectionPatches[section]) return { name: "Main scene", visual: base };
    const choices = sectionPatches[section];
    let index = Math.abs(Math.trunc(sequence)) % choices.length;
    const previous = { ...base, ...previousVisual };
    for (let offset = 0; offset < choices.length; offset++) {
      const candidate = choices[(index + offset) % choices.length];
      if (candidate.lyricsLayout !== previous.lyricsLayout && candidate.glowStyle !== previous.glowStyle) {
        index = (index + offset) % choices.length;
        break;
      }
    }
    const { name, ...patch } = choices[index];
    return { name, visual: { ...base, ...patch } };
  }

  return {
    VISUAL_KEYS, extractPreset, changedVisualKeys, filterVisualPatch,
    averageWordGap, lyricLineStats, lyricDirectorContext,
    directorScene, directorCadenceScene, directorCadenceDelay, directorDecision, directorSection,
    directorSectionTiming, directorCutAllowed, directorSectionScene,
  };
});
