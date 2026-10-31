const assert = require("node:assert/strict");
const test = require("node:test");

const {
  VISUAL_KEYS, extractPreset, averageWordGap, lyricDirectorContext, directorScene, directorDecision, directorSection,
  directorSectionTiming, directorCutAllowed, directorSectionScene,
} = require("../src/shared/visual-scenes");

test("song presets contain visual settings only", () => {
  const preset = extractPreset({ lyricsLayout: "prism", lyricsSize: 142, directorMode: true, performanceMode: "smooth" });
  assert.deepEqual(preset, { lyricsLayout: "prism", lyricsSize: 142 });
  assert.ok(VISUAL_KEYS.includes("glowStyle"));
  assert.ok(!VISUAL_KEYS.includes("directorMode"));
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

test("multimodal decisions combine structural, vocal and future flow signals", () => {
  const switchDecision = directorDecision({ reentry: .9, switchUp: .9, structure: .8, energy: .75, bass: .8 }, "steady");
  assert.equal(switchDecision.section, "drop");
  assert.ok(switchDecision.reasons.includes("arrangement return"));
  const forecastDecision = directorDecision({ pace: .35, nextPace: .95, forecastFlow: .9, density: .7, vocal: .65 }, "steady");
  assert.equal(forecastDecision.section, "build");
});

test("section director distinguishes drops, rapid verses, builds and held notes", () => {
  assert.equal(directorSection({ drop: .9, structure: .8, energy: .8 }), "drop");
  assert.equal(directorSection({ pace: .92, density: .8, flow: .85, flowHold: .9, vocal: .7, energy: .65 }), "rapid");
  assert.equal(directorSection({ build: .7, energy: .62 }), "build");
  assert.equal(directorSection({ phrase: .85, vocal: .8, wordSustain: .88, vocalSustain: .82, lineActive: 1, pace: .2 }), "sustain");
  assert.equal(directorSection({ duck: .8, lowActivity: .9, quietHold: .8, energy: .28 }), "quiet");
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

test("director cuts only at lyric boundaries while instrumentals stay music-led", () => {
  assert.equal(directorCutAllowed({ hasLyrics: true, lineActive: true, lineBoundary: false }), false);
  assert.equal(directorCutAllowed({ hasLyrics: true, lineBoundary: true }), true);
  assert.equal(directorCutAllowed({ hasLyrics: true, lineActive: false, lineBoundary: false }), true);
  assert.equal(directorCutAllowed({ hasLyrics: false, lineBoundary: false }), true);
  assert.deepEqual(directorSectionTiming("drop", "steady"), { stableMs: 0, holdMs: 2800 });
  assert.deepEqual(directorSectionTiming("steady", "drop"), { stableMs: 1700, holdMs: 9000 });
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
  assert.equal(scene.visual.glowStyle, "flowline");
});
