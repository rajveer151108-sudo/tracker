const test = require("node:test");
const assert = require("node:assert/strict");
const { activeLyricIndex, finalLineEnd } = require("../src/shared/lyric-timing");

const lines = [
  { t: 18, end: 19.5, text: "first", words: [{ t: 18, end: 19.5, text: "first" }] },
  { t: 22, end: 23.2, text: "last", words: [{ t: 22, end: 23.2, text: "last" }] },
];

test("instrumental intros do not expose the first future lyric", () => {
  assert.equal(activeLyricIndex(lines, 0), -1);
  assert.equal(activeLyricIndex(lines, 17.99), -1);
  assert.equal(activeLyricIndex(lines, 18), 0);
});

test("the final lyric disappears after its timing and a short grace period", () => {
  assert.equal(finalLineEnd(lines), 23.2);
  assert.equal(activeLyricIndex(lines, 23.5), 1);
  assert.equal(activeLyricIndex(lines, 24.46), -1);
});

test("untimed final lines receive a four-second display window", () => {
  const plain = [{ t: 10, text: "ending" }];
  assert.equal(finalLineEnd(plain), 14);
  assert.equal(activeLyricIndex(plain, 15.26), -1);
});

test("an explicitly ended lyric clears during a real vocal gap", () => {
  const gapped = [
    { t: 10, end: 11, text: "done" },
    { t: 14, end: 15, text: "back" },
  ];
  assert.equal(activeLyricIndex(gapped, 11.3), 0);
  assert.equal(activeLyricIndex(gapped, 11.6), -1);
  assert.equal(activeLyricIndex(gapped, 14), 1);
});
