const assert = require("node:assert/strict");
const test = require("node:test");

const {
  VISUAL_KEYS, extractPreset, changedVisualKeys, filterVisualPatch,
  averageWordGap, lyricDirectorContext, directorScene, directorDecision, directorSection,
  directorCadenceScene, directorCadenceDelay, directorSectionTiming, directorCutAllowed, directorSectionScene,
} = require("../src/shared/visual-scenes");

test("song presets contain visual settings only", () => {
  const preset = extractPreset({ lyricsLayout: "prism", lyricsSize: 142, directorMode: true, performanceMode: "smooth" });
  assert.deepEqual(preset, { lyricsLayout: "prism", lyricsSize: 142 });
  assert.ok(VISUAL_KEYS.includes("glowStyle"));
  assert.ok(!VISUAL_KEYS.includes("directorMode"));
});

test("manual visual locks protect only the controls the user changed", () => {
  assert.deepEqual(changedVisualKeys(
    { lyricsSize: 132, backdropStyle: "album", glowStrength: 110 },
    { lyricsSize: 96, backdropStyle: "album", glowStrength: 110 },
  ), ["lyricsSize"]);
  assert.deepEqual(filterVisualPatch(
    { lyricsSize: 86, lyricsLayout: "kinetic", backdropStyle: "canvas", glowStrength: 145, directorMode: true },
    new Set(["lyricsSize", "backdropStyle"]),
  ), { lyricsLayout: "kinetic", glowStrength: 145 });
});

test("director scenes match genre and promote dense timed vocals to Prism Roll", () => {
  const calm = directorScene({ genre: "jazz", wordGap: .7 });
  assert.equal(calm.name, "Midnight cards");
  assert.equal(calm.visual.lyricsLayout, "captioncards");

  const fast = directorScene({ genre: "pop", wordGap: .22 });
  assert.equal(fast.name, "Velocity prism");
  assert.equal(fast.visual.lyricsLayout, "prism");
});

test("average word gap ignores pauses and malformed timings", () => {
  const gap = averageWordGap([{ words: [{ t: 1 }, { t: 1.2 }, { t: 1.5 }, { t: 8 }, { text: "bad" }] }]);
  assert.ok(Math.abs(gap - .25) < .001);
});

test("lyric context forecasts the next line's flow before it begins", () => {
  const lines = [
    { t: 10, end: 13, text: "slow words here" },
    { t: 13.4, end: 15.4, text: "this next line has a much quicker run of words" },
  ];
  const context = lyricDirectorContext(lines, 0, 12, 100);
  assert.ok(context.nextWpm > context.wpm);
  assert.ok(context.paceTrend > 0);
  assert.equal(context.boundaryIn, 1);
});

test("lyric context exposes exact and estimated word boundaries for mid-verse production cuts", () => {
  const exact = lyricDirectorContext([{
    t: 10, end: 12, text: "one two three", words: [
      { text: "one", t: 10, end: 10.5 }, { text: "two", t: 10.5, end: 11.1 }, { text: "three", t: 11.1, end: 12 },
    ],
  }], 0, 10.7, 100);
  assert.equal(exact.wordIndex, 1);
  const estimated = lyricDirectorContext([{ t: 20, end: 24, text: "one two three four" }], 0, 23.2, 100);
  assert.equal(estimated.wordIndex, 3);
});

