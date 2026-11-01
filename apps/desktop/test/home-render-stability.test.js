const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const automationCss = fs.readFileSync(path.join(__dirname, "../src/renderer/styles/automation.css"), "utf8");
const homeCss = fs.readFileSync(path.join(__dirname, "../src/renderer/styles/home.css"), "utf8");
const homeSource = fs.readFileSync(path.join(__dirname, "../src/renderer/components/home.js"), "utf8");

test("Home never runs the full-screen cinematic compositor transition", () => {
  assert.match(automationCss, /body\[data-view="home"\] #trackTransition\{display:none\}/);
  assert.doesNotMatch(automationCss, /track-transitioning #homeScreen\{animation:/);
  assert.doesNotMatch(homeCss, /view-enter-home #homeScreen\{animation:/);
});

test("CD mode does not use a giant blurred artwork layer behind the player", () => {
  assert.match(homeCss, /\.homeStereoAmbience\{display:none\}/);
  assert.doesNotMatch(homeCss, /\.homeStereoScene\{[^}]*perspective:/);
});

test("a pending Home launch can be replaced by the user's next click", () => {
  for (const launcher of ["launchHomeGame", "launchHomeVinyl", "launchHomeCd"]) {
    const start = homeSource.indexOf(`async function ${launcher}`);
    assert.notEqual(start, -1);
    const body = homeSource.slice(start, homeSource.indexOf("\n}", start) + 2);
    assert.doesNotMatch(body, /\|\|homeState\.slotItem\)return/);
    assert.match(body, /if\(homeState\.slotItem\)clearHomePending\(\)/);
  }
});
