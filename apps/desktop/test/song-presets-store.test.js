const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { createSongPresetsStore } = require("../src/main/song-presets-store");

test("song presets persist visual settings and reject unrelated controls", () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "afterglow-presets-"));
  try {
    const store = createSongPresetsStore({ getPath: () => userData });
    const saved = store.set({
      key: "spotify:track:test",
      title: "A song",
      visual: { lyricsLayout: "prism", lyricsSize: 146, directorMode: true, performanceMode: "smooth" },
    });
    assert.equal(saved.ok, true);
    const reloaded = createSongPresetsStore({ getPath: () => userData }).get("spotify:track:test");
    assert.deepEqual(reloaded.visual, { lyricsLayout: "prism", lyricsSize: 146 });
    assert.equal(reloaded.title, "A song");
  } finally {
    fs.rmSync(userData, { recursive: true, force: true });
  }
});

test("song presets can be forgotten without affecting other songs", () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "afterglow-presets-"));
  try {
    const store = createSongPresetsStore({ getPath: () => userData });
    store.set({ key: "one", visual: { lyricsLayout: "poster" } });
    store.set({ key: "two", visual: { lyricsLayout: "morphstack" } });
    assert.equal(store.remove("one").removed, true);
    assert.equal(store.get("one"), null);
    assert.equal(store.get("two").visual.lyricsLayout, "morphstack");
  } finally {
    fs.rmSync(userData, { recursive: true, force: true });
  }
});

test("corrupt preset fields are cleaned when the store is loaded", () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "afterglow-presets-"));
  try {
    fs.writeFileSync(path.join(userData, "song-presets.json"), JSON.stringify({ presets: {
      safe: { title: "Safe", visual: { lyricsLayout: "prism", directorMode: true } },
      empty: { title: "Empty", visual: { directorMode: true } },
    } }));
    const store = createSongPresetsStore({ getPath: () => userData });
    assert.deepEqual(store.get("safe").visual, { lyricsLayout: "prism" });
    assert.equal(store.get("empty"), null);
  } finally {
    fs.rmSync(userData, { recursive: true, force: true });
  }
});
