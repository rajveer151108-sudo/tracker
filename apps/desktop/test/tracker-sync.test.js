const test = require("node:test");
const assert = require("node:assert/strict");
const { normaliseTrack, hasReachedPlayThreshold } = require("../src/main/tracker-sync");

test("normaliseTrack creates a stable Spotify play payload", () => {
  const now = Date.parse("2026-10-27T00:00:30.000Z");
  const track = normaliseTrack({
    id: "spotify:track:4PTG3Z6ehGkBFwjybzWkR8",
    title: "Test song",
    artist: "Test artist",
    album: "Test album",
    artwork: "https://example.com/cover.jpg",
    durationMs: 180000,
    positionSec: 30,
  }, now);

  assert.equal(track.trackId, "4PTG3Z6ehGkBFwjybzWkR8");
  assert.equal(track.playedAt, "2026-10-27T00:00:00.000Z");
  assert.equal(hasReachedPlayThreshold(track), true);
});

test("play threshold is half the track or 30 seconds, whichever comes first", () => {
  assert.equal(hasReachedPlayThreshold({ durationMs: 40_000, positionSec: 19.9 }), false);
  assert.equal(hasReachedPlayThreshold({ durationMs: 40_000, positionSec: 20 }), true);
  assert.equal(hasReachedPlayThreshold({ durationMs: 240_000, positionSec: 29.9 }), false);
  assert.equal(hasReachedPlayThreshold({ durationMs: 240_000, positionSec: 30 }), true);
});

test("non-track Spotify URIs cannot enter the sync queue", () => {
  assert.equal(normaliseTrack({ id: "spotify:episode:123456789012", durationMs: 1000, positionSec: 1 }), null);
  assert.equal(normaliseTrack({ id: "not-spotify", durationMs: 1000, positionSec: 1 }), null);
});
