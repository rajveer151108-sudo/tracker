const path = require("path");
const {
  app,
  BrowserWindow,
  ipcMain,
  screen,
  desktopCapturer,
  shell,
  safeStorage,
  systemPreferences,
} = require("electron");

// Electron 45's Core Audio Tap path does not reliably connect loopback audio
// when the app supplies its own desktop source. Electron 44 still supports the
// ScreenCaptureKit route, which works with macOS's granted Screen & System
// Audio Recording permission and avoids a native picker on every start.
if (process.platform === "darwin") {
  app.commandLine.appendSwitch("disable-features", "MacCatapLoopbackAudioForScreenShare");
}
const { createSettingsStore } = require("./src/main/settings-store");
const { createSpotifyDesktop } = require("./src/main/spotify-desktop");
const { createLyricsService } = require("./src/main/lyrics-service");
const { createGenreService } = require("./src/main/genre-service");
const { createSpotifyLibrary } = require("./src/main/spotify-library");
const { createTrackerSync } = require("./src/main/tracker-sync");
const { createGlowManager } = require("./src/main/glow-manager");
const { TRACKER_URL } = require("./src/shared/config");

const rootDir = __dirname;
const settingsStore = createSettingsStore(app);
const lyrics = createLyricsService(settingsStore.get);
const genre = createGenreService(app);

let mainWindow = null;
let immersive = false;

const spotifyDesktop = createSpotifyDesktop({ app, getWindow: () => mainWindow });
const spotifyLibrary = createSpotifyLibrary({
  app,
  safeStorage,
  shell,
  isSpotifyUri: spotifyDesktop.isSpotifyUri,
});
const glow = createGlowManager({
  app,
  BrowserWindow,
  screen,
  getSettings: settingsStore.get,
  rootDir,
});
const trackerSync = createTrackerSync({ app, safeStorage, getWindow: () => mainWindow });

function setImmersive(on) {
  if (!mainWindow || mainWindow.isDestroyed() || on === immersive) return;
  immersive = on;
  if (process.platform === "darwin") mainWindow.setSimpleFullScreen(on);
  else mainWindow.setFullScreen(on);
  mainWindow.webContents.send("fullscreen", on);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 520,
    height: 800,
    title: "Afterglow",
    backgroundColor: "#0b0b0f",
    frame: false,
    webPreferences: {
      preload: path.join(rootDir, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      webviewTag: true,
    },
  });
  mainWindow.webContents.on("will-attach-webview", (event, webPreferences, params) => {
    try {
      if (params.partition !== "persist:afterglow-tracker") throw new Error("Unexpected webview partition");
      webPreferences.preload = path.join(rootDir, "tracker-webview-preload.js");
      webPreferences.nodeIntegration = false;
      webPreferences.contextIsolation = true;
      webPreferences.sandbox = true;
    } catch {
      event.preventDefault();
    }
  });
  mainWindow.loadFile(path.join(rootDir, "index.html"));
  glow.setMainWindow(mainWindow);
}

function registerIpc() {
  ipcMain.handle("now-playing", spotifyDesktop.readSpotify);
  ipcMain.handle("control", (_event, action) => spotifyDesktop.control(action));
  ipcMain.handle("seek", (_event, positionSec) => spotifyDesktop.seek(positionSec));
  ipcMain.handle("play-uri", (_event, uri, context) => spotifyDesktop.playUri(uri, context));

  ipcMain.handle("lyrics", (_event, info) => lyrics.fetchLyrics(info || {}));
  ipcMain.handle("lyrics-diag", (_event, info) => lyrics.diagnose(info || {}));
  ipcMain.handle("genre", (_event, info) => genre.fetchGenre(info || {}));
  ipcMain.handle("screen-capture-status", () => process.platform === "darwin"
    ? systemPreferences.getMediaAccessStatus("screen")
    : "granted");
  ipcMain.handle("system-audio-source", async () => {
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: 0, height: 0 },
      fetchWindowIcons: false,
    });
    if (!sources[0]) throw new Error("No screen source is available for system audio capture");
    return sources[0].id;
  });

  ipcMain.handle("history-get", spotifyLibrary.loadHistory);
  ipcMain.on("history-add", (_event, track) => spotifyLibrary.addHistory(track));
  ipcMain.handle("sp-login", spotifyLibrary.login);
  ipcMain.handle("sp-logout", spotifyLibrary.logout);
  ipcMain.handle("sp-status", spotifyLibrary.status);
  ipcMain.handle("sp-api", (_event, requestPath) => spotifyLibrary.api(requestPath));
  ipcMain.handle("tracker-connect", (_event, trackerSession) => trackerSync.connect(trackerSession));
  ipcMain.handle("tracker-disconnect", trackerSync.disconnect);
  ipcMain.handle("tracker-sync-status", trackerSync.status);
  ipcMain.on("tracker-observe", (_event, track) => trackerSync.observe(track));

  ipcMain.handle("settings-get", settingsStore.get);
  ipcMain.on("settings-set", (_event, patch) => {
    const { before, settings } = settingsStore.update(patch);
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("settings", settings);
    if (settings.glowDisplays !== before.glowDisplays) glow.createOverlays();
    else glow.refresh();
  });

  ipcMain.on("glow-update", (_event, patch) => glow.update(patch));
  ipcMain.on("beat", (_event, value) => {
    if (typeof value === "number") glow.beat(value);
    else if (value && typeof value === "object") {
      const motion = {};
      for (const key of ["impact", "energy", "vocal", "lift", "word", "build", "duck", "drop", "emotion"]) {
        if (typeof value[key] === "number" && Number.isFinite(value[key])) {
          motion[key] = Math.max(0, Math.min(1.5, value[key]));
        }
      }
      if (typeof value.sway === "number" && Number.isFinite(value.sway)) {
        motion.sway = Math.max(-1, Math.min(1, value.sway));
      }
      glow.beat(motion);
    }
  });
  ipcMain.on("fullscreen-toggle", () => setImmersive(!immersive));
  ipcMain.on("win-minimize", () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize();
  });
  ipcMain.on("win-close", () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
  });
  ipcMain.on("tracker-open-external", () => shell.openExternal(TRACKER_URL));
}

app.whenReady().then(() => {
  settingsStore.load();
  spotifyLibrary.loadAuth();
  trackerSync.load();
  registerIpc();
  createWindow();
  glow.createOverlays();
  glow.watchDisplays();
});

app.on("window-all-closed", () => app.quit());
