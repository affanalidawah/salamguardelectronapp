// preload.js

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  // setupPermissions: () => ipcRenderer.send("setup-permissions"),
  blockPresetUrls: () => ipcRenderer.send("block-preset-urls"),
  addCustomUrl: (url) => {
    console.log("Preload: Received URL to add:", url); // Debug log
    ipcRenderer.send("add-custom-url", url);
  },
  onNotify: (callback) =>
    ipcRenderer.on("notify", (_, args) => {
      console.log("Preload: Received notification:", args); // Debug log
      callback(args);
    }),
  removeCustomUrl: (url) => ipcRenderer.send("remove-custom-url", url),
  getCustomList: () => ipcRenderer.send("get-custom-list"),
  onUpdateCustomList: (callback) =>
    ipcRenderer.on("update-custom-list", (_, args) => callback(args)),
  blockHaramContent: () => ipcRenderer.send("block-haram-content"),
  onUpdateProgress: (callback) =>
    ipcRenderer.on("update-progress", (_, current, total) =>
      callback(current, total)
    ),
  onBlocklistSuccess: (callback) =>
    ipcRenderer.on("blocklist-success", (_, message) => callback(message)),
  onBlocklistError: (callback) =>
    ipcRenderer.on("blocklist-error", (_, message) => callback(message)),
  onBlockHaramSuccess: (callback) =>
    ipcRenderer.on("block-haram-success", (_, args) => callback(args)),
  onCheckHaramStatus: (callback) =>
    ipcRenderer.on("check-haram-status", (_, status) => callback(status)),
  receiveInitialConfig: (callback) =>
    ipcRenderer.on("initial-config", (_, config) => callback(config)),
});
