const assert = require("node:assert/strict");
const test = require("node:test");
const { createAudioStructureDetector } = require("../src/shared/audio-structure");

function feed(detector, seconds, frame, startMs = 0) {
  let result;
  const steps = Math.round(seconds / .05);
  for (let index = 0; index < steps; index++) result = detector.update(frame, startMs + index * 50, .05);
  return result;
}

test("structural detector ignores a stable arrangement", () => {
  const detector = createAudioStructureDetector();
  const result = feed(detector, 9, { bands: [.5, .24, .15, .08, .03], loudness: .62, vocal: .55 });
  assert.ok(result.contrast < .08);
  assert.ok(result.switchUp < .05);
  assert.ok(result.switchDown < .05);
});

test("structural detector catches a sustained louder timbre switch", () => {
  const detector = createAudioStructureDetector();
  feed(detector, 15, { bands: [.18, .2, .28, .22, .12], loudness: .42, vocal: .64 });
  const result = feed(detector, .8, { bands: [.55, .25, .1, .06, .04], loudness: .88, vocal: .34 }, 15000);
  assert.ok(result.contrast > .35);
  assert.ok(result.switchUp > .2);
});

test("structural detector distinguishes a quieter section change", () => {
  const detector = createAudioStructureDetector();
  feed(detector, 15, { bands: [.52, .24, .12, .08, .04], loudness: .86, vocal: .62 });
  const result = feed(detector, .8, { bands: [.12, .18, .28, .27, .15], loudness: .28, vocal: .2 }, 15000);
  assert.ok(result.switchDown > .2);
});

test("structural detector remembers an interlude and fires once on its return", () => {
  const detector = createAudioStructureDetector();
  feed(detector, 15, {
    bands: [.48, .25, .14, .09, .04], loudness: .82, rawLoudness: .09, vocal: .58, beat: true,
  });
  const interlude = feed(detector, 3.2, {
    bands: [.18, .2, .25, .23, .14], loudness: .24, rawLoudness: .012, vocal: .08,
  }, 15000);
  assert.ok(interlude.quietHold > .75);
  assert.ok(interlude.quietConfidence > .55);
  assert.ok(interlude.lowActivity > .45);

  const returned = feed(detector, .2, {
    bands: [.58, .22, .1, .06, .04], loudness: .95, rawLoudness: .105, vocal: .5, beat: true,
  }, 18200);
  assert.ok(returned.reentry > .65);
  assert.ok(returned.switchUp > .65);
});

test("low-volume stable audio does not become a permanent quiet break", () => {
  const detector = createAudioStructureDetector();
  const result = feed(detector, 9, {
    bands: [.3, .25, .2, .15, .1], loudness: .7, rawLoudness: .018, vocal: .42,
  });
  assert.ok(result.quietHold < .1);
  assert.ok(result.reentry < .05);
});

test("an isolated chord change does not impersonate a beat switch", () => {
  const detector = createAudioStructureDetector();
  const base = {
    bands: [.42, .24, .17, .11, .06], loudness: .68, rawLoudness: .06, vocal: .48,
    chroma: [.38, 0, 0, 0, .31, 0, 0, .31, 0, 0, 0, 0], tonality: .78,
    drums: { kick: .42, snare: .3, hat: .28, onset: .34 }, beat: true,
  };
  feed(detector, 7, base);
  const result = feed(detector, 1.2, {
    ...base,
    chroma: [0, .34, 0, 0, 0, .33, 0, 0, .33, 0, 0, 0],
  }, 7000);
  assert.ok(result.harmonyChange > .2);
  assert.ok(result.productionAgreement < .4);
  assert.ok(result.switchUp < .08);
  assert.ok(result.switchDown < .08);
});

test("a drum fill alone stays an accent instead of becoming a section switch", () => {
  const detector = createAudioStructureDetector();
  const base = {
    bands: [.44, .23, .16, .11, .06], loudness: .7, rawLoudness: .065, vocal: .44,
    chroma: [.4, 0, 0, 0, .3, 0, 0, .3, 0, 0, 0, 0], tonality: .7,
    drums: { kick: .38, snare: .28, hat: .24, onset: .3 }, beat: true,
  };
  feed(detector, 7, base);
  const result = feed(detector, .9, {
    ...base,
    drums: { kick: .92, snare: .95, hat: .9, onset: 1 },
  }, 7000);
  assert.ok(result.drumChange > .25);
  assert.ok(result.switchUp < .08);
  assert.ok(result.switchDown < .08);
});

test("a vocal entrance without a production-layer change is not a beat switch", () => {
  const detector = createAudioStructureDetector();
  const production = {
    chroma: [.38, 0, 0, 0, .31, 0, 0, .31, 0, 0, 0, 0], tonality: .74,
    drums: { kick: .4, snare: .3, hat: .24, onset: .32 }, beat: true,
  };
  feed(detector, 15, {
    ...production, bands: [.42, .23, .17, .12, .06], loudness: .58, rawLoudness: .05, vocal: .08,
  });
  const result = feed(detector, 1.1, {
    ...production, bands: [.33, .25, .22, .14, .06], loudness: .76, rawLoudness: .073, vocal: .9,
  }, 15000);
  assert.ok(result.vocalTrend > .25);
  assert.ok(result.drumChange < .15);
  assert.ok(result.harmonyChange < .15);
  assert.ok(result.switchUp < .08);
});

