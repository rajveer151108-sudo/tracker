const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("overlay", {
  onGlow: (cb) => ipcRenderer.on("glow", (_e, state) => cb(state)),
  onBeat: (cb) => ipcRenderer.on("beat", (_e, v) => cb(v)),
});
