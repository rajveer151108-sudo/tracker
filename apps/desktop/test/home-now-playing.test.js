const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.join(__dirname, "../src/renderer/components/home.js"),
  "utf8"
);

function keyFor(nowPlaying) {
  const context = { input: nowPlaying, result: "" };
  vm.runInNewContext(`${source}\nresult = homeNowPlayingKey(input);`, context);
  return context.result;
}

function pendingTransition({ pendingUri, pendingAt, commandAt, nowPlaying, now }) {
  const context = { pendingUri, pendingAt, commandAt, nowPlaying, now, result: "" };
  vm.runInNewContext(
    `${source}\nresult = homePendingTransition(pendingUri, pendingAt, commandAt, nowPlaying, now);`,
    context
  );
  return context.result;
}

test("home player identity changes when Spotify metadata changes without an id or artwork", () => {
  const first = keyFor({
    state: "playing",
    title: "Superpowers",
    artist: "Daniel Caesar",
    album: "Never Enough",
  });
  const second = keyFor({
    state: "playing",
    title: "Bounce Road Blues",
    artist: "J. Cole",
    album: "Might Delete Later",
  });

  assert.notEqual(first, second);
});

test("home player identity includes play and pause state", () => {
  const track = { id: "spotify:track:abc", title: "One song", artist: "One artist" };
  assert.notEqual(keyFor({ ...track, state: "playing" }), keyFor({ ...track, state: "paused" }));
});

test("a transient stopped state cannot cancel the insertion animation", () => {
  assert.equal(pendingTransition({
    pendingUri: "spotify:track:target",
    pendingAt: 1000,
    commandAt: 0,
    nowPlaying: { state: "stopped" },
    now: 2400,
  }), "wait");
});

test("old Spotify state is ignored while selected-track playback is starting", () => {
  assert.equal(pendingTransition({
    pendingUri: "spotify:track:target",
    pendingAt: 1000,
    commandAt: 2200,
    nowPlaying: { state: "playing", uri: "spotify:track:old" },
    now: 4300,
  }), "wait");
});

test("pending playback clears only after Spotify confirms the selected track", () => {
  assert.equal(pendingTransition({
    pendingUri: "spotify:track:target",
    pendingAt: 1000,
    commandAt: 2200,
    nowPlaying: { state: "playing", uri: "spotify:track:target" },
    now: 2500,
  }), "confirmed");
});

test("a missing playback confirmation eventually expires cleanly", () => {
  assert.equal(pendingTransition({
    pendingUri: "spotify:track:target",
    pendingAt: 1000,
    commandAt: 2200,
    nowPlaying: { state: "stopped" },
    now: 12000,
  }), "expired");
});
