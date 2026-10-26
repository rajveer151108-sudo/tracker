const { contextBridge, ipcRenderer } = require("electron");

const TRACKER_ORIGIN = "https://rajveer151108-sudo.github.io";

if (window.location.origin === TRACKER_ORIGIN) {
  contextBridge.exposeInMainWorld("afterglowDesktop", {
    connect: (session) => ipcRenderer.sendToHost("tracker-session", session),
    disconnect: () => ipcRenderer.sendToHost("tracker-disconnect"),
  });
}
