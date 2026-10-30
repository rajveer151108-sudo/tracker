const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { createSettingsStore } = require("../src/main/settings-store");

test("the retired tape slot migrates to the dedicated CD player", () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "afterglow-settings-"));
  try {
    fs.writeFileSync(path.join(userData, "settings.json"), JSON.stringify({ homeMode: "tape" }));
    const store = createSettingsStore({ getPath: () => userData });
    assert.equal(store.load().homeMode, "cd");
  } finally {
    fs.rmSync(userData, { recursive: true, force: true });
  }
});

test("the lyrics backdrop can persist a full blackout style", () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "afterglow-settings-"));
  try {
    const store = createSettingsStore({ getPath: () => userData });
    store.load();
    store.update({ backdropStyle: "black" });
    assert.equal(store.get().backdropStyle, "black");

    const reloaded = createSettingsStore({ getPath: () => userData });
    assert.equal(reloaded.load().backdropStyle, "black");
  } finally {
    fs.rmSync(userData, { recursive: true, force: true });
  }
});

test("creative lyric layouts and broken frame glow persist", () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "afterglow-settings-"));
  try {
    for (const lyricsLayout of ["kinetic", "constellation", "captioncards", "orbit", "poster"]) {
      const store = createSettingsStore({ getPath: () => userData });
      store.load();
      store.update({ lyricsLayout, glowStyle: "frame" });
      const reloaded = createSettingsStore({ getPath: () => userData });
      assert.equal(reloaded.load().lyricsLayout, lyricsLayout);
      assert.equal(reloaded.get().glowStyle, "frame");
    }
  } finally {
    fs.rmSync(userData, { recursive: true, force: true });
  }
});
