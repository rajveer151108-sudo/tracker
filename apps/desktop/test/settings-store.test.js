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

test("retired Midnight and Orbit modes migrate to supported experiences", () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "afterglow-settings-"));
  try {
    fs.writeFileSync(path.join(userData, "settings.json"), JSON.stringify({ homeMode: "midnight", lyricsLayout: "orbit" }));
    const settings = createSettingsStore({ getPath: () => userData }).load();
    assert.equal(settings.homeMode, "arcade");
    assert.equal(settings.lyricsLayout, "wordstack");
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
    for (const lyricsLayout of ["kinetic", "morphstack", "prism", "buildstack", "constellation", "captioncards", "poster"]) {
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

test("the retired line phrase builder migrates to the word stack version", () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "afterglow-settings-"));
  try {
    fs.writeFileSync(path.join(userData, "settings.json"), JSON.stringify({ lyricsLayout: "linebuilder" }));
    assert.equal(createSettingsStore({ getPath: () => userData }).load().lyricsLayout, "buildstack");
  } finally {
    fs.rmSync(userData, { recursive: true, force: true });
  }
});

test("phrase builder editorial accents and cinematic lyric sizes persist", () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "afterglow-settings-"));
  try {
    const store = createSettingsStore({ getPath: () => userData });
    store.load();
    store.update({ phraseAccents: "cards", lyricsSize: 148, glowThickness: 360 });
    const settings = createSettingsStore({ getPath: () => userData }).load();
    assert.equal(settings.phraseAccents, "cards");
    assert.equal(settings.lyricsSize, 148);
    assert.equal(settings.glowThickness, 360);
  } finally {
    fs.rmSync(userData, { recursive: true, force: true });
  }
});

test("visual automation features can be enabled and disabled independently", () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "afterglow-settings-"));
  try {
    const store = createSettingsStore({ getPath: () => userData });
    store.load();
    store.update({ songPresetsEnabled: false, cinematicTransitions: false, directorMode: true });
    const settings = createSettingsStore({ getPath: () => userData }).load();
    assert.equal(settings.songPresetsEnabled, false);
    assert.equal(settings.cinematicTransitions, false);
    assert.equal(settings.directorMode, true);
  } finally {
    fs.rmSync(userData, { recursive: true, force: true });
  }
});

test("the tempo-driven flow streak persists", () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "afterglow-settings-"));
  try {
    const store = createSettingsStore({ getPath: () => userData });
    store.load();
    store.update({ glowStyle: "flowline" });
    assert.equal(createSettingsStore({ getPath: () => userData }).load().glowStyle, "flowline");
  } finally {
    fs.rmSync(userData, { recursive: true, force: true });
  }
});

test("retired experimental edge lines migrate to the flow streak", () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "afterglow-settings-"));
  try {
    fs.writeFileSync(path.join(userData, "settings.json"), JSON.stringify({ glowStyle: "twinline" }));
    assert.equal(createSettingsStore({ getPath: () => userData }).load().glowStyle, "flowline");
  } finally {
    fs.rmSync(userData, { recursive: true, force: true });
  }
});

test("lyrics and glow dance settings persist independently", () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "afterglow-settings-"));
  try {
    const store = createSettingsStore({ getPath: () => userData });
    store.load();
    store.update({ lyricsDance: false, glowDance: true });

    const reloaded = createSettingsStore({ getPath: () => userData });
    const settings = reloaded.load();
    assert.equal(settings.lyricsDance, false);
    assert.equal(settings.glowDance, true);
  } finally {
    fs.rmSync(userData, { recursive: true, force: true });
  }
});

test("the old combined dance switch migrates to both new controls", () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "afterglow-settings-"));
  try {
    fs.writeFileSync(path.join(userData, "settings.json"), JSON.stringify({ musicMotion: false }));
    const store = createSettingsStore({ getPath: () => userData });
    const settings = store.load();
    assert.equal(settings.lyricsDance, false);
    assert.equal(settings.glowDance, false);
  } finally {
    fs.rmSync(userData, { recursive: true, force: true });
  }
});
