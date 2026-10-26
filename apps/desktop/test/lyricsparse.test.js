const test = require("node:test");
const assert = require("node:assert/strict");
const { parseTTML, parseKpoe, parseAny, parseTime } = require("../lyricsparse");

test("parseTime accepts TTML clock and unit formats", () => {
  assert.equal(parseTime("01:02.500"), 62.5);
  assert.equal(parseTime("1250ms"), 1.25);
  assert.equal(parseTime("3.2s"), 3.2);
});

test("TTML syllables are combined into timed words", () => {
  const result = parseTTML(`
    <tt><body><div>
      <p begin="1.0s" end="3.0s">
        <span begin="1.0s" end="1.25s">Nev</span><span begin="1.25s" end="1.6s">er </span>
        <span begin="1.7s" end="2.2s">miss</span>
      </p>
    </div></body></tt>
  `);
  assert.ok(result);
  assert.deepEqual(result.lines[0].words.map((word) => word.text), ["Never", "miss"]);
  assert.equal(result.lines[0].words[0].t, 1);
  assert.equal(result.lines[0].words[0].end, 1.6);
});

test("Kpoe timing ignores background vocals and preserves foreground words", () => {
  const result = parseKpoe({
    lyrics: [{
      time: 1000,
      duration: 1800,
      text: "fast verse",
      syllabus: [
        { time: 1000, duration: 300, text: "fast " },
        { time: 1300, duration: 300, text: "adlib", isBackground: true },
        { time: 1600, duration: 400, text: "verse" },
      ],
    }],
  });
  assert.ok(result);
  assert.deepEqual(result.lines[0].words.map((word) => word.text), ["fast", "verse"]);
  assert.equal(result.lines[0].end, 2.8);
});

test("parseAny finds TTML nested inside a provider JSON response", () => {
  const response = JSON.stringify({ payload: '<tt><body><p begin="2s" end="3s"><span begin="2s" end="3s">Go</span></p></body></tt>' });
  const result = parseAny(response);
  assert.equal(result.lines[0].words[0].text, "Go");
});
