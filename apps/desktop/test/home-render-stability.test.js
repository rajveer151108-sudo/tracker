const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const automationCss = fs.readFileSync(path.join(__dirname, "../src/renderer/styles/automation.css"), "utf8");
const homeCss = fs.readFileSync(path.join(__dirname, "../src/renderer/styles/home.css"), "utf8");
const homeSource = fs.readFileSync(path.join(__dirname, "../src/renderer/components/home.js"), "utf8");
const controlsSource = fs.readFileSync(path.join(__dirname, "../src/renderer/components/controls.js"), "utf8");
const mainSource = fs.readFileSync(path.join(__dirname, "../main.js"), "utf8");
const immersiveCss = fs.readFileSync(path.join(__dirname, "../src/renderer/styles/immersive.css"), "utf8");

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

test("left-rack playback acknowledges the click before its insertion animation", () => {
  for (const launcher of ["launchHomeGame", "launchHomeVinyl", "launchHomeCd"]) {
    const start = homeSource.indexOf(`async function ${launcher}`);
    const body = homeSource.slice(start, homeSource.indexOf("\n}", start) + 2);
    assert.match(body, /markHomeLaunchSource\(source\)/);
  }
  assert.match(homeCss, /\.homeSong\.launching/);
  assert.match(homeSource, /clearHomeLaunchSources\(\)/);
});

test("Home freezes the hero DOM while a physical player animation is running", () => {
  assert.match(homeSource, /function homeHeroRenderLocked\(\)/);
  assert.match(homeSource, /if\(!force&&hero\.childElementCount&&homeHeroRenderLocked\(\)\)\{homeState\.heroRenderPending=true;return;\}/);
  assert.match(homeSource, /homeStereoScene"\)\)renderHomeHero\(true\)/);
  assert.match(homeSource, /homeCdScene"\)\)renderHomeHero\(true\)/);
});

test("fullscreen keeps the current view and follows the native window state", () => {
  assert.match(homeSource, /sessionStorage\.setItem\("afterglow-view",wanted\)/);
  assert.match(homeSource, /sessionStorage\.getItem\("afterglow-view"\)/);
  assert.match(mainSource, /function windowIsImmersive\(\)/);
  assert.match(mainSource, /setImmersive\(!windowIsImmersive\(\)\)/);
  assert.doesNotMatch(controlsSource, /onFullscreen\(\(on\) => \{[^}]*activeIdx = -2/);
  assert.match(immersiveCss, /header #headerActions \{ position: fixed/);
});

test("Arcade titles wrap only between words at narrow widths", () => {
  assert.match(homeCss, /\.arcadeScreenInfo h2\{[^}]*overflow-wrap:normal;word-break:normal;hyphens:none/);
  assert.match(homeCss, /@media\(max-width:850px\)\{body\[data-home-mode="arcade"\] \.homeLayout/);
  assert.doesNotMatch(homeCss, /\.arcadeScreenInfo h2\{[^}]*overflow-wrap:anywhere/);
});
