# Afterglow

Afterglow is an enhanced Spotify desktop player for macOS. It wraps the Spotify desktop app with synced lyrics, album-art atmosphere, screen-edge glow, beat reaction, and a lightweight Spotify library/search view.

## Project Layout

- `main.js` - small Electron bootstrap and IPC wiring layer.
- `src/main/` - native services split by responsibility:
  - `settings-store.js` - validated, persistent app settings.
  - `spotify-desktop.js` - macOS Spotify playback state and controls.
  - `lyrics-service.js` - word-timed and line-timed lyric lookup.
  - `genre-service.js` - genre lookup and caching.
  - `spotify-library.js` - Spotify OAuth, Web API, and local play history.
  - `glow-manager.js` - screen-edge overlay lifecycle and state.
- `preload.js` - safe renderer IPC bridge for the main player window.
- `overlay-preload.js` - safe IPC bridge for screen-edge glow overlays.
- `index.html` - main player shell.
- `overlay.html` - transparent screen-edge overlay shell.
- `src/renderer/components/` - player UI behavior split by responsibility:
  - `settings-panel.js` - settings UI and live setting application.
  - `lyrics.js` - lyric parsing/rendering, timing, genre feel, album colors.
  - `beat.js` - system-audio capture and beat pulse logic.
  - `library.js` - Spotify library/search/history UI.
  - `controls.js` - playback controls, keyboard shortcuts, fullscreen behavior.
  - `frame-loop.js` - animation frame loop and lyric progress updates.
  - `backdrop.js` - album-art background transitions.
  - `init.js` - app startup.
- `src/renderer/styles/` - CSS split by UI area so visual fixes stay local.
- `src/overlay/` - overlay rendering behavior and styles.

## Development

```sh
npm install
npm start
```

## Checks

```sh
npm run check
```

## Build

```sh
npm run build:mac
```

The build script packages the app as `Afterglow.app`, installs it into `/Applications`, and signs it ad hoc so macOS will run it locally.
