const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const frameSource = fs.readFileSync(path.join(__dirname, "../src/renderer/components/frame-loop.js"), "utf8");
const lyricSource = fs.readFileSync(path.join(__dirname, "../src/renderer/components/lyrics.js"), "utf8");
const lyricCss = fs.readFileSync(path.join(__dirname, "../src/renderer/styles/lyrics.css"), "utf8");
const beatSource = fs.readFileSync(path.join(__dirname, "../src/renderer/components/beat.js"), "utf8");

test("word changes update a bounded lyric neighbourhood instead of the whole song", () => {
  assert.match(frameSource, /function lyricStateIndices\(index, previous, layout\)/);
  assert.match(frameSource, /for \(const i of lyricStateIndices\(idx, previousIdx, layout\)\)/);
  assert.match(frameSource, /const fullPass = force \|\| creativeLayoutState\.rows !== lineEls/);
  assert.match(lyricSource, /updateCreativeLayout\(idx, true\)/);
});

test("all active views keep a responsive frame rate without doubling Director work", () => {
  assert.match(frameSource, /const activeFps = settings\.performanceMode === "battery" \? 30 : 60/);
  assert.match(frameSource, /document\.hidden \? 8 : playing \? activeFps : idleFps/);
  assert.match(frameSource, /tNow - lastDirectorPerformanceT >= 50/);
});

test("expensive audio analysis is cached below the visual frame rate", () => {
  assert.match(beatSource, /tNow - lastVoiceAnalysis >= 30/);
  assert.match(beatSource, /tNow - lastProductionAnalysis >= 45/);
  assert.match(beatSource, /if \(productionDue\) \{\s*const structure = audioStructureDetector\.update/);
  assert.match(beatSource, /tNow - lastSend > 45/);
});

test("creative words use gap-aware attacks and a small presentation lead", () => {
  assert.match(frameSource, /const lyricT = t \+ \(isWordLayout\(\) \? \.055 : \.02\)/);
  assert.match(frameSource, /Math\.max\(55, Math\.min\(110, gap \* 320\)\)/);
  assert.match(lyricCss, /animation: creativeSpawn var\(--word-attack-ms, 150ms\)/);
});

test("line-reading layouts keep a fixed baseline and a single entrance", () => {
  assert.match(frameSource, /const fixedFocusLayout = isCreativeLayout\(\) \|\| layout === "flash" \|\| layout === "wordstream"/);
  assert.match(frameSource, /const arrivalClass = layout === "prism" \|\| impactLayout/);
  assert.match(lyricCss, /body\[data-layout="flash"\] #lines \{ inset: 0; padding: 0; transform: none/);
  assert.match(lyricCss, /body\[data-layout="flash"\] \.line\.active \{ transform: translate\(-50%,-50%\) scale\(1\)/);
  assert.match(lyricCss, /body\[data-layout="wordstream"\] #lines \{ inset: 0; padding: 0; transform: none/);
  assert.match(lyricCss, /body\.line-timed-only\.lyrics-motion \.line\.active \{ translate: 0 0/);
});

test("prism rows stay mounted so their roll can interpolate continuously", () => {
  assert.match(lyricCss, /body\[data-layout="prism"\] \.line\.creative-hidden\{visibility:hidden\}/);
  assert.doesNotMatch(lyricCss, /body\[data-layout="prism"\] \.line\.creative-hidden\{display:none\}/);
  assert.match(frameSource, /layout === "prism" \|\| impactLayout\s*\? ""/);
});
