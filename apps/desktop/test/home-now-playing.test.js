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
