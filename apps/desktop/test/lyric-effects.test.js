const test = require("node:test");
const assert = require("node:assert/strict");
const effects = require("../src/renderer/components/lyric-effects");

test("function words and lyric ad-libs are never highlight candidates", () => {
  for (const word of ["the", "and", "under", "because", "they", "would", "don't", "yeah", "ooh"]) {
    assert.equal(effects.isHighlightCandidate(word), false, word);
  }
  for (const word of ["midnight", "running", "diamonds", "memory"]) {
    assert.equal(effects.isHighlightCandidate(word), true, word);
  }
});

test("highlights are meaningful, deterministic and never adjacent", () => {
  const words = "the midnight city and broken mirrors under neon lights keep calling my name while silver memories slowly disappear tonight".split(" ");
  const rows = words.map((text) => ({ text }));
  const first = [...effects.selectHighlights(rows)].sort((a, b) => a - b);
  const second = [...effects.selectHighlights(rows)].sort((a, b) => a - b);
  assert.deepEqual(first, second);
  assert.ok(first.length >= 2);
  for (let i = 1; i < first.length; i += 1) assert.ok(first[i] - first[i - 1] >= 2);
  for (const index of first) assert.equal(effects.isHighlightCandidate(words[index]), true);
});

test("emoji accents are semantic, spaced out and avoid immediate repeats", () => {
  const words = "love fire money star heart moon cash diamond kiss music party dance".split(" ");
  const decorated = effects.decorateRows(words.map((text) => ({ text })));
  const emojiIndexes = decorated.flatMap((row, index) => row.emoji ? [index] : []);
  assert.ok(emojiIndexes.length >= 2);
  for (let i = 1; i < emojiIndexes.length; i += 1) assert.ok(emojiIndexes[i] - emojiIndexes[i - 1] >= 4);
  assert.equal(effects.effectForWord("diamonds").emoji, "💎");
  assert.equal(effects.effectForWord("heartbroken").emoji, "💔");
  assert.equal(effects.effectForWord("sneakers").emoji, "👟");
  assert.equal(effects.effectForWord("midnight").emoji, "🌙");
  assert.equal(effects.effectForWord("ordinary"), null);
});

test("expressive lyric lines carry more visual weight than filler", () => {
  const powerful = effects.expressionForText("She cries to the heaven above");
  const ordinary = effects.expressionForText("We got one coming up");
  assert.ok(powerful >= 0.65);
  assert.ok(powerful > ordinary + 0.5);
});
