const test = require("node:test");
const assert = require("node:assert/strict");
const { parseTTML, parseKpoe, parseQRC, parseLyricsFile, parseAny, parseTime } = require("../lyricsparse");
const {
  lyricsCacheKey, normalizeInfo, spotifyTrackId, wordStats, bestLyricsFile, findSyncedLrc,
} = require("../src/main/lyrics-service");

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

test("TTML preserves overlapping background vocals without mixing them into the main lyric", () => {
  const result = parseTTML(`
    <tt><body><div>
      <p begin="1s" end="4s">
        <span begin="1s" end="2s">main </span>
        <span begin="2s" end="3s">voice</span>
        <span ttm:role="x-bg"><span begin="1.5s" end="2.4s">other</span></span>
      </p>
    </div></body></tt>
  `);
  assert.deepEqual(result.lines[0].words.map((word) => word.text), ["main", "voice"]);
  assert.deepEqual(result.lines[0].backgroundWords, [{ t: 1.5, end: 2.4, text: "other" }]);
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
  assert.deepEqual(result.lines[0].backgroundWords, [{ t: 1.3, end: 1.6, text: "adlib" }]);
  assert.equal(result.lines[0].end, 2.8);
});

test("parseAny finds TTML nested inside a provider JSON response", () => {
  const response = JSON.stringify({ payload: '<tt><body><p begin="2s" end="3s"><span begin="2s" end="3s">Go</span></p></body></tt>' });
  const result = parseAny(response);
  assert.equal(result.lines[0].words[0].text, "Go");
});

test("QRC keeps each word on its absolute song clock", () => {
  const result = parseQRC(`<QrcInfos><LyricInfo><Lyric_1 LyricContent="[1100,1171]Sauce (1100,360)it (1460,210)up(1670,601)\n[2300,900]Now (2300,300)go(2600,600)"/></LyricInfo></QrcInfos>`);
  assert.ok(result);
  assert.deepEqual(result.lines[0].words.map((word) => word.text), ["Sauce", "it", "up"]);
  assert.equal(result.lines[0].words[0].t, 1.1);
  assert.equal(result.lines[0].words[2].end, 2.271);
  assert.equal(result.lines[1].text, "Now go");
});

test("Lyricsfile YAML exposes LRCLIB word timing", () => {
  const lyricsfile = `version: "0.1"
lines:
  - text: "I can see it"
    start_ms: 1200
    end_ms: 2600
    words:
      - text: "I"
        start_ms: 1200
        end_ms: 1400
      - text: "can"
        start_ms: 1400
        end_ms: 1800
      - text: "see"
        start_ms: 1800
        end_ms: 2200
      - text: "it"
        start_ms: 2200
        end_ms: 2600`;
  const result = parseLyricsFile(lyricsfile);
  assert.ok(result);
  assert.equal(result.lines[0].t, 1.2);
  assert.equal(result.lines[0].end, 2.6);
  assert.deepEqual(result.lines[0].words.map((word) => word.text), ["I", "can", "see", "it"]);
  assert.equal(parseAny(JSON.stringify({ lyricsfile })).lines[0].words[2].t, 1.8);
});

test("provider helpers select duration-matched word timing and line-synced fallbacks", () => {
  const lyricsfile = `version: "0.1"
lines:
  - text: "one two three four"
    start_ms: 1000
    end_ms: 2200
    words:
      - text: "one"
        start_ms: 1000
        end_ms: 1300
      - text: "two"
        start_ms: 1300
        end_ms: 1600
      - text: "three"
        start_ms: 1600
        end_ms: 1900
      - text: "four"
        start_ms: 1900
        end_ms: 2200`;
  const selected = bestLyricsFile([
    { duration: 90, lyricsfile },
    { duration: 120, lyricsfile },
  ], 119);
  assert.equal(selected.duration, 120);
  assert.match(findSyncedLrc({ data: { lyrics: "[00:01.00]A line" } }), /A line/);
});

test("provider matching removes badges and version suffixes without changing the original object", () => {
  const info = { title: "Song® (feat. Guest) - Remastered 2011", artist: "Artist" };
  assert.equal(normalizeInfo(info).title, "Song");
  assert.equal(info.title, "Song® (feat. Guest) - Remastered 2011");
});

test("Spotify track IDs are extracted for exact provider matching", () => {
  assert.equal(spotifyTrackId("spotify:track:4uLU6hMCjMI75M1A2tKUQC"), "4uLU6hMCjMI75M1A2tKUQC");
  assert.equal(spotifyTrackId("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=test"), "4uLU6hMCjMI75M1A2tKUQC");
});

test("lyrics cache keys cannot collide when Spotify briefly omits track IDs", () => {
  const whiteFerrari = lyricsCacheKey({ title: "White Ferrari", artist: "Frank Ocean", album: "Blonde", durationSec: 248 });
  const sticky = lyricsCacheKey({ title: "Sticky", artist: "Drake", album: "Honestly, Nevermind", durationSec: 243 });
  assert.notEqual(whiteFerrari, sticky);
});

test("lyrics cache keys include metadata even when a Spotify ID is present", () => {
  const first = lyricsCacheKey({ id: "spotify:track:4uLU6hMCjMI75M1A2tKUQC", title: "One", artist: "Artist", durationSec: 100 });
  const staleId = lyricsCacheKey({ id: "spotify:track:4uLU6hMCjMI75M1A2tKUQC", title: "Two", artist: "Artist", durationSec: 120 });
  assert.notEqual(first, staleId);
});

test("wordStats rejects mostly line-timed provider responses", () => {
  const parsed = { lines: [
    { words: [{ text: "one" }, { text: "two" }, { text: "three" }, { text: "four" }] },
    { words: [] },
    { words: [] },
    { words: [] },
  ] };
  assert.equal(wordStats(parsed).usable, false);
});
