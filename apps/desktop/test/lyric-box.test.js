const assert = require("node:assert/strict");
const test = require("node:test");
const { lyricBoxMetrics, glyphUnits, fitTextToLyricBox, compositionFontCap } = require("../src/shared/lyric-box");

test("the lyric slider grows an invisible box instead of a fixed font", () => {
  const small = lyricBoxMetrics(18, 1400, 900);
  const large = lyricBoxMetrics(160, 1400, 900);
  assert.ok(large.width > small.width * 1.8);
  assert.ok(large.height > small.height * 2);
  assert.ok(large.width <= 1400 * .88);
  assert.ok(large.height <= 900 * .5);
});

test("short words fill the same box while long words shrink to stay inside", () => {
  const box = lyricBoxMetrics(90, 1400, 900);
  const short = fitTextToLyricBox("I'm", box);
  const medium = fitTextToLyricBox("alright", box);
  const long = fitTextToLyricBox("extraordinarily", box);
  assert.ok(short > medium);
  assert.ok(medium > long);
  assert.ok(glyphUnits("WWW") > glyphUnits("iii"));
  assert.ok(glyphUnits("extraordinarily") * long <= box.width * .94);
});

test("multi-word layouts size the composition instead of giving every word the whole screen", () => {
  const box = lyricBoxMetrics(160, 1400, 760);
  const uncapped = fitTextToLyricBox("on", box);
  const phraseBuilder = compositionFontCap("buildstack", 1400, 760);
  const morphStack = compositionFontCap("morphstack", 1400, 760);
  assert.ok(uncapped > 300);
  assert.ok(phraseBuilder >= 60 && phraseBuilder <= 90);
  assert.ok(morphStack > phraseBuilder);
  assert.equal(compositionFontCap("flash", 1400, 760), Infinity);
});

test("lyric stacks shrink safely when the user asks for more history rows", () => {
  const twoRows = compositionFontCap("wordstack", 1400, 760, { historyLines: 2 });
  const sixRows = compositionFontCap("wordstack", 1400, 760, { historyLines: 6 });
  assert.ok(twoRows > sixRows);
  assert.ok(sixRows * 6 <= 760 * .6);
});
