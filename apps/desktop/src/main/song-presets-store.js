const fs = require("fs");
const path = require("path");
const { extractPreset } = require("../shared/visual-scenes");

const MAX_PRESETS = 300;

function cleanText(value, max = 180) {
  return String(value || "").normalize("NFKC").trim().slice(0, max);
}

function createSongPresetsStore(app) {
  const file = () => path.join(app.getPath("userData"), "song-presets.json");
  let presets = {};
  let loaded = false;

  function load() {
    if (loaded) return presets;
    loaded = true;
    try {
      const saved = JSON.parse(fs.readFileSync(file(), "utf8"));
      if (saved && typeof saved.presets === "object" && !Array.isArray(saved.presets)) {
        presets = Object.fromEntries(Object.entries(saved.presets).flatMap(([key, preset]) => {
          if (!preset || typeof preset !== "object") return [];
          const visual = extractPreset(preset.visual || {});
          if (!Object.keys(visual).length) return [];
          return [[key, {
            title: cleanText(preset.title), artist: cleanText(preset.artist), album: cleanText(preset.album),
            savedAt: Math.max(0, Number(preset.savedAt) || 0), visual,
          }]];
        }));
      }
    } catch {
      presets = {};
    }
    return presets;
  }

  function saveFile() {
    const target = file();
    const temporary = target + ".tmp";
    try {
      fs.writeFileSync(temporary, JSON.stringify({ version: 2, presets }, null, 2));
      fs.renameSync(temporary, target);
      return true;
    } catch {
      try { fs.unlinkSync(temporary); } catch {}
      return false;
    }
  }

  function keyFor(value) {
    const key = cleanText(value, 620);
    return key || null;
  }

  function get(keyValue) {
    load();
    const key = keyFor(keyValue);
    return key && presets[key] ? { ...presets[key], visual: { ...presets[key].visual } } : null;
  }

  function set(payload = {}) {
    load();
    const key = keyFor(payload.key);
    if (!key) return { ok: false, error: "A playing song is required" };
    const visual = extractPreset(payload.visual || {});
    if (!Object.keys(visual).length) return { ok: false, error: "No visual settings were supplied" };
    const previous = presets[key];
    presets[key] = {
      title: cleanText(payload.title),
      artist: cleanText(payload.artist),
      album: cleanText(payload.album),
      savedAt: Date.now(),
      visual,
    };
    const entries = Object.entries(presets);
    if (entries.length > MAX_PRESETS) {
      entries.sort((a, b) => Number(b[1]?.savedAt || 0) - Number(a[1]?.savedAt || 0));
      presets = Object.fromEntries(entries.slice(0, MAX_PRESETS));
    }
    if (!saveFile()) {
      if (previous) presets[key] = previous;
      else delete presets[key];
      return { ok: false, error: "The song look could not be written to disk" };
    }
    return { ok: true, preset: get(key) };
  }

  function remove(keyValue) {
    load();
    const key = keyFor(keyValue);
    if (!key || !presets[key]) return { ok: true, removed: false };
    const previous = presets[key];
    delete presets[key];
    if (!saveFile()) {
      presets[key] = previous;
      return { ok: false, removed: false, error: "The song look could not be written to disk" };
    }
    return { ok: true, removed: true };
  }

  return { load, get, set, remove };
}

module.exports = { createSongPresetsStore };
