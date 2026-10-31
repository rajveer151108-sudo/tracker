const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const AUDIO_EXTENSIONS = new Set([".mp3", ".m4a", ".wav", ".aiff", ".aif", ".flac", ".ogg", ".opus"]);
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"]);
const STATUSES = new Set(["idea", "demo", "mixing", "master"]);
const TEXT_FIELDS = ["title", "artist", "project", "version", "tags", "notes", "bpm", "key"];

function cleanText(value, max = 240) {
  return String(value || "").normalize("NFKC").trim().slice(0, max);
}

function titleFromFile(filePath) {
  const base = path.basename(filePath, path.extname(filePath)).replace(/[_]+/g, " ").trim();
  const divider = base.indexOf(" - ");
  return divider > 0
    ? { artist: cleanText(base.slice(0, divider), 140), title: cleanText(base.slice(divider + 3), 180) }
    : { artist: "Unknown artist", title: cleanText(base, 180) || "Untitled" };
}

function createVaultStore(app) {
  const root = () => path.join(app.getPath("userData"), "Vault");
  const indexFile = () => path.join(root(), "library.json");
  let state = { version: 1, backgroundPath: "", tracks: [] };
  let loaded = false;

  function ensureDirectories() {
    for (const folder of [root(), path.join(root(), "Audio"), path.join(root(), "Artwork"), path.join(root(), "Backgrounds")]) {
      fs.mkdirSync(folder, { recursive: true });
    }
  }

  function publicUrl(filePath) {
    return filePath && fs.existsSync(filePath) ? pathToFileURL(filePath).href : "";
  }

  function cleanTrack(track) {
    if (!track || typeof track !== "object") return null;
    const id = cleanText(track.id, 80);
    const audioPath = cleanText(track.audioPath, 1600);
    if (!id || !audioPath) return null;
    return {
      id,
      audioPath,
      originalPath: cleanText(track.originalPath, 1600),
      title: cleanText(track.title, 180) || "Untitled",
      artist: cleanText(track.artist, 140) || "Unknown artist",
      project: cleanText(track.project, 160) || "Unreleased",
      version: cleanText(track.version, 100) || "Demo",
      status: STATUSES.has(track.status) ? track.status : "demo",
      tags: cleanText(track.tags, 300),
      notes: cleanText(track.notes, 2000),
      bpm: cleanText(track.bpm, 12),
      key: cleanText(track.key, 20),
      artworkPath: cleanText(track.artworkPath, 1600),
      backgroundPath: cleanText(track.backgroundPath, 1600),
      duration: Math.max(0, Number(track.duration) || 0),
      addedAt: Math.max(0, Number(track.addedAt) || Date.now()),
      updatedAt: Math.max(0, Number(track.updatedAt) || Number(track.addedAt) || Date.now()),
    };
  }

  function load() {
    if (loaded) return state;
    loaded = true;
    ensureDirectories();
    try {
      const saved = JSON.parse(fs.readFileSync(indexFile(), "utf8"));
      state = {
        version: 1,
        backgroundPath: cleanText(saved?.backgroundPath, 1600),
        tracks: Array.isArray(saved?.tracks) ? saved.tracks.map(cleanTrack).filter(Boolean) : [],
      };
    } catch {
      state = { version: 1, backgroundPath: "", tracks: [] };
    }
    return state;
  }

  function save() {
    ensureDirectories();
    const target = indexFile();
    const temporary = `${target}.tmp`;
    try {
      fs.writeFileSync(temporary, JSON.stringify(state, null, 2));
      fs.renameSync(temporary, target);
      return true;
    } catch {
      try { fs.unlinkSync(temporary); } catch {}
      return false;
    }
  }

  function publicTrack(track) {
    return {
      ...Object.fromEntries(Object.entries(track).filter(([key]) => !key.endsWith("Path"))),
      audioUrl: publicUrl(track.audioPath),
      artworkUrl: publicUrl(track.artworkPath),
      backgroundUrl: publicUrl(track.backgroundPath),
    };
  }

  function snapshot() {
    load();
    return {
      backgroundUrl: publicUrl(state.backgroundPath),
      tracks: [...state.tracks].sort((a, b) => b.updatedAt - a.updatedAt).map(publicTrack),
    };
  }

  function addFiles(filePaths = []) {
    load();
    ensureDirectories();
    const imported = [];
    for (const value of filePaths) {
      const source = path.resolve(String(value || ""));
      const extension = path.extname(source).toLowerCase();
      if (!AUDIO_EXTENSIONS.has(extension) || !fs.existsSync(source)) continue;
      const duplicate = state.tracks.find((track) => track.originalPath === source);
      if (duplicate) { imported.push(publicTrack(duplicate)); continue; }
      const id = crypto.randomUUID();
      const target = path.join(root(), "Audio", `${id}${extension}`);
      try { fs.copyFileSync(source, target); } catch { continue; }
      const names = titleFromFile(source);
      const now = Date.now();
      const track = cleanTrack({
        id, audioPath: target, originalPath: source,
        title: names.title, artist: names.artist, project: "Unreleased",
        version: "Demo", status: "demo", addedAt: now, updatedAt: now,
      });
      state.tracks.push(track);
      imported.push(publicTrack(track));
    }
    if (imported.length && !save()) return { ok: false, error: "Vault could not write its library index" };
    return { ok: true, imported, library: snapshot() };
  }

  function update(idValue, patch = {}) {
    load();
    const id = cleanText(idValue, 80);
    const track = state.tracks.find((item) => item.id === id);
    if (!track) return { ok: false, error: "Track not found" };
    const previous = { ...track };
    for (const field of TEXT_FIELDS) {
      if (field in patch) track[field] = cleanText(patch[field], field === "notes" ? 2000 : field === "tags" ? 300 : 180);
    }
    if ("status" in patch && STATUSES.has(patch.status)) track.status = patch.status;
    if ("duration" in patch) track.duration = Math.max(0, Number(patch.duration) || 0);
    track.title ||= "Untitled";
    track.artist ||= "Unknown artist";
    track.project ||= "Unreleased";
    track.version ||= "Demo";
    track.updatedAt = Date.now();
    if (!save()) {
      Object.assign(track, previous);
      return { ok: false, error: "Vault could not save those changes" };
    }
    return { ok: true, track: publicTrack(track), library: snapshot() };
  }

  function copyImage(sourceValue, folderName) {
    const source = path.resolve(String(sourceValue || ""));
    const extension = path.extname(source).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(extension) || !fs.existsSync(source)) return "";
    ensureDirectories();
    const target = path.join(root(), folderName, `${crypto.randomUUID()}${extension}`);
    try { fs.copyFileSync(source, target); return target; } catch { return ""; }
  }

  function setTrackImage(idValue, source, kind = "artwork") {
    load();
    const track = state.tracks.find((item) => item.id === cleanText(idValue, 80));
    if (!track) return { ok: false, error: "Track not found" };
    const target = copyImage(source, kind === "background" ? "Backgrounds" : "Artwork");
    if (!target) return { ok: false, error: "That image could not be imported" };
    const field = kind === "background" ? "backgroundPath" : "artworkPath";
    const previousPath = track[field];
    const previousUpdatedAt = track.updatedAt;
    track[field] = target;
    track.updatedAt = Date.now();
    if (!save()) {
      track[field] = previousPath;
      track.updatedAt = previousUpdatedAt;
      return { ok: false, error: "Vault could not save that image" };
    }
    return { ok: true, track: publicTrack(track), library: snapshot() };
  }

  function setBackground(source) {
    load();
    const target = copyImage(source, "Backgrounds");
    if (!target) return { ok: false, error: "That background could not be imported" };
    const previous = state.backgroundPath;
    state.backgroundPath = target;
    if (!save()) {
      state.backgroundPath = previous;
      return { ok: false, error: "Vault could not save that background" };
    }
    return { ok: true, library: snapshot() };
  }

  function importImage(source, kind = "background") {
    load();
    const target = copyImage(source, kind === "artwork" ? "Artwork" : "Backgrounds");
    return target
      ? { ok: true, url: publicUrl(target) }
      : { ok: false, error: "That image could not be imported" };
  }

  function clearBackground() {
    load();
    state.backgroundPath = "";
    return save() ? { ok: true, library: snapshot() } : { ok: false, error: "Vault could not clear that background" };
  }

  function remove(idValue) {
    load();
    const id = cleanText(idValue, 80);
    const index = state.tracks.findIndex((track) => track.id === id);
    if (index < 0) return { ok: true, removed: false, library: snapshot() };
    const [track] = state.tracks.splice(index, 1);
    if (!save()) {
      state.tracks.splice(index, 0, track);
      return { ok: false, removed: false, error: "Vault could not update its library" };
    }
    return { ok: true, removed: true, library: snapshot() };
  }

  function fileFor(idValue) {
    load();
    return state.tracks.find((track) => track.id === cleanText(idValue, 80))?.audioPath || "";
  }

  return { load, snapshot, addFiles, update, setTrackImage, setBackground, clearBackground, importImage, remove, fileFor, publicUrl };
}

module.exports = { createVaultStore, AUDIO_EXTENSIONS, IMAGE_EXTENSIONS, STATUSES };
