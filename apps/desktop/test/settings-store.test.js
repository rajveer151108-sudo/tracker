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
