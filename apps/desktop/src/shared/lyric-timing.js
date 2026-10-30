(function exposeLyricTiming(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.LyricTiming = api;
})(typeof globalThis === "object" ? globalThis : this, function lyricTimingFactory() {
  function finalLineEnd(lines) {
    const line = lines[lines.length - 1];
    if (!line) return 0;
    const words = Array.isArray(line.words) ? line.words : [];
    const lastWordEnd = Number(words[words.length - 1]?.end);
    const lineEnd = Number(line.end);
    if (Number.isFinite(lastWordEnd) && lastWordEnd > Number(line.t)) return lastWordEnd;
    if (Number.isFinite(lineEnd) && lineEnd > Number(line.t)) return lineEnd;
    return Number(line.t) + 4;
  }

  function explicitLineEnd(line) {
    const words = Array.isArray(line?.words) ? line.words : [];
    const lastWordEnd = Number(words[words.length - 1]?.end);
    const lineEnd = Number(line?.end);
    if (Number.isFinite(lastWordEnd) && lastWordEnd > Number(line?.t)) return lastWordEnd;
    if (Number.isFinite(lineEnd) && lineEnd > Number(line?.t)) return lineEnd;
    return NaN;
  }

  function activeLyricIndex(lines, time, outroGrace = 1.25) {
    if (!Array.isArray(lines) || !lines.length || !Number.isFinite(time)) return -1;
    if (time < Number(lines[0].t)) return -1;
    if (time > finalLineEnd(lines) + outroGrace) return -1;
    let index = -1;
    for (let i = 0; i < lines.length; i++) {
      if (Number(lines[i].t) <= time) index = i;
      else break;
    }
    // Exact providers often include a real vocal end followed by an
    // instrumental gap. Do not leave that lyric highlighted until the next
    // line begins; a short grace keeps natural pauses from flickering.
    if (index >= 0 && index < lines.length - 1) {
      const end = explicitLineEnd(lines[index]);
      if (Number.isFinite(end) && time > end + .45 && time < Number(lines[index + 1].t)) return -1;
    }
    return index;
  }

  return { activeLyricIndex, finalLineEnd };
});
