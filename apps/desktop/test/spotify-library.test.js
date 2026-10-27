const assert = require("node:assert/strict");
const test = require("node:test");

const { normaliseApiRequest } = require("../src/main/spotify-library");

const isSpotifyUri = (value) => /^spotify:(track|album|playlist|artist|episode|show):[A-Za-z0-9]{10,40}$/.test(String(value || ""));
const TRACK = "spotify:track:3OHfY25tqY28d16oZczHc8";
const PLAYLIST = "spotify:playlist:37i9dQZF1DXcBWIGoYBM5M";

test("Spotify API proxy keeps existing read-only library routes", () => {
  assert.deepEqual(normaliseApiRequest("/me/tracks?limit=50", isSpotifyUri), {
    path: "/me/tracks?limit=50", method: "GET", body: null,
  });
  assert.deepEqual(normaliseApiRequest("/playlists/37i9dQZF1DXcBWIGoYBM5M/items?limit=100", isSpotifyUri), {
    path: "/playlists/37i9dQZF1DXcBWIGoYBM5M/items?limit=100", method: "GET", body: null,
  });
});

test("Spotify API proxy allows only the required song write actions", () => {
  assert.equal(normaliseApiRequest({ path: `/me/player/queue?uri=${encodeURIComponent(TRACK)}`, method: "POST" }, isSpotifyUri)?.method, "POST");
  assert.equal(normaliseApiRequest({ path: `/me/library?uris=${encodeURIComponent(TRACK)}`, method: "PUT" }, isSpotifyUri)?.method, "PUT");
  assert.deepEqual(normaliseApiRequest({ path: "/me/player/play", method: "PUT", body: { context_uri: PLAYLIST, offset: { uri: TRACK } } }, isSpotifyUri)?.body, {
    context_uri: PLAYLIST, offset: { uri: TRACK },
  });
  assert.deepEqual(normaliseApiRequest({ path: "/playlists/37i9dQZF1DXcBWIGoYBM5M/items", method: "POST", body: { uris: [TRACK] } }, isSpotifyUri)?.body, {
    uris: [TRACK],
  });
  assert.equal(normaliseApiRequest({ path: "/me/player/shuffle?state=true", method: "PUT" }, isSpotifyUri)?.method, "PUT");
});

test("Spotify API proxy rejects arbitrary hosts, routes and malformed writes", () => {
  assert.equal(normaliseApiRequest("//example.com/me", isSpotifyUri), null);
  assert.equal(normaliseApiRequest("/me/following", isSpotifyUri), null);
  assert.equal(normaliseApiRequest({ path: "/me/player/queue?uri=https://example.com", method: "POST" }, isSpotifyUri), null);
  assert.equal(normaliseApiRequest({ path: "/me/player/play", method: "PUT", body: { uris: [] } }, isSpotifyUri), null);
  assert.equal(normaliseApiRequest({ path: "/me/player/shuffle?state=maybe", method: "PUT" }, isSpotifyUri), null);
  assert.equal(normaliseApiRequest({ path: "/playlists/abc/items", method: "DELETE", body: { uris: [TRACK] } }, isSpotifyUri), null);
});
