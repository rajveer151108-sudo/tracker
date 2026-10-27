(function (rootScope, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (rootScope) rootScope.DialogueSpeaker = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  function normalise(value) {
    return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function artistsFrom(value) {
    return String(value || "").split(/\s*(?:,|&|\bfeat(?:uring)?\.?\b|\bx\b)\s*/i).map((artist) => artist.trim()).filter(Boolean);
  }

  function resolveSpeaker(hint, artists) {
    const wanted = normalise(hint);
    if (!wanted) return "";
    return artists.find((artist) => {
      const name = normalise(artist);
      if (!name) return false;
      if (wanted.includes(name)) return true;
      const words = name.split(" ").filter((word) => word.length >= 4);
      return words.length > 0 && words.some((word) => wanted.split(" ").includes(word));
    }) || "";
  }

  function parseLine(line, artistText) {
    const artists = Array.isArray(artistText) ? artistText : artistsFrom(artistText);
    let text = String(line?.text || "").trim();
    const hints = [line?.speakerHint, line?.speaker, line?.role, line?.label].filter(Boolean);
    const bracket = text.match(/^\s*[\[(]([^\])]{1,80})[\])]\s*/);
    if (bracket) { hints.unshift(bracket[1]); text = text.slice(bracket[0].length).trim(); }
    const prefix = text.match(/^([^:]{1,45}):\s*(.+)$/);
    const prefixedSpeaker = prefix && resolveSpeaker(prefix[1], artists);
    if (prefixedSpeaker) { text = prefix[2].trim(); hints.unshift(prefix[1]); }
    const speaker = hints.map((hint) => resolveSpeaker(hint, artists)).find(Boolean) || "";
    return { text, speaker };
  }

  function speakerFor(lines, index, artistText, fallbackSpeaker = "") {
    const artists = artistsFrom(artistText);
    for (let cursor = Number(index); cursor >= 0; cursor--) {
      const speaker = parseLine(lines[cursor], artists).speaker;
      if (speaker) return speaker;
    }
    const creditedFallback = resolveSpeaker(fallbackSpeaker, artists);
    if (creditedFallback) return creditedFallback;
    return artists.length === 1 ? artists[0] : "VOCALS";
  }

  return { artistsFrom, parseLine, speakerFor };
});
