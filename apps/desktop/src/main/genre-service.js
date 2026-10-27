const fs = require("fs");
const path = require("path");
const { getJson } = require("./lyrics-service");

const GENRE_RULES = [
  ["jazz", /jazz|bebop|swing|bossa|big band/i],
  ["rap", /rap|hip.?hop|trap|drill|grime/i],
  ["rnb", /r\s?&\s?b|r&amp;b|rnb|soul|funk|neo/i],
  ["rock", /rock|metal|punk|grunge|emo|alternative|indie/i],
  ["electronic", /electro|dance|house|techno|edm|trance|dubstep/i],
  ["pop", /pop|disco/i],
];

function bucketFor(names) {
  for (const name of names) {
    for (const [bucket, pattern] of GENRE_RULES) if (pattern.test(name)) return bucket;
  }
  return "other";
}

function createGenreService(app) {
  const file = () => path.join(app.getPath("userData"), "genres.json");
  let cache = null;

  function load() {
    if (cache) return cache;
    try {
      cache = JSON.parse(fs.readFileSync(file(), "utf8"));
    } catch {
      cache = {};
    }
    return cache;
  }

  function save() {
    try {
      fs.writeFileSync(file(), JSON.stringify(cache));
    } catch {
      // A failed cache write should never block playback.
    }
  }

  async function fetchGenre({ id, title, artist }) {
    const genresByTrack = load();
    if (genresByTrack[id]) {
      const cached = genresByTrack[id];
      const bucket = bucketFor(String(cached.raw || "").split(",").filter(Boolean));
      if (bucket !== cached.bucket) {
        genresByTrack[id] = { ...cached, bucket };
        save();
      }
      return genresByTrack[id];
    }
    let genres = [];
    try {
      const firstArtist = (artist || "").split(",")[0].trim();
      const cleanTitle = (title || "").replace(/\s*[\(\[][^\)\]]*[\)\]]/g, "").replace(/\s+-\s+.*$/, "").trim();
      const queries = [`artist:"${firstArtist}" track:"${cleanTitle}"`, `${firstArtist} ${cleanTitle}`];
      for (const query of queries) {
        const search = await getJson(`https://api.deezer.com/search?limit=3&q=${encodeURIComponent(query)}`);
        const hit = search?.data?.find((row) => row?.album?.id);
        if (!hit) continue;
        const album = await getJson(`https://api.deezer.com/album/${hit.album.id}`);
        genres = (album?.genres?.data || []).map((genre) => genre.name).filter(Boolean);
        if (genres.length) break;
      }
    } catch {
      return { raw: null, bucket: "other", error: true };
    }
    const result = { raw: genres.join(", ") || null, bucket: bucketFor(genres) };
    genresByTrack[id] = result;
    save();
    return result;
  }

  return { fetchGenre };
}

module.exports = { createGenreService };
