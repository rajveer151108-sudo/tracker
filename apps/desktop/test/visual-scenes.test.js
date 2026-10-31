const assert = require("node:assert/strict");
const test = require("node:test");

const { VISUAL_KEYS, extractPreset, averageWordGap, directorScene } = require("../src/shared/visual-scenes");

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
