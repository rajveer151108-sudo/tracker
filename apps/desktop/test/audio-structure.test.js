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
  feed(detector, 6, { bands: [.18, .2, .28, .22, .12], loudness: .42, vocal: .64 });
  const result = feed(detector, .8, { bands: [.55, .25, .1, .06, .04], loudness: .88, vocal: .34 }, 6000);
  assert.ok(result.contrast > .35);
  assert.ok(result.switchUp > .2);
});

test("structural detector distinguishes a quieter section change", () => {
  const detector = createAudioStructureDetector();
  feed(detector, 6, { bands: [.52, .24, .12, .08, .04], loudness: .86, vocal: .62 });
  const result = feed(detector, .8, { bands: [.12, .18, .28, .27, .15], loudness: .28, vocal: .2 }, 6000);
  assert.ok(result.switchDown > .2);
});
