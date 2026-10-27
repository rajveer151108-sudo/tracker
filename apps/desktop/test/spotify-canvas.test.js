const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  encodeCanvasRequest,
  decodeCanvasResponse,
  findCachedSpotifyCanvas,
  fetchSpotifyCanvas,
} = require("../src/main/spotify-canvas");

const TRACK_URI = "spotify:track:3OHfY25tqY28d16oZczHc8";
const CANVAS_URL = "https://canvaz.scdn.co/upload/artist/example/video/example.cnvs.mp4";

function field(number, value) {
  const bytes = Buffer.from(value, "utf8");
  return Buffer.concat([Buffer.from([(number << 3) | 2, bytes.length]), bytes]);
}

function responseFor(url) {
  const canvas = Buffer.concat([field(2, url), field(5, TRACK_URI)]);
  return Buffer.concat([Buffer.from([0x0a, canvas.length]), canvas]);
}

test("Canvas request encodes one Spotify track URI as protobuf", () => {
  const request = encodeCanvasRequest(TRACK_URI);
  assert.equal(request[0], 0x0a);
  assert.equal(request[2], 0x0a);
  assert.equal(request.subarray(4).toString("utf8"), TRACK_URI);
});

test("Canvas response accepts only Spotify's HTTPS Canvas CDN", () => {
  assert.equal(decodeCanvasResponse(responseFor(CANVAS_URL), TRACK_URI), CANVAS_URL);
  assert.equal(decodeCanvasResponse(responseFor("https://example.com/video.mp4"), TRACK_URI), "");
  assert.equal(decodeCanvasResponse(responseFor("http://canvaz.scdn.co/video.mp4"), TRACK_URI), "");
});

test("Canvas fetch fails closed without Spotify authentication", async () => {
  const result = await fetchSpotifyCanvas(TRACK_URI, "");
  assert.equal(result.ok, false);
  assert.match(result.error, /not connected/i);
});

test("Canvas resolver reads only the matching track from Spotify's local cache", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "afterglow-canvas-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const encoded = Buffer.from(TRACK_URI).toString("base64").replace(/=+$/, "");
  fs.writeFileSync(path.join(root, "000001.ldb"), `noise itemId=${encoded}\u0000${CANVAS_URL}\u0000more noise`);
  assert.equal(findCachedSpotifyCanvas(TRACK_URI, root), CANVAS_URL);
  assert.equal(findCachedSpotifyCanvas("spotify:track:5TRPicyLGbAF2LGBFbHGvO", root), "");
});
