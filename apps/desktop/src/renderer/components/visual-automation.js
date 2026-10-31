// =====================================================================
// Per-song looks, cinematic track changes, and automatic scene direction.
// =====================================================================
let visualTrackState = null;
let visualPresetRequest = 0;
let visualTransitionTimer = 0;
let visualBadgeTimer = 0;
let visualSectionTimer = 0;
let visualAccentTimer = 0;
let lastVisualSnapshot = null;
let pendingVisualPatch = null;
let automationToggleSnapshot = null;
let userVisualBaseline = null;
let activeVisualOverlay = null;
let pendingManualVisualKeys = [];
const directorLockedVisualKeys = new Set();
const queuedManualVisualKeys = new Set();

function visualSongKey(np) {
  return String(np?.uri || np?.id || currentTrackKey(np) || "").normalize("NFKC").trim().toLowerCase();
}

function visualSequenceSeed(value) {
  let hash = 2166136261;
  for (const character of String(value || "afterglow")) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return Math.abs(hash >>> 0) % 15;
}

function visualSnapshot() {
  return window.VisualScenes.extractPreset(settings || {});
}

function sameVisualValue(a, b) {
  return typeof a === "number" && typeof b === "number" ? Math.abs(a - b) < .001 : a === b;
}

function markVisualControlManual(key) {
  if (window.VisualScenes.VISUAL_KEYS.includes(key)) queuedManualVisualKeys.add(key);
}

function showVisualSceneBadge(kicker, title) {
  if (!settings?.automationNotifications) return;
  const badge = $("visualSceneBadge");
  if (!badge) return;
  badge.querySelector("small").textContent = kicker || "VISUAL SCENE";
  badge.querySelector("strong").textContent = title || "Afterglow";
  badge.classList.remove("show");
  void badge.offsetWidth;
  badge.classList.add("show");
  clearTimeout(visualBadgeTimer);
  visualBadgeTimer = setTimeout(() => badge.classList.remove("show"), 2600);
}

// Automation is a temporary layer over the user's real settings. A manual
// change locks only that individual control; the rest of Director keeps going.
function prepareVisualAutomationSettings(nextSettings = {}) {
  const incomingVisual = window.VisualScenes.extractPreset(nextSettings);
  const detected = userVisualBaseline
    ? window.VisualScenes.changedVisualKeys(incomingVisual, userVisualBaseline)
    : [];
  const changed = [...new Set([...detected, ...queuedManualVisualKeys])];
  queuedManualVisualKeys.clear();
  const shouldLock = changed.length && visualTrackState
    && (settings?.directorMode || visualTrackState.preset || activeVisualOverlay);
  userVisualBaseline = incomingVisual;
  pendingManualVisualKeys = shouldLock ? changed : [];
  if (shouldLock) {
    changed.forEach((key) => directorLockedVisualKeys.add(key));
    if (activeVisualOverlay) {
      activeVisualOverlay = window.VisualScenes.filterVisualPatch(activeVisualOverlay, directorLockedVisualKeys);
      if (!Object.keys(activeVisualOverlay).length) activeVisualOverlay = null;
    }
    pendingVisualPatch = null;
    window.tracker.previewGlow(activeVisualOverlay);
    visualTrackState.manualLocks = [...directorLockedVisualKeys];
  }
  return activeVisualOverlay
    ? { ...nextSettings, ...activeVisualOverlay }
    : nextSettings;
}

function restoreUserVisualBaseline() {
  if (!userVisualBaseline || !settings) return;
  const visual = { ...userVisualBaseline };
  activeVisualOverlay = null;
  window.tracker.previewGlow(null);
  pendingVisualPatch = { visual, source: "restore" };
  settings = { ...settings, ...visual };
  applySettings();
}

