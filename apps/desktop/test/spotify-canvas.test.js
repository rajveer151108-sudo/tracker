const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  encodeCanvasRequest,
  decodeCanvasResponse,
  findCachedSpotifyCanvas,
  findCachedSpotifyStream,
  materializeSpotifyStreamCanvas,
  fetchSpotifyCanvas,
} = require("../src/main/spotify-canvas");

const TRACK_URI = "spotify:track:3OHfY25tqY28d16oZczHc8";
const CANVAS_URL = "https://canvaz.scdn.co/upload/artist/example/video/example.cnvs.mp4";
const STREAM_URL = "https://video-cf.spotifycdn.com/segments/v1/origins/663f2769e1d1428189d67704a5271cf8/sources/d4af2cad0d5c3497b595023ef3e1402c/encodings/9c8b46d056c711f19903252e3c5403a9/profiles/2/4.webm?fauth=a&token_ak=b&token_cf=c";

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

test("Canvas resolver associates Spotify's segmented WebM stream with the matching cached track", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "afterglow-stream-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const now = new Date();
  const trackFile = path.join(root, "track_0");
  const streamFile = path.join(root, "stream_0");
  fs.writeFileSync(trackFile, `https://spclient.wg.spotify.com/color-lyrics/v2/track/${TRACK_URI.slice(14)}/image`);
  fs.writeFileSync(streamFile, `cache-key ${STREAM_URL}\u0000response`);
  fs.utimesSync(trackFile, now, now);
  fs.utimesSync(streamFile, now, now);
  const stream = findCachedSpotifyStream(TRACK_URI, root);
  assert.equal(stream.profile, 2);
  assert.match(stream.prefix, /\/encodings\/9c8b46d056c711f19903252e3c5403a9$/);
  assert.equal(findCachedSpotifyStream("spotify:track:5TRPicyLGbAF2LGBFbHGvO", root), null);
});

test("Canvas resolver assembles Spotify's init and timed WebM segments into a local loop", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "afterglow-stream-cache-test-"));
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "afterglow-stream-output-test-"));
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(output, { recursive: true, force: true });
  });
  fs.writeFileSync(path.join(root, "track_0"), TRACK_URI);
  fs.writeFileSync(path.join(root, "stream_0"), STREAM_URL);
  const fetchMock = async (url) => {
    const pathname = new URL(url).pathname;
    const body = pathname.endsWith("/inits/webm") ? Buffer.from("init")
      : pathname.endsWith("/0.webm") ? Buffer.from("zero")
        : pathname.endsWith("/4.webm") ? Buffer.from("four") : null;
    return {
      ok: !!body,
      headers: { get: () => body ? "video/webm" : "text/plain" },
      arrayBuffer: async () => body,
    };
  };
  const url = await materializeSpotifyStreamCanvas(TRACK_URI, root, output, fetchMock);
  assert.match(url, /^file:\/\//);
  assert.equal(fs.readFileSync(path.join(output, `${TRACK_URI.slice(14)}.webm`), "utf8"), "initzerofour");
});
