const fs = require("fs");
const path = require("path");
const { app, BrowserWindow, ipcMain } = require("electron");
const {
  isBlocklistApplied,
  addCustomUrl,
  removeCustomUrl,
  appendBlocklist,
} = require("./backend/hostsHandler");

const {
  ensureFileExists,
  readJsonFile,
  writeJsonFile,
  customUrlsPath,
} = require("./utils");

let mainWindow;
const configPath = path.join(app.getPath("userData"), "config.json");

ensureFileExists(customUrlsPath, []);
ensureFileExists(configPath);

function readConfig() {
  return readJsonFile(configPath);
}

function updateConfig(updates) {
  const config = readConfig();
  writeJsonFile(configPath, { ...config, ...updates });
}

app.on("ready", () => {
  mainWindow = new BrowserWindow({
    width: 1250,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Send initial config and haram status to the renderer
  mainWindow.webContents.on("did-finish-load", () => {
    const config = readConfig();
    mainWindow.webContents.send("initial-config", config);
    const customUrls = readJsonFile(customUrlsPath);
    mainWindow.webContents.send("update-custom-list", customUrls); // Send initial list

    isBlocklistApplied((blocked) => {
      mainWindow.webContents.send("check-haram-status", blocked);
    });
  });

  mainWindow.loadFile(path.join(__dirname, "renderer/index.html"));
});

// IPC: Start blocking haram content
ipcMain.on("block-haram-content", (event) => {
  appendBlocklist(event, (success, message) => {
    if (success) {
      isBlocklistApplied((blocked) => {
        event.reply("check-haram-status", blocked);
      });
    } else {
      event.reply("blocklist-error", message);
    }
  });
});

// Handle adding a custom URL
ipcMain.on("add-custom-url", (event, url) => {
  console.log("Received request to add URL:", url);

  addCustomUrl(url, (success, message) => {
    console.log("Add custom URL result:", { success, message });

    if (success) {
      const customUrls = readJsonFile(customUrlsPath);
      console.log("Updated custom URLs after addition:", customUrls);
      event.reply("update-custom-list", customUrls); // Notify the renderer
    }

    event.reply("notify", { success, message });
  });
});

// Handle removing a custom URL
ipcMain.on("remove-custom-url", (event, url) => {
  removeCustomUrl(url, (success, message) => {
    if (success) {
      let customUrls = readJsonFile(customUrlsPath);
      customUrls = customUrls.filter((item) => item !== url);
      writeJsonFile(customUrlsPath, customUrls);
      event.reply("update-custom-list", customUrls);
    }
    event.reply("notify", { success, message });
  });
});

// Send the initial custom URL list on app start
ipcMain.on("get-custom-list", (event) => {
  const customUrls = readJsonFile(customUrlsPath);
  event.reply("update-custom-list", customUrls);
});
