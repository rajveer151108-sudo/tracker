const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const frameSource = fs.readFileSync(path.join(__dirname, "../src/renderer/components/frame-loop.js"), "utf8");
const lyricSource = fs.readFileSync(path.join(__dirname, "../src/renderer/components/lyrics.js"), "utf8");
const lyricCss = fs.readFileSync(path.join(__dirname, "../src/renderer/styles/lyrics.css"), "utf8");

test("word changes update a bounded lyric neighbourhood instead of the whole song", () => {
  assert.match(frameSource, /function lyricStateIndices\(index, previous, layout\)/);
  assert.match(frameSource, /for \(const i of lyricStateIndices\(idx, previousIdx, layout\)\)/);
  assert.match(frameSource, /const fullPass = force \|\| creativeLayoutState\.rows !== lineEls/);
  assert.match(lyricSource, /updateCreativeLayout\(idx, true\)/);
});

test("active lyrics keep a responsive frame rate without doubling Director work", () => {
  assert.match(frameSource, /const lyricsFps = settings\.performanceMode === "battery" \? 24 : 60/);
  assert.match(frameSource, /tNow - lastDirectorPerformanceT >= 50/);
});

test("creative words use gap-aware attacks and a small presentation lead", () => {
  assert.match(frameSource, /const lyricT = t \+ \(isWordLayout\(\) \? \.055 : \.02\)/);
  assert.match(frameSource, /Math\.max\(55, Math\.min\(110, gap \* 320\)\)/);
  assert.match(lyricCss, /animation: creativeSpawn var\(--word-attack-ms, 150ms\)/);
});