test("scheduled cadence leads with Constellation and never leaves a whole song visually static", () => {
  const scene = directorCadenceScene({
    sequence: 0,
    baseVisual: { backdropStyle: "album", lyricsFont: "round" },
    signal: { pace: .45, density: .55 },
  });
  assert.equal(scene.visual.lyricsLayout, "constellation");
  assert.equal(scene.visual.glowStyle, "comet");
  assert.equal(Object.hasOwn(scene.visual, "lyricsSize"), false);
  assert.equal(Object.hasOwn(directorScene({ genre: "rap", wordGap: .2 }).visual, "lyricsSize"), false);
  for (const section of ["quiet", "build", "drop", "rapid", "sustain"]) {
    assert.equal(Object.hasOwn(directorSectionScene({ section, baseVisual: {} }).visual, "lyricsSize"), false);
  }
  assert.equal(scene.visual.backdropStyle, "album");
  assert.ok(scene.reasons.includes("normal-paced verse"));
  assert.ok(directorCadenceDelay(0, true) <= 21000);
  assert.ok(Math.max(...Array.from({ length: 8 }, (_, index) => directorCadenceDelay(index))) <= 31500);
  const ribbon = directorCadenceScene({ sequence: 1, baseVisual: {}, signal: { pace: .4, density: .5 } });
  assert.equal(ribbon.visual.lyricsLayout, "ribbon");
  assert.equal(ribbon.visual.glowStyle, "eclipse");
  const poster = directorCadenceScene({ sequence: 4, baseVisual: {}, signal: { pace: .4, density: .5 } });
  assert.equal(poster.visual.lyricsLayout, "poster");
  assert.equal(poster.visual.glowStyle, "nebula");
});

test("multimodal decisions combine structural, vocal and future flow signals", () => {
  const switchDecision = directorDecision({
    reentry: .9, switchUp: .9, structure: .8, energy: .75, bass: .8,
    onsetDensity: .8, productionAgreement: .7, drumChange: .72, harmonyChange: .65, timbreShift: .7,
  }, "steady");
  assert.equal(switchDecision.section, "drop");
  assert.ok(switchDecision.reasons.includes("arrangement return"));
  const forecastDecision = directorDecision({ pace: .35, nextPace: .95, forecastFlow: .9, density: .7, vocal: .65 }, "steady");
  assert.equal(forecastDecision.section, "build");
});

test("section director distinguishes drops, rapid verses, builds and held notes", () => {
  assert.equal(directorSection({
    drop: .9, structure: .8, switchUp: .85, productionSwitch: .92, switchConfidence: .78,
    energy: .8, productionAgreement: .72, drumChange: .7, harmonyChange: .62,
    timbreShift: .74, timbreEvidence: .76, loudnessEvidence: .7,
  }), "drop");
  assert.equal(directorSection({ pace: .92, density: .8, flow: .85, flowHold: .9, vocal: .7, energy: .65 }), "rapid");
  assert.equal(directorSection({ build: .7, energy: .62 }), "build");
  assert.equal(directorSection({ phrase: .85, vocal: .8, wordSustain: .88, vocalSustain: .82, lineActive: 1, pace: .2 }), "sustain");
  assert.equal(directorSection({ duck: .8, lowActivity: .9, quietHold: .8, quietConfidence: .86, energy: .28 }), "quiet");
  const layer = directorDecision({ arrangementLift: .9, timbreShift: .55, energy: .68, loudnessTrend: .3 });
  assert.equal(layer.section, "build");
  assert.equal(layer.priority, "instrument-lift");
  assert.ok(layer.reasons.includes("new instrumental layer"));
});

test("beat-switch decisions require multiple production layers", () => {
  const chordOnly = directorDecision({
    harmonyChange: .95, tonality: .9, timbreShift: .12, structure: .18, productionAgreement: .18,
  });
  assert.notEqual(chordOnly.section, "drop");
  const drumFill = directorDecision({
    drumChange: .95, onsetDensity: 1, impact: .9, timbreShift: .18, structure: .2, productionAgreement: .2,
  });
  assert.notEqual(drumFill.section, "drop");
  const fullSwitch = directorDecision({
    drumChange: .78, harmonyChange: .72, timbreShift: .7, structure: .75,
    timbreEvidence: .74, loudnessEvidence: .68, productionAgreement: .76,
    productionSwitch: .92, switchConfidence: .82, switchUp: .86, drop: .7, onsetDensity: .8,
  });
  assert.equal(fullSwitch.section, "drop");
  assert.equal(fullSwitch.priority, "beat-switch");
  assert.ok(fullSwitch.reasons.includes("drum pattern change"));
});