function updateVisualAutomationStatus() {
  const presetStatus = $("status_songPresetsEnabled");
  const directorStatus = $("status_directorMode");
  if (presetStatus) {
    presetStatus.textContent = !settings?.songPresetsEnabled
      ? "Auto-load is off. Saved looks are kept."
      : !visualTrackState ? "Play a song to save its look."
      : visualTrackState.presetStatus === "checking" ? "Checking this song…"
      : visualTrackState.preset ? `Saved look loaded for ${visualTrackState.np.title || "this song"}.`
      : "No saved look for this song yet.";
  }
  if (directorStatus) {
    const locked = visualTrackState?.manualLocks?.length || 0;
    const manualNote = locked ? ` · respecting ${locked} manual choice${locked === 1 ? "" : "s"}` : "";
    directorStatus.textContent = !settings?.directorMode
      ? "Off — your normal settings stay in control."
      : visualTrackState?.preset ? "A saved song look has priority."
      : !settings?.beat ? `Directing from lyric flow${visualTrackState?.directorName ? `: ${visualTrackState.directorName}` : ""}${manualNote}. Turn on Listen and react for full audio analysis.`
      : visualTrackState?.directorName ? `Directing: ${visualTrackState.directorName}${visualTrackState.decision?.reasons?.length ? ` · ${visualTrackState.decision.reasons.join(" + ")}` : ""}${manualNote}.`
      : "Waiting for the song's genre and lyric pace.";
  }
}

function applyVisualPatch(patch, source, name, { badge = true } = {}) {
  const visual = window.VisualScenes.filterVisualPatch(patch, directorLockedVisualKeys);
  if (!Object.keys(visual).length) return;
  pendingVisualPatch = { visual, source };
  activeVisualOverlay = visual;
  window.tracker.previewGlow(visual);
  if (visualTrackState) {
    visualTrackState.source = source;
    visualTrackState.manualLocks = [...directorLockedVisualKeys];
  }
  settings = { ...settings, ...visual };
  applySettings();
  if (name && badge) showVisualSceneBadge(
    source === "preset" ? "SAVED SONG LOOK" : source.startsWith("director-") ? "DIRECTOR // SECTION" : "DIRECTOR MODE",
    name,
  );
}

const DIRECTOR_ENVIRONMENT_KEYS = new Set([
  "backdropOpacity", "glow", "glowStyle", "glowStrength", "glowThickness",
  "glowOverride", "glowColorA", "glowColorB", "glowDance",
]);

// Production hits change light immediately. Their lyric composition follows on
// the next timed word boundary; ordinary stylistic direction still waits for a
// line ending, so the fast path never chops through a word.
function applyDirectorBeatSwitchEnvironment(state, decision, nowMs) {
  const scene = window.VisualScenes.directorSectionScene({
    section: "drop",
    genre: state.genre || "other",
    baseVisual: state.activeSteadyVisual || state.directorBase,
    previousVisual: activeVisualOverlay || {},
    cue: "beat-switch",
    sequence: state.sceneSequence,
  });
  const environment = Object.fromEntries(Object.entries(scene.visual)
    .filter(([key]) => DIRECTOR_ENVIRONMENT_KEYS.has(key)));
  state.lastImmediateBeatSwitchAt = nowMs;
  state.directorName = scene.name;
  state.decision = decision;
  if (typeof window.toggleDirectorGlowPalette === "function") window.toggleDirectorGlowPalette();
  playDirectorAccent("production");
  applyVisualPatch(environment, "director-impact", scene.name);
}

function playDirectorSectionTransition(section) {
  document.body.dataset.directorSection = section || "steady";
  document.body.classList.remove("director-section-changing");
  void document.body.offsetWidth;
  document.body.classList.add("director-section-changing");
  clearTimeout(visualSectionTimer);
  visualSectionTimer = setTimeout(() => document.body.classList.remove("director-section-changing"), 760);
}

function playDirectorAccent(kind = "beat") {
  document.body.dataset.directorAccent = kind;
  document.body.classList.remove("director-accent");
  void document.body.offsetWidth;
  document.body.classList.add("director-accent");
  clearTimeout(visualAccentTimer);
  const duration = kind === "drop" || kind === "production" ? 860 : kind === "structure" ? 620 : 360;
  visualAccentTimer = setTimeout(() => document.body.classList.remove("director-accent"), duration);
}

