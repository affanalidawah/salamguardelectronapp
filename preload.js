// preload.js

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  readHostsFile: async () => ipcRenderer.invoke("read-hosts-file"),
  getBlocklistUrls: async () => ipcRenderer.invoke("get-blocklist"),
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
  checkBlocklistIntegrity: () => ipcRenderer.send("check-blocklist-integrity"),
  onBlocklistIntegrityStatus: (callback) =>
    ipcRenderer.on("blocklist-integrity-status", (_, isValid, result) =>
      callback(isValid, result)
    ),
  rewriteHosts: (content, callback) => {
    ipcRenderer.once("block-haram-success", (_, response) => {
      callback(response.success, response);
    });
    ipcRenderer.send("rewrite-hosts", content);
  },
  onRewriteHostsResult: (callback) => {
    ipcRenderer.on("rewrite-hosts-result", (event, success, message) => {
      callback(success, message);
    });
  },
});
