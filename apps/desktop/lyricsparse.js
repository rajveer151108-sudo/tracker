// Parsers for word-level synced lyrics.
//   parseTTML: the XML format Apple Music-style sources use (words or syllables with begin / end times)
//   parseKpoe: the JSON some community lyric services use (lines with a "syllabus" of timed pieces)
//   parseAny:  looks at a response and picks the right one
// Every parser returns { lines: [{ t, end, text, words, backgroundWords? }] }
// with times in seconds, or null. Background vocals remain a separate layer.

function decode(s) {
  return String(s)
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;|&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");
}

function parseTime(v) {
  if (v == null) return null;
  v = String(v).trim();
  if (!v) return null;
  let n;
  if (/ms$/.test(v)) n = parseFloat(v) / 1000;
  else if (/s$/.test(v)) n = parseFloat(v);
  else if (v.includes(":")) {
    n = 0;
    for (const part of v.split(":")) n = n * 60 + Number(part);
  } else n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function attr(str, name) {
  const re = new RegExp("(?:^|\\s)(?:[\\w-]+:)?" + name + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)')");
  const m = str.match(re);
  return m ? (m[1] != null ? m[1] : m[2]) : null;
}

function extractRoleSpans(markup, role) {
  const ranges = [], contents = [];
  const opening = /<span\b([^>]*)>/g;
  let match;
  while ((match = opening.exec(markup))) {
    if (attr(match[1], "role") !== role) continue;
    const contentStart = opening.lastIndex;
    const tags = /<\/?span\b[^>]*>/g;
    tags.lastIndex = contentStart;
    let depth = 1, tag;
    while ((tag = tags.exec(markup))) {
      depth += /^<\/span/i.test(tag[0]) ? -1 : 1;
      if (depth !== 0) continue;
      ranges.push([match.index, tags.lastIndex]);
      contents.push(markup.slice(contentStart, tag.index));
      opening.lastIndex = tags.lastIndex;
      break;
    }
  }
  let cleaned = "", cursor = 0;
  for (const [start, end] of ranges) {
    cleaned += markup.slice(cursor, start);
    cursor = end;
  }
  cleaned += markup.slice(cursor);
  return { cleaned, contents };
}

function timedWordsFromMarkup(markup) {
  const words = [];
  let cur = null;
  const close = () => {
    if (cur && cur.text.trim()) words.push({ t: cur.t, end: cur.end, text: cur.text.trim() });
    cur = null;
  };
  const tokRe = /<span\b([^>]*)>([^<]*)<\/span>|([^<]+)/g;
  let token;
  while ((token = tokRe.exec(markup))) {
    if (token[3] != null) { if (/\s/.test(token[3])) close(); continue; }
    const begin = parseTime(attr(token[1], "begin"));
    const end = parseTime(attr(token[1], "end"));
    if (begin == null) continue;
    const raw = decode(token[2]);
    if (/^\s/.test(raw)) close();
    const piece = raw.trim();
    if (piece && /\s/.test(piece)) {
      close();
      const parts = piece.split(/\s+/);
      const total = parts.reduce((sum, word) => sum + word.length, 0) || 1;
      const span = (end == null ? begin : end) - begin;
      let consumed = 0;
      for (const word of parts) {
        words.push({
          t: begin + span * (consumed / total),
          end: begin + span * ((consumed + word.length) / total),
          text: word,
        });
        consumed += word.length;
      }
      continue;
    }
    if (piece) {
      if (!cur) cur = { t: begin, end: end == null ? begin : end, text: "" };
      cur.text += piece;
      if (end != null) cur.end = end;
    }
    if (/\s$/.test(raw)) close();
  }
  close();
  return words;
}

function parseTTML(xml) {
  if (typeof xml !== "string" || !/<p[\s>]/.test(xml)) return null;
  const lines = [];
  const pRe = /<p\b([^>]*)>([\s\S]*?)<\/p>/g;
  let m;
  while ((m = pRe.exec(xml))) {
    const pBegin = parseTime(attr(m[1], "begin"));
    const pEnd = parseTime(attr(m[1], "end"));
    // Keep timed background vocals as a second evidence channel. They never
    // enter the main text stream, so overlapping takes cannot jumble lyrics.
    const background = extractRoleSpans(m[2], "x-bg");
    const inner = background.cleaned;
    const words = timedWordsFromMarkup(inner);
    const backgroundWords = background.contents.flatMap(timedWordsFromMarkup);

    const plain = decode(inner.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
    if (!plain && !words.length) continue;
    const t = words.length ? words[0].t : pBegin;
    if (t == null) continue;
    const end = pEnd != null ? pEnd : (words.length ? words[words.length - 1].end : t + 3);
    lines.push({
      t, end, text: words.length ? words.map((w) => w.text).join(" ") : plain, words,
      ...(backgroundWords.length ? { backgroundWords } : {}),
    });
  }
  if (!lines.length) return null;
  lines.sort((a, b) => a.t - b.t);
  return { lines };
}

function parseKpoe(o) {
  const arr = o && Array.isArray(o.lyrics) ? o.lyrics : null;
  if (!arr) return null;
  const lines = [];
  for (const L of arr) {
    if (!L) continue;
    const t0 = Number(L.time) / 1000;
    if (!Number.isFinite(t0)) continue;
    const dur = (Number(L.duration) || 0) / 1000;
    const text = String(L.text == null ? "" : L.text);
    const syllabus = Array.isArray(L.syllabus) ? L.syllabus : [];
    const syl = syllabus.filter((s) => s && !s.isBackground && Number.isFinite(Number(s.time)));
    const backgroundWords = syllabus.filter((s) => s?.isBackground && Number.isFinite(Number(s.time)))
      .flatMap((s) => {
        const backgroundText = String(s.text == null ? "" : s.text).trim();
        if (!backgroundText) return [];
        const backgroundTime = Number(s.time) / 1000;
        return [{
          t: backgroundTime,
          end: backgroundTime + Math.max(.06, (Number(s.duration) || 0) / 1000),
          text: backgroundText,
        }];
      });

    const words = [];
    if (syl.length) {
      const anySpaces = syl.some((s) => /\s/.test(String(s.text == null ? "" : s.text)));
      // if the pieces carry no spaces, borrow the line's own spacing to find where words end
      const breaks = new Set();
      if (!anySpaces) {
        let c = 0;
        for (const ch of text) { if (/\s/.test(ch)) breaks.add(c); else c++; }
      }
      let cur = null, consumed = 0;
      const close = () => { if (cur && cur.text) words.push(cur); cur = null; };
      for (const s of syl) {
        const piece = String(s.text == null ? "" : s.text);
        const t = Number(s.time) / 1000;
        const end = t + (Number(s.duration) || 0) / 1000;
        if (/^\s/.test(piece)) close();
        const trimmed = piece.trim();
        if (trimmed) {
          if (!cur) cur = { t, end, text: "" };
          cur.text += trimmed;
          cur.end = end;
          consumed += trimmed.length;
        }
        if (/\s$/.test(piece) || (!anySpaces && breaks.has(consumed))) close();
      }
      close();
    }
    const first = words.length ? words[0].t : t0;
    lines.push({
      t: first,
      end: dur ? t0 + dur : (words.length ? words[words.length - 1].end : t0 + 3),
      text: words.length ? words.map((w) => w.text).join(" ") : text.trim(),
      words,
      ...(backgroundWords.length ? { backgroundWords } : {}),
    });
  }
  if (!lines.length) return null;
  lines.sort((a, b) => a.t - b.t);
  return { lines };
}

function parseAny(text) {
  if (typeof text !== "string" || !text.trim()) return null;
  let obj = null;
  try { obj = JSON.parse(text); } catch (e) { /* not JSON */ }
  if (obj && typeof obj === "object") {
    if (Array.isArray(obj.lyrics)) return parseKpoe(obj);
    const ttml = typeof obj.ttml === "string" ? obj.ttml
      : Object.values(obj).find((v) => typeof v === "string" && /<tt[\s>]/.test(v));
    return ttml ? parseTTML(ttml) : null;
  }
  return /<tt[\s>]|<p[\s>]/.test(text) ? parseTTML(text) : null;
}

module.exports = { parseTTML, parseKpoe, parseAny, parseTime };