test("drums, harmony and timbre agreeing create one production switch", () => {
  const detector = createAudioStructureDetector();
  feed(detector, 15, {
    bands: [.22, .2, .27, .2, .11], loudness: .48, rawLoudness: .04, vocal: .62,
    chroma: [.38, 0, 0, 0, .31, 0, 0, .31, 0, 0, 0, 0], tonality: .75,
    drums: { kick: .28, snare: .44, hat: .2, onset: .3 }, beat: true,
  });
  const result = feed(detector, 1.1, {
    bands: [.58, .22, .09, .07, .04], loudness: .9, rawLoudness: .1, vocal: .3,
    chroma: [0, .34, 0, 0, 0, .33, 0, 0, .33, 0, 0, 0], tonality: .8,
    drums: { kick: .88, snare: .2, hat: .7, onset: .92 }, beat: true,
  }, 15000);
  assert.ok(result.drumChange > .2);
  assert.ok(result.harmonyChange > .2);
  assert.ok(result.productionAgreement > .35);
  assert.ok(result.switchUp > .2);
});

test("startup adaptation cannot announce a beat switch", () => {
  const detector = createAudioStructureDetector();
  feed(detector, 4, {
    bands: [.2, .2, .25, .22, .13], loudness: .4, rawLoudness: .035, vocal: .35,
    chroma: [.4, 0, 0, 0, .3, 0, 0, .3, 0, 0, 0, 0], tonality: .72,
    drums: { kick: .25, snare: .3, hat: .2, onset: .28 },
  });
  const result = feed(detector, 2, {
    bands: [.58, .2, .1, .08, .04], loudness: .92, rawLoudness: .1, vocal: .2,
    chroma: [0, .35, 0, 0, 0, .3, 0, 0, .35, 0, 0, 0], tonality: .8,
    drums: { kick: .9, snare: .15, hat: .72, onset: .9 },
  }, 4000);
  assert.ok(result.productionSwitch < .05);
});

test("a timbre, loudness and drum pivot can switch without a chord change", () => {
  const detector = createAudioStructureDetector();
  const chroma = [.4, 0, 0, 0, .3, 0, 0, .3, 0, 0, 0, 0];
  feed(detector, 15, {
    bands: [.2, .2, .28, .2, .12], loudness: .46, rawLoudness: .04, vocal: .56,
    chroma, tonality: .72, drums: { kick: .25, snare: .42, hat: .18, onset: .28 },
  });
  let strongest = null;
  for (let index = 0; index < 16; index++) {
    const result = detector.update({
      bands: [.6, .2, .09, .07, .04], loudness: .9, rawLoudness: .1, vocal: .28,
      chroma, tonality: .72, drums: { kick: .9, snare: .16, hat: .74, onset: .94 }, beat: true,
    }, 15000 + index * 50, .05);
    if (!strongest || result.productionSwitch > strongest.productionSwitch) strongest = result;
  }
  assert.ok(strongest.productionSwitch > .7);
  assert.ok(strongest.switchConfidence > .45);
  assert.ok(strongest.harmonyChange < .15);
});

test("short vocal gaps do not arm arrangement-return thrashing", () => {
  const detector = createAudioStructureDetector();
  const full = { bands: [.48, .25, .14, .09, .04], loudness: .8, rawLoudness: .085, vocal: .58,
    drums: { kick: .5, snare: .32, hat: .25, onset: .36 } };
  feed(detector, 15, full);
  let result;
  for (let cycle = 0; cycle < 4; cycle++) {
    result = feed(detector, .75, { ...full, vocal: .04, rawLoudness: .065, loudness: .66 }, 15000 + cycle * 1500);
    result = feed(detector, .75, full, 15750 + cycle * 1500);
  }
  assert.ok(result.quietConfidence < .1);
  assert.ok(result.reentry < .05);
});

test("an abrupt multi-layer production cut fires at the cut instead of the later return", () => {
  const detector = createAudioStructureDetector();
  feed(detector, 15, {
    bands: [.56, .22, .1, .08, .04], loudness: .9, rawLoudness: .1, vocal: .5,
    chroma: [.4, 0, 0, 0, .3, 0, 0, .3, 0, 0, 0, 0], tonality: .8,
    drums: { kick: .86, snare: .25, hat: .68, onset: .9 }, beat: true,
  });
  let strongest = null;
  for (let index = 0; index < 8; index++) {
    const result = detector.update({
      bands: [.08, .12, .25, .32, .23], loudness: .08, rawLoudness: .001, vocal: .04,
      chroma: [0, .35, 0, 0, 0, .3, 0, 0, .35, 0, 0, 0], tonality: .75,
      drums: { kick: .03, snare: .02, hat: .02, onset: .02 },
    }, 15000 + index * 50, .05);
    if (!strongest || result.productionSwitch > strongest.productionSwitch) strongest = result;
  }
  assert.ok(strongest.productionSwitch > .7);
  assert.ok(strongest.switchDown > .7);
  assert.ok(strongest.switchConfidence > .7);
});
