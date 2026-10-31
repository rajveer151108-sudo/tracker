const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { createVaultStore } = require("../src/main/vault-store");

test("Vault imports managed audio copies and persists organised metadata", () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "afterglow-vault-"));
  const source = path.join(userData, "Nova - Night Drive.wav");
  try {
    fs.writeFileSync(source, "fake wave bytes");
    const store = createVaultStore({ getPath: () => userData });
    const imported = store.addFiles([source]);
    assert.equal(imported.ok, true);
    assert.equal(imported.imported.length, 1);
    assert.equal(imported.imported[0].title, "Night Drive");
    assert.equal(imported.imported[0].artist, "Nova");
    assert.match(imported.imported[0].audioUrl, /^file:/);
    const updated = store.update(imported.imported[0].id, {
      project: "Blue Room", version: "Mix 4", status: "mixing", tags: "night, synth", bpm: "118", key: "F#m",
    });
    assert.equal(updated.ok, true);
    const reloaded = createVaultStore({ getPath: () => userData }).snapshot().tracks[0];
    assert.equal(reloaded.project, "Blue Room");
    assert.equal(reloaded.version, "Mix 4");
    assert.equal(reloaded.status, "mixing");
    assert.equal(reloaded.bpm, "118");
  } finally {
    fs.rmSync(userData, { recursive: true, force: true });
  }
});

test("Vault de-duplicates repeated imports and removes only its library entry", () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "afterglow-vault-"));
  const source = path.join(userData, "Idea.mp3");
  try {
    fs.writeFileSync(source, "fake mp3 bytes");
    const store = createVaultStore({ getPath: () => userData });
    const first = store.addFiles([source]);
    const second = store.addFiles([source]);
    assert.equal(second.library.tracks.length, 1);
    assert.equal(second.imported[0].id, first.imported[0].id);
    assert.equal(store.remove(first.imported[0].id).removed, true);
    assert.equal(store.snapshot().tracks.length, 0);
    assert.equal(fs.existsSync(source), true);
  } finally {
    fs.rmSync(userData, { recursive: true, force: true });
  }
});
