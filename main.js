const fs = require("fs");
const path = require("path");
const { app, BrowserWindow, ipcMain } = require("electron");
const {
  addCustomUrl,
  removeCustomUrl,
  appendBlocklist,
  checkBlocklistIntegrity,
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

function readConfig(callback) {
  const defaultConfig = { haramBlocked: false }; // Default configuration

  // Ensure config file exists with correct default values
  ensureFileExists(configPath, defaultConfig);

  // Read the current config
  const config = readJsonFile(configPath);

  // Dynamically check the blocklist status and update the config
  checkBlocklistIntegrity((blocked) => {
    config.haramBlocked = blocked; // Update the value dynamically
    writeJsonFile(configPath, config); // Save the updated config
    if (callback) callback(config); // Pass updated config to callback if needed
  });

  return config;
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
    readConfig((updatedConfig) => {
      mainWindow.webContents.send("initial-config", updatedConfig); // Send updated config
    });
    const customUrls = readJsonFile(customUrlsPath);
    mainWindow.webContents.send("update-custom-list", customUrls); // Send initial list

    // checkBlocklistIntegrity((blocked) => {
    //   mainWindow.webContents.send("check-haram-status", blocked);
    // });
  });

  mainWindow.loadFile(path.join(__dirname, "renderer/index.html"));
});

ipcMain.on("check-blocklist-integrity", (event) => {
  checkBlocklistIntegrity((isValid, result) => {
    event.reply("blocklist-integrity-status", isValid, result);
  });
});

ipcMain.on("rewrite-hosts", (event) => {
  const blocklist = readBlocklist();
  const customUrls = readJsonFile(customUrlsPath);
  const content = [
    markerStart,
    ...blocklist.map((url) => `127.0.0.1 ${url}`),
    ...customUrls.map((url) => `127.0.0.1 ${url}`),
    markerEnd,
  ].join("\n");

  writeSafelyToHosts(content, (success, message) => {
    event.reply("rewrite-hosts-result", success, message);
  });
});

// IPC: Start blocking haram content
ipcMain.on("block-haram-content", (event) => {
  appendBlocklist(event, (success, message) => {
    if (success) {
      checkBlocklistIntegrity((blocked) => {
        event.reply("block-haram-success", { success: true, blocked });
      });
    } else {
      event.reply("block-haram-success", { success: false, message });
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
