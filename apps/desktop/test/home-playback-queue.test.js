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

async function routePlayback({ apiResults = [{ ok: true }], contextUri = null, nowPlayingResults = [] } = {}) {
  const calls = { api: 0, desktop: 0, nowPlaying: 0, requests: [] };
  const context = {
    document: { getElementById() {}, documentElement: {} },
    window: {
      tracker: {
        async spApi(request) { calls.api += 1; calls.requests.push(request); return apiResults.shift() || { ok: false, status: 500, error: "No mock response" }; },
        async playUri() { calls.desktop += 1; return { ok: true }; },
        async nowPlaying() {
          calls.nowPlaying += 1;
          return nowPlayingResults.shift() || { state: "playing", uri: "spotify:track:1234567890" };
        },
      },
    },
    setTimeout(callback) { callback(); return 1; },
    calls,
    result: null,
  };
  await vm.runInNewContext(
    `${coreSource}\nresult = playSpotifyUri("spotify:track:1234567890", ${JSON.stringify(contextUri)});`,
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

test("left-rack playback uses one focus-safe Web API command when available", async () => {
  const { calls, result } = await routePlayback();
  assert.equal(calls.api, 1);
  assert.equal(calls.desktop, 0);
  assert.equal(result.source, "web-api");
});

test("left-rack playback wakes an available device before using desktop fallback", async () => {
  const { calls, result } = await routePlayback({ apiResults: [
    { ok: false, status: 404, error: "No active device" },
    { ok: true, data: { devices: [{ id: "mac_device_1", type: "Computer", is_restricted: false }] } },
    { ok: true },
    { ok: true },
  ] });
  assert.equal(calls.api, 4);
  assert.equal(calls.desktop, 0);
  assert.equal(result.source, "web-api-device");
  assert.equal(calls.requests[2].path, "/me/player");
  assert.match(calls.requests[3].path, /device_id=mac_device_1/);
});

test("left-rack playback retries a stale playlist item directly", async () => {
  const { calls, result } = await routePlayback({
    contextUri: "spotify:playlist:ABCDEFGHIJ",
    apiResults: [{ ok: false, status: 403, error: "Invalid context" }, { ok: true }],
  });
  assert.equal(calls.api, 2);
  assert.equal(calls.desktop, 0);
  assert.equal(result.source, "web-api-direct");
  assert.deepEqual(JSON.parse(JSON.stringify(calls.requests[1].body)), { uris: ["spotify:track:1234567890"] });
});

test("left-rack playback uses the shielded desktop command when the API session is unavailable", async () => {
  const { calls, result } = await routePlayback({ apiResults: [{ ok: false, status: 401, error: "Not connected" }] });
  assert.equal(calls.api, 1);
  assert.equal(calls.desktop, 1);
  assert.equal(result.source, "desktop-shielded");
  assert.equal(result.ok, true);
});

test("left-rack playback rejects a false API success and recovers through the desktop player", async () => {
  const stopped = { state: "stopped" };
  const { calls, result } = await routePlayback({
    apiResults: [
      { ok: true, status: 204 },
      { ok: true, data: { devices: [] } },
    ],
    nowPlayingResults: [stopped, stopped, stopped, { state: "playing", uri: "spotify:track:1234567890" }],
  });
  assert.equal(calls.api, 2);
  assert.equal(calls.desktop, 1);
  assert.equal(result.source, "desktop-shielded");
  assert.equal(result.ok, true);
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
