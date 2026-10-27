const assert = require("node:assert/strict");
const test = require("node:test");
const { artistsFrom, parseLine, speakerFor } = require("../src/shared/dialogue-speaker");

test("feature artists default to a neutral vocals label", () => {
  assert.deepEqual(artistsFrom("Kanye West, Drake"), ["Kanye West", "Drake"]);
  assert.equal(speakerFor([{ text: "A lyric without a credit" }], 0, "Kanye West, Drake"), "VOCALS");
});

test("speaker tags switch the arcade dialogue to the credited feature", () => {
  const lines = [
    { text: "[Verse 1: Kanye West] First line" },
    { text: "Second line" },
    { text: "[Verse 2: Drake] Feature begins" },
    { text: "Feature continues" },
  ];
  assert.deepEqual(parseLine(lines[2], "Kanye West, Drake"), { text: "Feature begins", speaker: "Drake" });
  assert.equal(speakerFor(lines, 3, "Kanye West, Drake"), "Drake");
});

test("artist-name prefixes are removed only when they match a credited artist", () => {
  assert.deepEqual(parseLine({ text: "Drake: Started from the bottom" }, "Kanye West, Drake"), { text: "Started from the bottom", speaker: "Drake" });
  assert.deepEqual(parseLine({ text: "Question: who are you?" }, "Kanye West, Drake"), { text: "Question: who are you?", speaker: "" });
});