function playCinematicTrackTransition(np, previousNp = null) {
  if (!settings?.cinematicTransitions || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const layer = $("trackTransition");
  if (!layer) return;
  const fromArt = $("trackTransitionFromArt");
  const art = $("trackTransitionArt");
  fromArt.src = previousNp?.artwork || "";
  fromArt.style.display = previousNp?.artwork ? "" : "none";
  art.src = np.artwork || "";
  art.style.display = np.artwork ? "" : "none";
  $("trackTransitionTitle").textContent = np.title || "New track";
  $("trackTransitionArtist").textContent = np.artist || "";
  document.body.classList.remove("track-transitioning");
  void layer.offsetWidth;
  document.body.classList.add("track-transitioning");
  clearTimeout(visualTransitionTimer);
  visualTransitionTimer = setTimeout(() => document.body.classList.remove("track-transitioning"), 1750);
}

async function loadPresetForVisualTrack() {
  const state = visualTrackState;
  if (!state) return;
  const request = ++visualPresetRequest;
  state.preset = null;
  state.presetStatus = settings.songPresetsEnabled ? "checking" : "disabled";
  updateVisualAutomationStatus();
  if (!settings.songPresetsEnabled) return maybeApplyDirector();
  const preset = await window.tracker.songPresetGet(state.presetKey).catch(() => null);
  if (request !== visualPresetRequest || visualTrackState !== state) return;
  state.presetStatus = preset ? "loaded" : "none";
  state.preset = preset;
  if (preset?.visual) {
    state.directorName = "";
    state.pendingPreset = preset;
  } else {
    maybeApplyDirector();
  }
  updateVisualAutomationStatus();
}

function maybeApplyDirector() {
  const state = visualTrackState;
  if (!state || !settings?.directorMode || state.preset || state.presetStatus === "checking") {
    updateVisualAutomationStatus();
    return;
  }
  const scene = window.VisualScenes.directorScene({ genre: state.genre || "other", wordGap: state.wordGap });
  const signature = JSON.stringify(scene);
  if (signature === state.directorSignature) return;
  if (!state.contextSettled) return;
  state.pendingBaseScene = { scene, signature };
}

function applyDirectorBaseScene(state, scene, signature = JSON.stringify(scene)) {
  if (!state || visualTrackState !== state) return;
  state.directorSignature = signature;
  state.directorName = scene.name;
  state.directorBase = scene.visual;
  state.activeSteadyVisual = scene.visual;
  state.activeSteadyName = scene.name;
  state.pendingBaseScene = null;
  state.section = "steady";
  state.sectionCandidate = "steady";
  state.sectionCandidateSince = performance.now();
  state.sectionChangedAt = performance.now();
  state.queuedSection = null;
  state.queuedDecision = null;
  state.queuedUntil = 0;
  state.lastEvidenceAt = 0;
  state.cadenceIndex = state.sequenceSeed;
  state.sceneSequence = state.sequenceSeed;
  state.nextCadenceAt = performance.now() + window.VisualScenes.directorCadenceDelay(state.cadenceIndex, true);
  state.rapidEvidence = 0;
  state.sustainEvidence = 0;
  Object.keys(state.sectionSignal).forEach((key) => { state.sectionSignal[key] = 0; });
  applyVisualPatch(scene.visual, "director", scene.name);
  updateVisualAutomationStatus();
}

function resetDirectorMode() {
  directorLockedVisualKeys.clear();
  queuedManualVisualKeys.clear();
  pendingManualVisualKeys = [];
  pendingVisualPatch = null;
  clearTimeout(visualSectionTimer);
  clearTimeout(visualAccentTimer);
  document.body.classList.remove("director-section-changing", "director-accent");
  document.body.dataset.directorSection = "steady";
  document.body.dataset.directorAccent = "";
  if (typeof window.resetDirectorGlowPalette === "function") window.resetDirectorGlowPalette();
  if (typeof resetAudioStructureAnalysis === "function") resetAudioStructureAnalysis();

  const state = visualTrackState;
  if (!state) {
    showToast("DIRECTOR RESET — ALL CONTROLS UNLOCKED");
    updateVisualAutomationStatus();
    return;
  }
  state.manualLocks = [];
  state.pendingBaseScene = null;
  state.queuedSection = null;
  state.queuedDecision = null;
  state.queuedSectionSince = 0;
  state.queuedReadyAt = 0;
  state.queuedUntil = 0;
  state.decision = null;
  state.lastAccentAt = 0;
  state.lastImmediateBeatSwitchAt = 0;
  state.lastSectionSampleAt = 0;
  state.sectionEligibleAt = performance.now() + 4000;
  state.directorSignature = "";

  if (state.preset && settings?.songPresetsEnabled) {
    showToast("DIRECTOR UNLOCKED — SAVED SONG LOOK STILL HAS PRIORITY");
    updateVisualAutomationStatus();
    return;
  }
  if (!settings?.directorMode) {
    showToast("DIRECTOR RESET — TURN IT ON WHEN READY");
    updateVisualAutomationStatus();
    return;
  }

  state.contextSettled = true;
  const scene = window.VisualScenes.directorScene({ genre: state.genre || "other", wordGap: state.wordGap });
  applyDirectorBaseScene(state, scene, JSON.stringify(scene));
  showToast("DIRECTOR RESET — ALL CONTROLS UNLOCKED");
}

function beginVisualTrack(np, key, previousKey) {
  const previousNp = visualTrackState?.np || null;
  if (previousKey) playCinematicTrackTransition(np, previousNp);
  if (typeof resetAudioStructureAnalysis === "function") resetAudioStructureAnalysis();
  if (activeVisualOverlay) restoreUserVisualBaseline();
  const sequenceSeed = visualSequenceSeed(key);
  visualTrackState = {
    key,
    presetKey: visualSongKey(np),
    np: { ...np },
    genre: "",
    wordGap: NaN,
    presetStatus: "none",
    preset: null,
    pendingPreset: null,
    manualLocks: [...directorLockedVisualKeys],
    directorName: "",
    directorSignature: "",
    directorBase: null,
    activeSteadyVisual: null,
    activeSteadyName: "",
    pendingBaseScene: null,
    contextSettled: false,
    section: "steady",
    sectionCandidate: "steady",
    sectionCandidateSince: performance.now(),
    sectionChangedAt: performance.now(),
    sectionEligibleAt: performance.now() + 9000,
    lastLyricLine: null,
    lastLyricWord: null,
    queuedSection: null,
    queuedDecision: null,
    queuedSectionSince: 0,
    queuedReadyAt: 0,
    queuedUntil: 0,
    decision: null,
    lastAccentAt: 0,
    lastImmediateBeatSwitchAt: 0,
    sequenceSeed,
    cadenceIndex: sequenceSeed,
    sceneSequence: sequenceSeed,
    nextCadenceAt: Infinity,
    lastStatusAt: 0,
    lastEvidenceAt: 0,
    rapidEvidence: 0,
    sustainEvidence: 0,
    sectionSignal: {
      energy: 0, vocal: 0, phrase: 0, build: 0, duck: 0, drop: 0, impact: 0, pace: 0,
      wpm: 0, density: 0, flow: 0, timingConfidence: 0, vocalGap: 0, nextWpm: 0, nextPace: 0,
      nextDensity: 0, nextGap: 0, paceTrend: 0, forecastFlow: 0, boundaryIn: 99, hook: 0,
      progress: 0, structure: 0, timbreShift: 0, timbreEvidence: 0, loudnessEvidence: 0,
      switchUp: 0, switchDown: 0, productionSwitch: 0, switchConfidence: 0, loudnessTrend: 0,
      lowActivity: 0, quietHold: 0, quietConfidence: 0, reentry: 0, vocalTrend: 0, beatConfidence: 0, bpm: 0,
      bass: 0, flux: 0, emotion: 0, audioConfidence: 0, lineActive: 0, wordSustain: 0,
      vocalSustain: 0, flowHold: 0, drumChange: 0, harmonyChange: 0,
      productionAgreement: 0, tonality: 0, onsetDensity: 0, arrangementLift: 0,
    },
    lastSectionSampleAt: 0,
    source: "defaults",
  };
  const state = visualTrackState;
  setTimeout(() => {
    if (visualTrackState !== state) return;
    state.contextSettled = true;
    maybeApplyDirector();
  }, 900);
  loadPresetForVisualTrack();
}

function updateVisualTrackContext(np, context = {}) {
  if (!visualTrackState || currentTrackKey(np) !== visualTrackState.key) return;
  if (typeof context.genre === "string") {
    visualTrackState.genre = context.genre;
    visualTrackState.contextSettled = true;
  }
  if (Number.isFinite(context.wordGap)) visualTrackState.wordGap = context.wordGap;
  maybeApplyDirector();
}

function commitDirectorSection(state, section, decision, nowMs) {
  const scene = window.VisualScenes.directorSectionScene({
    section,
    genre: state.genre || "other",
    baseVisual: state.activeSteadyVisual || state.directorBase,
    previousVisual: activeVisualOverlay || {},
    cue: decision?.priority,
    sequence: state.sceneSequence,
  });
  state.sceneSequence += 1;
  state.section = section;
  state.sectionChangedAt = nowMs;
  state.sectionCandidate = section;
  state.sectionCandidateSince = nowMs;
  state.queuedSection = null;
  state.queuedDecision = null;
  state.queuedUntil = 0;
  state.decision = decision;
  state.directorName = section === "steady"
    ? (state.activeSteadyName || window.VisualScenes.directorScene({ genre: state.genre || "other", wordGap: state.wordGap }).name)
    : scene.name;
  playDirectorSectionTransition(section);
  state.nextCadenceAt = nowMs + window.VisualScenes.directorCadenceDelay(state.cadenceIndex, false);
  const duplicateImpactBadge = nowMs - state.lastImmediateBeatSwitchAt < 6500;
  applyVisualPatch(scene.visual, "director-section", scene.name, { badge: !duplicateImpactBadge });
  updateVisualAutomationStatus();
}

function commitDirectorCadence(state, nowMs) {
  const scene = window.VisualScenes.directorCadenceScene({
    baseVisual: state.directorBase,
    previousVisual: activeVisualOverlay || {},
    sequence: state.cadenceIndex,
    signal: state.sectionSignal,
  });
  state.cadenceIndex += 1;
  state.activeSteadyVisual = scene.visual;
  state.activeSteadyName = scene.name;
  state.sectionChangedAt = nowMs;
  state.directorName = scene.name;
  state.decision = {
    section: "steady",
    priority: "cadence",
    confidence: 1,
    reasons: scene.reasons,
  };
  state.nextCadenceAt = nowMs + window.VisualScenes.directorCadenceDelay(state.cadenceIndex, false);
  playDirectorSectionTransition("steady");
  applyVisualPatch(scene.visual, "director-cadence", scene.name);
  updateVisualAutomationStatus();
}

function updateVisualAutomationPerformance(sample = {}, nowMs = performance.now()) {
  const state = visualTrackState;
  if (!state || !playing) return;
  const lineIndex = Number.isInteger(sample.lineIndex) ? sample.lineIndex : -1;
  const wordIndex = Number.isInteger(sample.wordIndex) ? sample.wordIndex : -1;
  if (nowMs - state.lastSectionSampleAt < 90) return;
  const lineBoundary = state.lastLyricLine !== null && lineIndex !== state.lastLyricLine
    && (lineIndex >= 0 || state.lastLyricLine >= 0);
  const wordBoundary = state.lastLyricWord !== null
    && `${lineIndex}:${wordIndex}` !== state.lastLyricWord
    && lineIndex >= 0 && wordIndex >= 0;
  state.lastLyricLine = lineIndex;
  state.lastLyricWord = `${lineIndex}:${wordIndex}`;
  state.lastSectionSampleAt = nowMs;
  const safeLineCut = window.VisualScenes.directorCutAllowed({
    hasLyrics: sample.hasLyrics,
    lineActive: sample.lineActive !== 0,
    lineBoundary,
  });
  const cutAllowedFor = (priority = "normal") => window.VisualScenes.directorCutAllowed({
    hasLyrics: sample.hasLyrics,
    lineActive: sample.lineActive !== 0,
    lineBoundary,
    wordBoundary,
    priority,
  });
  if (state.pendingPreset && settings?.songPresetsEnabled && safeLineCut) {
    const preset = state.pendingPreset;
    state.pendingPreset = null;
    applyVisualPatch(preset.visual, "preset", preset.title || state.np.title || "Saved look");
    updateVisualAutomationStatus();
    return;
  }
  if (!settings?.directorMode || state.preset
    || (!state.directorBase && !state.pendingBaseScene)) return;
  if (state.pendingBaseScene && (!sample.hasLyrics || lineBoundary)) {
    applyDirectorBaseScene(state, state.pendingBaseScene.scene, state.pendingBaseScene.signature);
    return;
  }
  const signal = state.sectionSignal;
  const signedKeys = new Set(["loudnessTrend", "vocalTrend", "paceTrend"]);
  const passthroughKeys = new Set(["wpm", "nextWpm", "bpm", "boundaryIn", "progress"]);
  for (const key of Object.keys(signal)) {
    const number = Number(sample[key]) || 0;
    const raw = passthroughKeys.has(key) ? number
      : signedKeys.has(key) ? Math.max(-1.5, Math.min(1.5, number))
      : Math.max(0, Math.min(1.5, number));
    const rate = key === "drop" || key === "impact" || key === "switchUp" || key === "switchDown"
      || key === "productionSwitch" || key === "switchConfidence" || key === "reentry" ? .72
      : raw > signal[key] ? .34 : .16;
    signal[key] += (raw - signal[key]) * rate;
  }
  // A drop is intentionally caught from the raw transient before smoothing;
  // every other section must remain convincing for a short window.
  if ((Number(sample.drop) || 0) > .62) signal.drop = Math.max(signal.drop, Number(sample.drop));
  if ((Number(sample.reentry) || 0) > .38) signal.reentry = Math.max(signal.reentry, Number(sample.reentry));
  const evidenceDt = state.lastEvidenceAt ? Math.max(.05, Math.min(.4, (nowMs - state.lastEvidenceAt) / 1000)) : .18;
  state.lastEvidenceAt = nowMs;
  const actualRapid = sample.lineActive !== 0 && !(Number(sample.vocalGap) || 0)
    && ((Number(sample.wpm) || 0) >= 185 || (Number(sample.pace) || 0) >= .64)
    && ((Number(sample.density) || 0) >= .5 || (Number(sample.flow) || 0) >= .58);
  state.rapidEvidence = Math.max(0, Math.min(1, state.rapidEvidence
    + (actualRapid ? evidenceDt / 1.55 : -evidenceDt / .54)));
  const actualSustain = sample.lineActive !== 0
    && (Number(sample.wordSustain) || 0) > .58
    && (Number(sample.vocal) || 0) > .48
    && (Number(sample.phrase) || 0) > .52
    && (Number(sample.pace) || 0) < .48;
  state.sustainEvidence = Math.max(0, Math.min(1, state.sustainEvidence
    + (actualSustain ? evidenceDt / 1.15 : -evidenceDt / .4)));
  signal.flowHold = state.rapidEvidence;
  signal.vocalSustain = state.sustainEvidence;
  const structural = Math.max(signal.reentry, signal.switchUp, signal.switchDown, signal.structure);
  const rawReentry = Number(sample.reentry) || 0;
  const rawProductionSwitch = Number(sample.productionSwitch) || 0;
  const rawSwitchConfidence = Number(sample.switchConfidence) || 0;
  const rawProductionAgreement = Number(sample.productionAgreement) || 0;
  const rawDrumChange = Number(sample.drumChange) || 0;
  const nearTrackEnd = (Number(sample.progress) || 0) > .94;
  const beatSwitchHit = !nearTrackEnd && ((rawProductionSwitch > .31 && rawSwitchConfidence > .33
      && rawProductionAgreement > .26
      && (rawDrumChange > .18 || (Number(sample.harmonyChange) || 0) > .25
        || ((Number(sample.timbreEvidence) || 0) > .48 && (Number(sample.loudnessEvidence) || 0) > .48)))
    || (rawReentry > .46 && (Number(sample.onsetDensity) || 0) > .18));
  if (nowMs < state.sectionEligibleAt) return;
  if (beatSwitchHit && nowMs - state.lastImmediateBeatSwitchAt > 7500) {
    const scoredDecision = window.VisualScenes.directorDecision(signal, state.section);
    const immediateDecision = {
      ...scoredDecision,
      section: "drop",
      priority: "beat-switch",
      reasons: scoredDecision.reasons?.length ? scoredDecision.reasons : ["production pivot", "layer agreement"],
    };
    applyDirectorBeatSwitchEnvironment(state, immediateDecision, nowMs);
    state.queuedSection = "drop";
    state.queuedDecision = immediateDecision;
    state.queuedSectionSince = nowMs;
    state.queuedReadyAt = nowMs;
    state.queuedUntil = nowMs + 6500;
    state.lastAccentAt = nowMs;
  } else if (beatSwitchHit && nowMs - state.lastAccentAt > 520) {
    state.lastAccentAt = nowMs;
    playDirectorAccent("production");
  } else if (structural > .45 && nowMs - state.lastAccentAt > 950) {
    state.lastAccentAt = nowMs;
    playDirectorAccent("structure");
  } else if (signal.impact > .82 && nowMs - state.lastAccentAt > 620) {
    state.lastAccentAt = nowMs;
    playDirectorAccent("beat");
  }
  const decision = window.VisualScenes.directorDecision(signal, state.section);
  state.decision = decision;
  if (nowMs - state.lastStatusAt > 900 && $("settings")?.classList.contains("open")) {
    state.lastStatusAt = nowMs;
    updateVisualAutomationStatus();
  }
  if (state.queuedSection && nowMs > state.queuedUntil) {
    state.queuedSection = null;
    state.queuedDecision = null;
  }
  const protectedQueue = ["reentry", "beat-switch", "instrument-lift"].includes(state.queuedDecision?.priority);
  if (state.queuedSection && decision.section !== state.queuedSection && !protectedQueue
    && nowMs - state.queuedSectionSince > 450) {
    state.queuedSection = null;
    state.queuedDecision = null;
  }
  if (state.queuedSection && state.queuedSection !== state.section && nowMs >= state.queuedReadyAt
    && cutAllowedFor(state.queuedDecision?.priority)) {
    commitDirectorSection(state, state.queuedSection, state.queuedDecision || decision, nowMs);
    return;
  }
  if (nowMs >= state.nextCadenceAt && !state.queuedSection && safeLineCut) {
    if (state.section === "steady" && decision.section === "steady") {
      commitDirectorCadence(state, nowMs);
      return;
    }
    if (decision.section === state.section) {
      commitDirectorSection(state, state.section, { ...decision, priority: "cadence" }, nowMs);
      return;
    }
  }
  const next = decision.section;
  if (next !== state.sectionCandidate) {
    state.sectionCandidate = next;
    state.sectionCandidateSince = nowMs;
  }
  if (next === state.section) return;
  const stableFor = nowMs - state.sectionCandidateSince;
  const timing = window.VisualScenes.directorSectionTiming(next, state.section);
  const sinceChange = nowMs - state.sectionChangedAt;
  const requiredStable = timing.stableMs * (1.08 - decision.confidence * .38);
  const structuralCue = (next === "drop" && ["reentry", "beat-switch"].includes(decision.priority))
    || (next === "build" && decision.priority === "instrument-lift");
  const requiredHold = decision.priority === "beat-switch" ? Math.min(timing.holdMs, 900)
    : decision.priority === "reentry" ? Math.min(timing.holdMs, 2400)
    : decision.priority === "instrument-lift" ? Math.min(timing.holdMs, 1800)
    : timing.holdMs;
  if (structuralCue && state.queuedSection !== next) {
    state.queuedSection = next;
    state.queuedDecision = decision;
    state.queuedSectionSince = nowMs;
    state.queuedReadyAt = ["reentry", "beat-switch", "instrument-lift"].includes(decision.priority)
      ? nowMs
      : Math.max(nowMs, state.sectionChangedAt + 900);
    state.queuedUntil = nowMs + 6500;
  }
  // The line boundary is a one-frame event. When a remembered arrangement
  // return lands exactly there, commit it now instead of missing the boundary
  // and waiting for the next line.
  if (structuralCue && state.queuedSection === next && nowMs >= state.queuedReadyAt
    && cutAllowedFor(decision.priority)) {
    commitDirectorSection(state, next, decision, nowMs);
    return;
  }
  if (stableFor < requiredStable || sinceChange < requiredHold) return;
  if (state.queuedSection !== next) {
    state.queuedSection = next;
    state.queuedDecision = decision;
    state.queuedSectionSince = nowMs;
    state.queuedReadyAt = nowMs;
    state.queuedUntil = nowMs + Math.max(4200, Math.min(7000, (Number(signal.boundaryIn) || 0) * 1000 + 1200));
  }
  // Ordinary scenes wait at the wings until the line ends. Verified production
  // and instrument-layer cues may use a word boundary; instrumentals remain
  // fully music-led because there are no lyrics to interrupt.
  if (!cutAllowedFor(decision.priority)) return;
  commitDirectorSection(state, next, decision, nowMs);
}

function endVisualTrack() {
  visualPresetRequest++;
  visualTrackState = null;
  delete document.body.dataset.directorSection;
  if (typeof window.resetDirectorGlowPalette === "function") window.resetDirectorGlowPalette();
  if (activeVisualOverlay) restoreUserVisualBaseline();
  updateVisualAutomationStatus();
}

async function saveCurrentSongPreset() {
  if (!visualTrackState?.presetKey) return showToast("PLAY A SONG BEFORE SAVING A LOOK");
  const result = await window.tracker.songPresetSave({
    key: visualTrackState.presetKey,
    title: visualTrackState.np.title,
    artist: visualTrackState.np.artist,
    album: visualTrackState.np.album,
    visual: visualSnapshot(),
  }).catch((error) => ({ ok: false, error: error?.message }));
  if (!result?.ok) return showToast((result?.error || "COULD NOT SAVE THIS LOOK").toUpperCase());
  visualTrackState.preset = result.preset;
  visualTrackState.pendingPreset = null;
  visualTrackState.presetStatus = "loaded";
  visualTrackState.directorName = "";
  visualTrackState.directorBase = null;
  showToast(settings.songPresetsEnabled ? "SONG LOOK SAVED" : "SONG LOOK SAVED — AUTO-LOAD IS OFF");
  updateVisualAutomationStatus();
}

async function forgetCurrentSongPreset() {
  if (!visualTrackState?.presetKey) return showToast("PLAY A SONG FIRST");
  const result = await window.tracker.songPresetRemove(visualTrackState.presetKey).catch(() => null);
  if (!result?.ok) return showToast("COULD NOT FORGET THIS LOOK");
  visualTrackState.preset = null;
  visualTrackState.pendingPreset = null;
  visualTrackState.presetStatus = "none";
  visualTrackState.directorSignature = "";
  showToast(result.removed ? "SAVED SONG LOOK REMOVED" : "THIS SONG HAD NO SAVED LOOK");
  maybeApplyDirector();
  updateVisualAutomationStatus();
}

function onVisualAutomationSettingsApplied() {
  if (!settings?.automationNotifications) $("visualSceneBadge")?.classList.remove("show");
  const current = visualSnapshot();
  if (lastVisualSnapshot) {
    const automated = pendingVisualPatch
      && Object.keys(pendingVisualPatch.visual).every((key) => sameVisualValue(current[key], pendingVisualPatch.visual[key]));
    if (automated) pendingVisualPatch = null;
    else if (pendingManualVisualKeys.length && visualTrackState) {
      visualTrackState.source = "director+manual";
      visualTrackState.manualLocks = [...directorLockedVisualKeys];
    }
  }
  pendingManualVisualKeys = [];
  lastVisualSnapshot = current;

  const toggles = {
    songPresetsEnabled: !!settings.songPresetsEnabled,
    directorMode: !!settings.directorMode,
  };
  const previousToggles = automationToggleSnapshot;
  automationToggleSnapshot = toggles;
  if (previousToggles && visualTrackState) {
    if (!previousToggles.songPresetsEnabled && toggles.songPresetsEnabled) loadPresetForVisualTrack();
    else if (previousToggles.songPresetsEnabled && !toggles.songPresetsEnabled) {
      visualTrackState.preset = null;
      visualTrackState.pendingPreset = null;
      visualTrackState.presetStatus = "disabled";
      visualTrackState.directorSignature = "";
      if (toggles.directorMode) maybeApplyDirector();
      else restoreUserVisualBaseline();
    }
    if (!previousToggles.directorMode && toggles.directorMode) {
      directorLockedVisualKeys.clear();
      visualTrackState.manualLocks = [];
      visualTrackState.directorSignature = "";
      maybeApplyDirector();
    } else if (previousToggles.directorMode && !toggles.directorMode && !visualTrackState.preset) {
      restoreUserVisualBaseline();
    }
  }
  updateVisualAutomationStatus();
}
