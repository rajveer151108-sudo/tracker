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
      if (saved && typeof saved.presets === "object" && !Array.isArray(saved.presets)) presets = saved.presets;
    } catch {
      presets = {};
    }
    return presets;
  }

  function saveFile() {
    try {
      fs.writeFileSync(file(), JSON.stringify({ version: 1, presets }, null, 2));
    } catch {
      // Presets are optional; keep the in-memory copy when storage is unavailable.
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
    saveFile();
    return { ok: true, preset: get(key) };
  }

  function remove(keyValue) {
    load();
    const key = keyFor(keyValue);
    if (!key || !presets[key]) return { ok: true, removed: false };
    delete presets[key];
    saveFile();
    return { ok: true, removed: true };
  }

  return { load, get, set, remove };
}

module.exports = { createSongPresetsStore };
