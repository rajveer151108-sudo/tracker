const test = require("node:test");
const assert = require("node:assert/strict");
const { reconcilePlaybackClock } = require("../src/shared/playback-clock");

test("small Spotify clock wobble does not jerk the lyric timeline", () => {
  const clock = reconcilePlaybackClock({
    localPosition: 20,
    localAtMs: 1000,
    localPlaying: true,
    observedPosition: 20.96,
    observedAtMs: 2000,
    nextPlaying: true,
  });
  assert.equal(clock.snapped, false);
  assert.equal(clock.position, 21);
});

test("moderate drift is corrected gradually", () => {
  const clock = reconcilePlaybackClock({
    localPosition: 20,
    localAtMs: 1000,
    localPlaying: true,
    observedPosition: 21.4,
    observedAtMs: 2000,
    nextPlaying: true,
  });
  assert.equal(clock.snapped, false);
  assert.equal(clock.position, 21.112);
});

test("a delayed Spotify response is compared at the instant it arrives", () => {
  const clock = reconcilePlaybackClock({
    localPosition: 20,
    localAtMs: 1000,
    localPlaying: true,
    observedPosition: 20.9,
    observationStartedAtMs: 1800,
    observedAtMs: 2000,
    nextPlaying: true,
  });
  assert.equal(clock.sampleAgeMs, 100);
  assert.equal(clock.position, 21);
  assert.equal(clock.drift, 0);
});

test("paused samples are never advanced by transport latency", () => {
  const clock = reconcilePlaybackClock({
    localPosition: 21,
    localAtMs: 1000,
    localPlaying: false,
    observedPosition: 21,
    observationStartedAtMs: 1600,
    observedAtMs: 2000,
    nextPlaying: false,
  });
  assert.equal(clock.sampleAgeMs, 0);
  assert.equal(clock.position, 21);
});

test("seeks and play-state changes snap immediately", () => {
  const seek = reconcilePlaybackClock({ localPosition: 20, localAtMs: 1000, localPlaying: true, observedPosition: 42, observedAtMs: 2000, nextPlaying: true });
  const pause = reconcilePlaybackClock({ localPosition: 20, localAtMs: 1000, localPlaying: true, observedPosition: 21, observedAtMs: 2000, nextPlaying: false });
  assert.deepEqual([seek.snapped, seek.position], [true, 42]);
  assert.deepEqual([pause.snapped, pause.position], [true, 21]);
});
