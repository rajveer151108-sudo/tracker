const assert = require("node:assert/strict");
const test = require("node:test");

const { normaliseApiRequest, parsePlaylistEmbed } = require("../src/main/spotify-library");

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

test("public Spotify embeds recover followed playlist songs hidden by the Web API", () => {
  const data = {
    props: { pageProps: { state: { data: { entity: {
      type: "playlist",
      id: "37i9dQZF1DXcBWIGoYBM5M",
      uri: PLAYLIST,
      title: "Followed mix",
      trackList: [
        { entityType: "track", uri: TRACK, title: "One song", subtitle: "Artist A,\u00a0Artist B", duration: 123000, isPlayable: true },
        { entityType: "episode", uri: "spotify:episode:1234567890", title: "Not a song", isPlayable: true },
      ],
    } } } } },
  };
  const html = `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></html>`;
  assert.deepEqual(parsePlaylistEmbed(html, "37i9dQZF1DXcBWIGoYBM5M", isSpotifyUri), {
    id: "37i9dQZF1DXcBWIGoYBM5M",
    uri: PLAYLIST,
    title: "Followed mix",
    tracks: [{ uri: TRACK, title: "One song", artist: "Artist A, Artist B", durationMs: 123000 }],
  });
});

test("public playlist parsing rejects mismatched and malformed embeds", () => {
  const html = '<script id="__NEXT_DATA__" type="application/json">{"props":{}}</script>';
  assert.equal(parsePlaylistEmbed(html, "37i9dQZF1DXcBWIGoYBM5M", isSpotifyUri), null);
  assert.equal(parsePlaylistEmbed(html, "bad!", isSpotifyUri), null);
});