test("moderate multi-layer production pivots still register as beat switches", () => {
  const decision = directorDecision({
    productionSwitch: .36, switchConfidence: .38, productionAgreement: .31,
    drumChange: .24, harmonyChange: .27, timbreShift: .32, structure: .34,
    timbreEvidence: .29, loudnessEvidence: .42, onsetDensity: .38,
  });
  assert.equal(decision.section, "drop");
  assert.equal(decision.priority, "beat-switch");
});

test("sentence endings and forecasts do not invent held notes, quiet breaks, or flow runs", () => {
  const sentenceEnd = directorDecision({
    phrase: .88, vocal: .7, vocalGap: 1, lineActive: 0, wordSustain: 0, energy: .54, audioConfidence: 1,
  });
  assert.equal(sentenceEnd.section, "steady");
  const forecastOnly = directorDecision({
    pace: .28, density: .3, flow: .2, nextPace: 1, nextDensity: .9, forecastFlow: 1, boundaryIn: .7,
  });
  assert.notEqual(forecastOnly.section, "rapid");
});

test("layered vocals stay in the normal Director language instead of opening a dual-voice scene", () => {
  const decision = directorDecision({
    vocalLayers: .92, lyricLayers: 1, vocal: .82, phrase: .74, lineActive: 1,
  });
  assert.notEqual(decision.section, "layered");
  assert.notEqual(decision.priority, "vocal-layer");
});

test("director keeps style changes on lines but lets real production hits use word boundaries", () => {
  assert.equal(directorCutAllowed({ hasLyrics: true, lineActive: true, lineBoundary: false }), false);
  assert.equal(directorCutAllowed({ hasLyrics: true, lineActive: true, wordBoundary: true }), false);
  assert.equal(directorCutAllowed({ hasLyrics: true, lineActive: true, wordBoundary: true, priority: "beat-switch" }), true);
  assert.equal(directorCutAllowed({ hasLyrics: true, lineActive: true, wordBoundary: true, priority: "instrument-lift" }), true);
  assert.equal(directorCutAllowed({ hasLyrics: true, lineActive: true, wordBoundary: true, priority: "vocal-layer" }), false);
  assert.equal(directorCutAllowed({ hasLyrics: true, lineBoundary: true }), true);
  assert.equal(directorCutAllowed({ hasLyrics: true, lineActive: false, lineBoundary: false }), true);
  assert.equal(directorCutAllowed({ hasLyrics: false, lineBoundary: false }), true);
  assert.deepEqual(directorSectionTiming("drop", "steady"), { stableMs: 120, holdMs: 4500 });
  assert.deepEqual(directorSectionTiming("steady", "drop"), { stableMs: 2200, holdMs: 10000 });
});

test("section scenes keep the song's base direction while changing composition", () => {
  const scene = directorSectionScene({
    section: "drop",
    genre: "rap",
    baseVisual: { backdropStyle: "black", lyricsFont: "round", lyricsLayout: "morphstack" },
  });
  assert.equal(scene.name, "Beat switch");
  assert.equal(scene.visual.backdropStyle, "black");
  assert.equal(scene.visual.lyricsFont, "round");
  assert.equal(scene.visual.lyricsLayout, "kinetic");
  assert.equal(scene.visual.glowStyle, "prism");
});

test("every Director function has its own glow language", () => {
  const styles = ["quiet", "build", "drop", "rapid", "sustain"]
    .map((section) => directorSectionScene({ section, genre: "rap", baseVisual: {} }).visual.glowStyle);
  assert.deepEqual(styles, ["halo", "horizon", "prism", "flowline", "aurora"]);
  assert.equal(new Set(styles).size, styles.length);
});
