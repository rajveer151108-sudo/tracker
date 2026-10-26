const path = require("path");

function createGlowManager({ app, BrowserWindow, screen, getSettings, rootDir }) {
  let mainWindow = null;
  let overlays = [];
  let displayTimer = null;
  const state = { color: "29, 185, 84", color2: "29, 185, 84", active: false, focused: true, speed: 9 };

  const hexToRgb = (hex) => {
    const value = parseInt(hex.slice(1), 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255].join(", ");
  };

  function send(channel, payload) {
    for (const overlay of overlays) {
      if (!overlay.isDestroyed()) overlay.webContents.send(channel, payload);
    }
  }

  function push() {
    const settings = getSettings();
    const scopeOk = settings.glowScope === "everywhere" || state.focused;
    const color = settings.glowOverride ? hexToRgb(settings.glowColorA) : state.color;
    const color2 = settings.glowOverride ? hexToRgb(settings.glowColorB) : state.color2 || state.color;
    send("glow", {
      color,
      color2,
      on: settings.glow && state.active && scopeOk,
      strength: settings.glowStrength,
      thickness: settings.glowThickness,
      style: settings.glowStyle,
      speed: state.speed,
    });
  }

  function makeOverlay(bounds) {
    const overlay = new BrowserWindow({
      ...bounds,
      enableLargerThanScreen: true,
      transparent: true,
      frame: false,
      hasShadow: false,
      resizable: false,
      movable: false,
      focusable: false,
      skipTaskbar: true,
      show: false,
      webPreferences: {
        preload: path.join(rootDir, "overlay-preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    });
    overlay.setBounds(bounds);
    overlay.setIgnoreMouseEvents(true);
    overlay.setAlwaysOnTop(true, "screen-saver");
    overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    overlay.loadFile(path.join(rootDir, "overlay.html"));
    overlay.webContents.once("did-finish-load", () => {
      overlay.showInactive();
      push();
    });
    return overlay;
  }

  function createOverlays() {
    for (const overlay of overlays) if (!overlay.isDestroyed()) overlay.destroy();
    overlays = [];
    const settings = getSettings();
    const displays = settings.glowDisplays === "main" ? [screen.getPrimaryDisplay()] : screen.getAllDisplays();
    for (const display of displays) overlays.push(makeOverlay(display.bounds));
    if (process.platform === "darwin") app.dock.show();
  }

  function update(patch) {
    if (typeof patch?.color === "string") state.color = patch.color;
    if (typeof patch?.color2 === "string") state.color2 = patch.color2;
    if (typeof patch?.speed === "number" && patch.speed > 0.5 && patch.speed < 120) state.speed = patch.speed;
    if (typeof patch?.active === "boolean") state.active = patch.active;
    push();
  }

  function setMainWindow(window) {
    mainWindow = window;
    mainWindow.on("focus", () => {
      state.focused = true;
      push();
    });
    mainWindow.on("blur", () => {
      state.focused = false;
      push();
    });
    mainWindow.on("closed", destroy);
  }

  function destroy() {
    for (const overlay of overlays) if (!overlay.isDestroyed()) overlay.destroy();
    overlays = [];
    mainWindow = null;
  }

  function onDisplaysChanged() {
    clearTimeout(displayTimer);
    displayTimer = setTimeout(createOverlays, 400);
  }

  function watchDisplays() {
    screen.on("display-added", onDisplaysChanged);
    screen.on("display-removed", onDisplaysChanged);
    screen.on("display-metrics-changed", onDisplaysChanged);
  }

  return { setMainWindow, createOverlays, watchDisplays, refresh: push, update, beat: (value) => send("beat", value), destroy };
}

module.exports = { createGlowManager };
