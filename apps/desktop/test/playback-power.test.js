const assert = require("node:assert/strict");
const test = require("node:test");
const { createPlaybackPowerGuard } = require("../src/main/playback-power");

test("active playback owns one display-sleep blocker and releases it on pause", () => {
  let nextId = 40;
  const active = new Set();
  const starts = [];
  const stops = [];
  const guard = createPlaybackPowerGuard({
    start(kind) { starts.push(kind); active.add(++nextId); return nextId; },
    stop(id) { stops.push(id); active.delete(id); },
    isStarted(id) { return active.has(id); },
  });

  assert.equal(guard.setActive(true), true);
  assert.equal(guard.setActive(true), true);
  assert.deepEqual(starts, ["prevent-display-sleep"]);
  assert.equal(guard.setActive(false), false);
  assert.deepEqual(stops, [41]);
  assert.equal(guard.isActive(), false);
});
