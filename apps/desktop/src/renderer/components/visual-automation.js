// =====================================================================
// Per-song looks, cinematic track changes, and automatic scene direction.
// =====================================================================
let visualTrackState = null;
let visualPresetRequest = 0;
let visualTransitionTimer = 0;
let visualBadgeTimer = 0;
let visualSectionTimer = 0;
let lastVisualSnapshot = null;
let pendingVisualPatch = null;
let automationToggleSnapshot = null;

function visualSongKey(np) {
  return String(np?.uri || np?.id || currentTrackKey(np) || "").normalize("NFKC").trim().toLowerCase();
}

function visualSnapshot() {
  return window.VisualScenes.extractPreset(settings || {});
}

function sameVisualValue(a, b) {
  return typeof a === "number" && typeof b === "number" ? Math.abs(a - b) < .001 : a === b;
}

function showVisualSceneBadge(kicker, title) {
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
    directorStatus.textContent = !settings?.directorMode
      ? "Off — your normal settings stay in control."
      : visualTrackState?.preset ? "A saved song look has priority."
      : visualTrackState?.manualOverride ? "Your manual changes have priority for this song."
      : visualTrackState?.directorName ? `Directing: ${visualTrackState.directorName}.`
      : "Waiting for the song's genre and lyric pace.";
  }
}

function applyVisualPatch(patch, source, name) {
  const visual = window.VisualScenes.extractPreset(patch);
  if (!Object.keys(visual).length) return;
  pendingVisualPatch = { visual, source };
  if (visualTrackState) visualTrackState.source = source;
  window.tracker.setSettings(visual);
  if (name) showVisualSceneBadge(
    source === "preset" ? "SAVED SONG LOOK" : source === "director-section" ? "DIRECTOR // SECTION" : "DIRECTOR MODE",
    name,
  );
}

function playDirectorSectionTransition(section) {
  document.body.dataset.directorSection = section || "steady";
  document.body.classList.remove("director-section-changing");
  void document.body.offsetWidth;
  document.body.classList.add("director-section-changing");
  clearTimeout(visualSectionTimer);
  visualSectionTimer = setTimeout(() => document.body.classList.remove("director-section-changing"), 760);
}

function playCinematicTrackTransition(np) {
  if (!settings?.cinematicTransitions || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const layer = $("trackTransition");
  if (!layer) return;
  const art = $("trackTransitionArt");
  art.src = np.artwork || "";
  art.style.display = np.artwork ? "" : "none";
  $("trackTransitionTitle").textContent = np.title || "New track";
  $("trackTransitionArtist").textContent = np.artist || "";
  document.body.classList.remove("track-transitioning");
  void layer.offsetWidth;
  document.body.classList.add("track-transitioning");
  clearTimeout(visualTransitionTimer);
  visualTransitionTimer = setTimeout(() => document.body.classList.remove("track-transitioning"), 1450);
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
    state.manualOverride = false;
    state.directorName = "";
    applyVisualPatch(preset.visual, "preset", preset.title || state.np.title || "Saved look");
  } else {
    maybeApplyDirector();
  }
  updateVisualAutomationStatus();
}

function maybeApplyDirector() {
  const state = visualTrackState;
  if (!state || !settings?.directorMode || state.preset || state.presetStatus === "checking" || state.manualOverride) {
    updateVisualAutomationStatus();
    return;
  }
  const scene = window.VisualScenes.directorScene({ genre: state.genre || "other", wordGap: state.wordGap });
  const signature = JSON.stringify(scene);
  if (signature === state.directorSignature) return;
  state.directorSignature = signature;
  state.directorName = scene.name;
  state.directorBase = scene.visual;
  state.section = "steady";
  state.sectionCandidate = "steady";
  state.sectionCandidateSince = performance.now();
  state.sectionChangedAt = performance.now();
  Object.keys(state.sectionSignal).forEach((key) => { state.sectionSignal[key] = 0; });
  applyVisualPatch(scene.visual, "director", scene.name);
  updateVisualAutomationStatus();
}

function beginVisualTrack(np, key, previousKey) {
  if (previousKey) playCinematicTrackTransition(np);
  visualTrackState = {
    key,
    presetKey: visualSongKey(np),
    np: { ...np },
    genre: "",
    wordGap: NaN,
    presetStatus: "none",
    preset: null,
    manualOverride: false,
    directorName: "",
    directorSignature: "",
    directorBase: null,
    section: "steady",
    sectionCandidate: "steady",
    sectionCandidateSince: performance.now(),
    sectionChangedAt: performance.now(),
    sectionSignal: { energy: 0, vocal: 0, phrase: 0, build: 0, duck: 0, drop: 0, impact: 0, pace: 0 },
    lastSectionSampleAt: 0,
    source: "defaults",
  };
  loadPresetForVisualTrack();
}

