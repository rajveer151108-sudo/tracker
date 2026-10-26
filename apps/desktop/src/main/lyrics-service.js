const { parseAny } = require("../../lyricsparse");

const HEADERS = { "User-Agent": "Afterglow/0.1 (personal project)" };
const WORD_PROVIDERS = [
  {
    name: "BetterLyrics",
    url: (info) => "https://lyrics-api.boidu.dev/getLyrics?" + new URLSearchParams({
      s: info.title,
      a: info.artist,
      al: info.album || "",
      d: String(Math.round(info.durationSec || 0)),
    }),
  },
  {
    name: "LyricsPlus",
    url: (info) => "https://lyricsplus.prjktla.workers.dev/v2/lyrics/get?" + new URLSearchParams({
      title: info.title,
      artist: (info.artist || "").split(",")[0].trim(),
      album: info.album || "",
      duration: String(Math.round(info.durationSec || 0)),
      source: "apple,lyricsplus,musixmatch,spotify",
    }),
  },
];

async function getJson(url) {
  const response = await fetch(url, { headers: HEADERS });
  if (!response.ok) return null;
  return response.json();
}

async function getText(url, timeoutMs = 7000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers: HEADERS, signal: controller.signal });
    return { status: response.status, text: await response.text() };
  } finally {
    clearTimeout(timer);
  }
}

function createLyricsService(getSettings) {
  const lineCache = new Map();
  const wordCache = new Map();

  async function fetchWordLyrics(info, diagnostics) {
    if (!diagnostics && wordCache.has(info.id)) return wordCache.get(info.id);
    let found = null;
    let hadError = false;

    for (const provider of WORD_PROVIDERS) {
      const started = Date.now();
      try {
        const { status, text } = await getText(provider.url(info));
        const parsed = status === 200 ? parseAny(text) : null;
        const timed = parsed ? parsed.lines.filter((line) => line.words.length) : [];
        const wordCount = timed.reduce((count, line) => count + line.words.length, 0);
        if (diagnostics) {
          diagnostics.push(`${provider.name}: HTTP ${status}, ${parsed
            ? `${parsed.lines.length} lines, ${wordCount} timed words`
            : "no usable lyrics"} (${Date.now() - started} ms)`);
        }
        if (parsed && wordCount >= 4 && timed.length >= parsed.lines.length * 0.5) {
          found = { lines: parsed.lines, source: provider.name };
          break;
        }
      } catch (error) {
        hadError = true;
        if (diagnostics) {
          diagnostics.push(`${provider.name}: failed (${error?.name === "AbortError" ? "timed out" : error?.message})`);
        }
      }
    }

    if (!diagnostics && (found || !hadError)) wordCache.set(info.id, found);
    return found;
  }

  async function fetchLyrics(info) {
    const { id, title, artist, album, durationSec } = info;
    if (getSettings().lyricsWordSource) {
      const wordLyrics = await fetchWordLyrics(info);
      if (wordLyrics) return { words: wordLyrics.lines, source: wordLyrics.source };
    }
    if (lineCache.has(id)) return lineCache.get(id);

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
      if (hit) result = { synced: hit.syncedLyrics || null, plain: hit.plainLyrics || null };
    } catch (error) {
      result = { error: String(error?.message || error) };
    }

    if (!result?.error) lineCache.set(id, result);
    return result;
  }

  async function diagnose(info) {
    if (typeof info?.title !== "string" || !info.title) return "Play a song first, then run the check.";
    const diagnostics = [`Song: ${info.title} — ${info.artist}`];
    await fetchWordLyrics(info, diagnostics);
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

module.exports = { createLyricsService, getJson };
