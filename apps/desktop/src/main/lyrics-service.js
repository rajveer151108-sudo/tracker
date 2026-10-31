const { parseAny } = require("../../lyricsparse");

const HEADERS = {
  "User-Agent": "Afterglow/0.1 (+https://github.com/rajveer151108-sudo/tracker)",
  Accept: "application/json, application/xml, text/plain;q=0.9, */*;q=0.8",
};
const CLIENT_HEADERS = { ...HEADERS, "X-Client-Package": "Afterglow <https://github.com/rajveer151108-sudo/tracker>" };
const WORD_CACHE_HIT_MS = 6 * 60 * 60 * 1000;
const WORD_CACHE_MISS_MS = 10 * 60 * 1000;

async function getJson(url) {
  const response = await getText(url);
  if (response.status !== 200) return null;
  try { return JSON.parse(response.text); } catch { return null; }
}

async function getText(url, { timeoutMs = 7500, headers = HEADERS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    return { status: response.status, text: await response.text() };
  } finally {
    clearTimeout(timer);
  }
}

function spotifyTrackId(value) {
  const match = String(value || "").match(/(?:spotify:track:|open\.spotify\.com\/track\/)([A-Za-z0-9]{10,40})/);
  return match ? match[1] : null;
}

function normalizeInfo(info) {
  const title = String(info.title || "")
    .normalize("NFKC")
    .replace(/[®™]/g, "")
    .replace(/\s*[\[(]\s*(?:feat\.?|ft\.?|with)\s+.*?[\])]/ig, "")
    .replace(/\s*[-–—]\s*(?:remaster(?:ed)?|radio edit|single version)(?:\s+\d{2,4})?.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return { ...info, title };
}

function lyricsCacheKey(info) {
  const clean = (value) => String(value || "").normalize("NFKC").trim().toLowerCase();
  const platformId = spotifyTrackId(info?.id);
  return [
    platformId ? `spotify:${platformId}` : clean(info?.id),
    clean(info?.title),
    clean(info?.artist),
    clean(info?.album),
    Math.round(Number(info?.durationSec) || 0),
  ].join("|");
}

function providerParams(info) {
  const platformId = spotifyTrackId(info.id);
  const params = {
    title: info.title,
    artist: (info.artist || "").split(",")[0].trim(),
    album: info.album || "",
    duration: String(Math.round(info.durationSec || 0)),
  };
  if (platformId) params.platformId = platformId;
  return params;
}

async function fetchBetterLyrics(info) {
  const query = new URLSearchParams({
    s: info.title,
    a: info.artist,
    al: info.album || "",
    d: String(Math.round(info.durationSec || 0)),
  });
  return getText(`https://api.betterlyrics.org/getLyrics?${query}`);
}

async function fetchBetterLyricsQQ(info) {
  const query = new URLSearchParams({
    s: info.title,
    a: info.artist,
    al: info.album || "",
    d: String(Math.round(info.durationSec || 0)),
  });
  return getText(`https://api.betterlyrics.org/qq/getLyrics?${query}`);
}

function bestLyricsFile(rows, durationSec) {
  const duration = Number(durationSec) || 0;
  return (Array.isArray(rows) ? rows : [rows]).filter(Boolean)
    .map((row) => ({ row, stats: wordStats(parseAny(JSON.stringify(row))) }))
    .filter(({ stats }) => stats.usable)
    .sort((a, b) => {
      const durationA = Math.abs((Number(a.row.duration) || duration) - duration);
      const durationB = Math.abs((Number(b.row.duration) || duration) - duration);
      return durationA - durationB || b.stats.wordCount - a.stats.wordCount;
    })
    .find(({ row }) => !duration || Math.abs((Number(row.duration) || duration) - duration) <= 8)?.row || null;
}

async function fetchLRCLIBWords(info) {
  const exact = new URLSearchParams({
    track_name: info.title,
    artist_name: info.artist,
    album_name: info.album || "",
    duration: String(Math.round(info.durationSec || 0)),
  });
  const exactResponse = await getText(`https://lrclib.net/api/get?${exact}`);
  if (exactResponse.status === 200) {
    try {
      const hit = bestLyricsFile(JSON.parse(exactResponse.text), info.durationSec);
      if (hit) return { status: 200, text: JSON.stringify(hit) };
    } catch { /* try search */ }
  }

  const search = new URLSearchParams({
    track_name: info.title,
    artist_name: (info.artist || "").split(",")[0].trim(),
  });
  const searchResponse = await getText(`https://lrclib.net/api/search?${search}`);
  if (searchResponse.status !== 200) return searchResponse;
  try {
    const hit = bestLyricsFile(JSON.parse(searchResponse.text), info.durationSec);
    return hit ? { status: 200, text: JSON.stringify(hit) } : { status: 404, text: "" };
  } catch {
    return { status: 404, text: "" };
  }
}

function findSyncedLrc(value, depth = 0) {
  if (depth > 5 || value == null) return null;
  if (typeof value === "string") return /\[\d{1,3}:\d{2}(?:\.\d+)?]/.test(value) ? value : null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findSyncedLrc(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value === "object") {
    for (const key of ["lyrics", "syncedLyrics", "synced", "lrc", "content", "data"]) {
      const found = findSyncedLrc(value[key], depth + 1);
      if (found) return found;
    }
  }
  return null;
}

async function fetchBetterLyricsKugou(info) {
  const query = new URLSearchParams({
    s: info.title,
    a: info.artist,
    al: info.album || "",
    d: String(Math.round(info.durationSec || 0)),
  });
  const response = await getText(`https://api.betterlyrics.org/kugou/getLyrics?${query}`);
  if (response.status !== 200) return null;
  try { return findSyncedLrc(JSON.parse(response.text)); } catch { return findSyncedLrc(response.text); }
}

async function fetchLyricsPlus(info) {
  const query = new URLSearchParams({
    ...providerParams(info),
    source: "apple,lyricsplus,musixmatch,spotify,qq,deezer,musixmatch-word",
  });
  const mirrors = [
    "https://lyricsplus.prjktla.my.id",
    "https://lyricsplus.binimum.org",
    "https://lyricsplus-seven.vercel.app",
  ];
  let last = { status: 404, text: "" };
  for (const base of mirrors) {
    try {
      last = await getText(`${base}/v2/lyrics/get?${query}`, { headers: CLIENT_HEADERS });
      const parsed = last.status === 200 ? parseAny(last.text) : null;
      if (wordStats(parsed).usable) return last;
    } catch (error) {
      if (error?.name === "AbortError") continue;
      throw error;
    }
  }
  return last;
}

async function fetchBiniLyrics(info) {
  const query = new URLSearchParams({
    track: info.title,
    artist: (info.artist || "").split(",")[0].trim(),
    album: info.album || "",
    duration: String(Math.round(info.durationSec || 0)),
  });
  const index = await getText(`https://lyrics-api.binimum.org/?${query}`);
  if (index.status !== 200) return index;
  let data;
  try { data = JSON.parse(index.text); } catch { return index; }
  const lyricsUrl = data?.results?.find((result) => typeof result?.lyricsUrl === "string")?.lyricsUrl;
  if (!lyricsUrl) return index;
  let url;
  try { url = new URL(lyricsUrl); } catch { return index; }
  if (url.protocol !== "https:") return index;
  return getText(url.toString());
}

async function fetchLrcRed(info) {
  const query = new URLSearchParams({
    track: info.title,
    artist: (info.artist || "").split(",")[0].trim(),
  });
  if (info.album) query.set("album", info.album);
  if (info.durationSec) query.set("duration", String(Math.round(info.durationSec)));
  const match = await getText(`https://lrc.red/match.json?${query}`);
  if (match.status !== 200) return match;
  let data;
  try { data = JSON.parse(match.text); } catch { return match; }
  const isrc = data?.hits?.find((hit) => typeof hit?.isrc === "string")?.isrc;
  if (!isrc) return match;
  return getText(`https://lrc.red/s/${encodeURIComponent(isrc)}.song.json`);
}

const WORD_PROVIDERS = [
  { name: "BetterLyrics", fetch: fetchBetterLyrics },
  { name: "LRCLIB Words", fetch: fetchLRCLIBWords },
  { name: "BetterLyrics QQ", fetch: fetchBetterLyricsQQ },
  { name: "LyricsPlus", fetch: fetchLyricsPlus },
  { name: "BiniLyrics", fetch: fetchBiniLyrics },
  { name: "lrc.red", fetch: fetchLrcRed },
];

function wordStats(parsed) {
  const lines = parsed?.lines || [];
  const timedLines = lines.filter((line) => Array.isArray(line.words) && line.words.length);
  const wordCount = timedLines.reduce((count, line) => count + line.words.length, 0);
  return {
    lines: lines.length,
    timedLines: timedLines.length,
    wordCount,
    usable: wordCount >= 4 && timedLines.length >= Math.max(1, lines.length * 0.35),
  };
}

function createLyricsService(getSettings) {
  const lineCache = new Map();
  const wordCache = new Map();

  async function runProvider(provider, info) {
    const started = Date.now();
    try {
      const response = await provider.fetch(info);
      const parsed = response.status === 200 ? parseAny(response.text) : null;
      return { provider, status: response.status, parsed, stats: wordStats(parsed), elapsed: Date.now() - started };
    } catch (error) {
      return { provider, error, stats: wordStats(null), elapsed: Date.now() - started };
    }
  }

  async function runProviderRound(info, diagnostics) {
    const batches = diagnostics
      ? [WORD_PROVIDERS]
      : [
        [WORD_PROVIDERS[0], WORD_PROVIDERS[2]],
        [WORD_PROVIDERS[1], WORD_PROVIDERS[3]],
        WORD_PROVIDERS.slice(4),
      ];
    const results = [];
    let winner = null;
    for (const providers of batches) {
      const batch = await Promise.all(providers.map((provider) => runProvider(provider, info)));
      results.push(...batch);
      winner = batch.filter((result) => result.stats.usable).sort((a, b) => {
        const coverageA = a.stats.lines ? a.stats.timedLines / a.stats.lines : 0;
        const coverageB = b.stats.lines ? b.stats.timedLines / b.stats.lines : 0;
        return coverageB - coverageA || b.stats.wordCount - a.stats.wordCount;
      })[0] || null;
      if (winner) break;
    }
    if (diagnostics) {
      for (const result of results) {
        if (result.error) {
          diagnostics.push(`${result.provider.name}: failed (${result.error?.name === "AbortError" ? "timed out" : result.error?.message})`);
        } else {
          diagnostics.push(`${result.provider.name}: HTTP ${result.status}, ${result.parsed
            ? `${result.stats.lines} lines, ${result.stats.wordCount} timed words`
            : "no usable lyrics"} (${result.elapsed} ms)`);
        }
      }
    }
    return winner ? { lines: winner.parsed.lines, source: winner.provider.name } : null;
  }

  async function fetchWordLyrics(info, diagnostics) {
    const cacheKey = lyricsCacheKey(info);
    if (!diagnostics) {
      const cached = wordCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) return cached.value;
    }

    let found = await runProviderRound(info, diagnostics);
    const normalized = normalizeInfo(info);
    if (!found && normalized.title && normalized.title !== info.title) {
      if (diagnostics) diagnostics.push(`Retrying with normalized title: ${normalized.title}`);
      found = await runProviderRound(normalized, diagnostics);
    }

    if (!diagnostics) {
      wordCache.set(cacheKey, {
        value: found,
        expiresAt: Date.now() + (found ? WORD_CACHE_HIT_MS : WORD_CACHE_MISS_MS),
      });
    }
    return found;
  }

  async function fetchLyrics(info) {
    const { id, title, artist, album, durationSec } = info;
    const cacheKey = lyricsCacheKey(info);
    if (getSettings().lyricsWordSource) {
      const wordLyrics = await fetchWordLyrics(info);
      if (wordLyrics) return { words: wordLyrics.lines, source: wordLyrics.source };
    }
    if (lineCache.has(cacheKey)) return lineCache.get(cacheKey);

    let result = null;
    try {
      const firstArtist = (artist || "").split(",")[0].trim();
      const exact = new URLSearchParams({
        track_name: title,
        artist_name: artist,
        album_name: album,
        duration: String(Math.round(durationSec)),
      });
      let hit = await getJson(`https://lrclib.net/api/get?${exact}`);

      if (!hit || !hit.syncedLyrics) {
        const search = new URLSearchParams({ track_name: title, artist_name: firstArtist });
        const list = await getJson(`https://lrclib.net/api/search?${search}`);
        if (Array.isArray(list)) {
          const synced = list.filter((row) => row.syncedLyrics);
          synced.sort((a, b) => Math.abs((a.duration || 0) - durationSec) - Math.abs((b.duration || 0) - durationSec));
          if (synced.length && Math.abs((synced[0].duration || 0) - durationSec) <= 5) {
            hit = synced[0];
          } else if (!hit || !hit.plainLyrics) {
            const plain = list.filter((row) => row.plainLyrics && Math.abs((row.duration || 0) - durationSec) <= 8);
            plain.sort((a, b) => Math.abs((a.duration || 0) - durationSec) - Math.abs((b.duration || 0) - durationSec));
            if (plain.length) hit = plain[0];
          }
        }
      }
      if (hit) result = { synced: hit.syncedLyrics || null, plain: hit.plainLyrics || null, source: "LRCLIB" };
    } catch (error) {
      result = { error: String(error?.message || error) };
    }

    if (!result?.synced) {
      try {
        const kugou = await fetchBetterLyricsKugou(info);
        if (kugou) result = { synced: kugou, plain: result?.plain || null, source: "BetterLyrics Kugou" };
      } catch (error) {
        if (!result) result = { error: String(error?.message || error) };
      }
    }

    if (!result?.error) lineCache.set(cacheKey, result);
    return result;
  }

  async function diagnose(info) {
    if (typeof info?.title !== "string" || !info.title) return "Play a song first, then run the check.";
    const diagnostics = [`Song: ${info.title} — ${info.artist}`];
    const wordLyrics = await fetchWordLyrics(info, diagnostics);
    diagnostics.push(wordLyrics ? `Selected: ${wordLyrics.source}` : "Selected: no word-timed source");
    try {
      const query = new URLSearchParams({
        track_name: info.title,
        artist_name: info.artist,
        album_name: info.album || "",
        duration: String(Math.round(info.durationSec || 0)),
      });
      const hit = await getJson(`https://lrclib.net/api/get?${query}`);
      diagnostics.push(`LRCLIB: ${hit
        ? hit.syncedLyrics ? "line-synced lyrics found" : hit.plainLyrics ? "plain lyrics only (no timing)" : "found, but no lyrics"
        : "not found"}`);
    } catch (error) {
      diagnostics.push(`LRCLIB: failed (${error?.message})`);
    }
    return diagnostics.join("\n");
  }

  return { fetchLyrics, diagnose };
}

module.exports = {
  createLyricsService, getJson, lyricsCacheKey, normalizeInfo, spotifyTrackId, wordStats,
  bestLyricsFile, findSyncedLrc,
};
