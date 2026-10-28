const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const coreSource = fs.readFileSync(
  path.join(__dirname, "../src/renderer/components/core.js"),
  "utf8"
);
const homeSource = fs.readFileSync(
  path.join(__dirname, "../src/renderer/components/home.js"),
  "utf8"
);

async function routePlayback() {
  const calls = { api: 0, desktop: 0 };
  const context = {
    document: { getElementById() {}, documentElement: {} },
    window: {
      tracker: {
        async spApi() { calls.api += 1; return { ok: true }; },
        async playUri() { calls.desktop += 1; return { ok: true }; },
      },
    },
    calls,
    result: null,
  };
  await vm.runInNewContext(
    `${coreSource}\nresult = playSpotifyUri("spotify:track:1234567890");`,
    context
  );
  return { calls, result: await context.result };
}

function queueFrom(response, expectedUri) {
  const context = { response, expectedUri, result: null };
  vm.runInNewContext(
    `${homeSource}\nresult = homeQueueFromResponse(response, expectedUri);`,
    context
  );
  return JSON.parse(JSON.stringify(context.result));
}

function spotifyTrack(id, name) {
  return {
    uri: `spotify:track:${id}`,
    name,
    artists: [{ name: "Artist" }],
    album: { name: "Album", images: [] },
  };
}

test("left-rack playback sends one desktop command and no competing Web API command", async () => {
  const { calls, result } = await routePlayback();
  assert.equal(calls.api, 0);
  assert.equal(calls.desktop, 1);
  assert.equal(result.source, "desktop");
});

test("queue cards accept only the requested playback context and exclude the current song", () => {
  const current = spotifyTrack("CURRENT0000", "Current");
  const next = Array.from({ length: 6 }, (_, index) => spotifyTrack(`NEXT000000${index}`, `Next ${index + 1}`));
  const response = { ok: true, data: { currently_playing: current, queue: [current, ...next] } };

  assert.deepEqual(
    queueFrom(response, current.uri).map((track) => track.title),
    ["Next 1", "Next 2", "Next 3", "Next 4", "Next 5"]
  );
  assert.equal(queueFrom(response, "spotify:track:DIFFERENT0"), null);
});