function updateVisualTrackContext(np, context = {}) {
  if (!visualTrackState || currentTrackKey(np) !== visualTrackState.key) return;
  if (typeof context.genre === "string") visualTrackState.genre = context.genre;
  if (Number.isFinite(context.wordGap)) visualTrackState.wordGap = context.wordGap;
  maybeApplyDirector();
}

function updateDirectorPerformance(sample = {}, nowMs = performance.now()) {
  const state = visualTrackState;
  if (!state || !settings?.directorMode || state.preset || state.manualOverride || !state.directorBase || !playing) return;
  if (nowMs - state.lastSectionSampleAt < 180) return;
  state.lastSectionSampleAt = nowMs;
  const signal = state.sectionSignal;
  for (const key of Object.keys(signal)) {
    const raw = Math.max(0, Math.min(1.5, Number(sample[key]) || 0));
    const rate = key === "drop" || key === "impact" ? .72 : raw > signal[key] ? .34 : .13;
    signal[key] += (raw - signal[key]) * rate;
  }
  // A drop is intentionally caught from the raw transient before smoothing;
  // every other section must remain convincing for a short window.
  if ((Number(sample.drop) || 0) > .62) signal.drop = Math.max(signal.drop, Number(sample.drop));
  const next = window.VisualScenes.directorSection(signal);
  if (next !== state.sectionCandidate) {
    state.sectionCandidate = next;
    state.sectionCandidateSince = nowMs;
  }
  if (next === state.section) return;
  const stableFor = nowMs - state.sectionCandidateSince;
  const required = next === "drop" ? 0 : next === "build" ? 850 : next === "rapid" ? 1050 : next === "sustain" ? 1250 : next === "quiet" ? 1450 : 2100;
  const sinceChange = nowMs - state.sectionChangedAt;
  const hold = next === "drop" ? 2400 : state.section === "drop" ? 3400 : 5200;
  if (stableFor < required || sinceChange < hold) return;
  const scene = window.VisualScenes.directorSectionScene({
    section: next,
    genre: state.genre || "other",
    baseVisual: state.directorBase,
  });
  state.section = next;
  state.sectionChangedAt = nowMs;
  state.directorName = next === "steady" ? window.VisualScenes.directorScene({ genre: state.genre || "other", wordGap: state.wordGap }).name : scene.name;
  playDirectorSectionTransition(next);
  applyVisualPatch(scene.visual, "director-section", scene.name);
  updateVisualAutomationStatus();
}

function endVisualTrack() {
  visualPresetRequest++;
  visualTrackState = null;
  delete document.body.dataset.directorSection;
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
  visualTrackState.presetStatus = "loaded";
  visualTrackState.manualOverride = false;
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
  visualTrackState.presetStatus = "none";
  visualTrackState.directorSignature = "";
  showToast(result.removed ? "SAVED SONG LOOK REMOVED" : "THIS SONG HAD NO SAVED LOOK");
  maybeApplyDirector();
  updateVisualAutomationStatus();
}

function onVisualAutomationSettingsApplied() {
  const current = visualSnapshot();
  if (lastVisualSnapshot) {
    const changed = Object.keys(current).filter((key) => !sameVisualValue(current[key], lastVisualSnapshot[key]));
    const automated = pendingVisualPatch
      && Object.keys(pendingVisualPatch.visual).every((key) => sameVisualValue(current[key], pendingVisualPatch.visual[key]));
    if (automated) pendingVisualPatch = null;
    else if (changed.length && visualTrackState) {
      visualTrackState.manualOverride = true;
      visualTrackState.source = "manual";
      visualTrackState.directorName = "";
      visualTrackState.directorBase = null;
    }
  }
  lastVisualSnapshot = current;

  const toggles = {
    songPresetsEnabled: !!settings.songPresetsEnabled,
    directorMode: !!settings.directorMode,
  };
  if (automationToggleSnapshot && visualTrackState) {
    if (!automationToggleSnapshot.songPresetsEnabled && toggles.songPresetsEnabled) loadPresetForVisualTrack();
    else if (automationToggleSnapshot.songPresetsEnabled && !toggles.songPresetsEnabled) {
      visualTrackState.preset = null;
      visualTrackState.presetStatus = "disabled";
      visualTrackState.directorSignature = "";
      maybeApplyDirector();
    }
    if (!automationToggleSnapshot.directorMode && toggles.directorMode) {
      visualTrackState.manualOverride = false;
      visualTrackState.directorSignature = "";
      maybeApplyDirector();
    }
  }
  automationToggleSnapshot = toggles;
  updateVisualAutomationStatus();
}
