const fs = require("fs");
const path = require("path");
const { app, BrowserWindow, ipcMain } = require("electron");
const {
  blockPresetUrls,
  isBlocklistApplied,
  addCustomUrl,
  removeCustomUrl,
  setupPermissions,
} = require("./backend/hostsHandler");

let mainWindow;
const configPath = path.join(app.getPath("userData"), "config.json");
const customUrlsPath = path.join(__dirname, "customUrls.json");

// Ensure required files exist with default values
function ensureFileExists(filePath, defaultValue) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2));
  }
}

// Read and parse JSON file with error handling
function readJsonFile(filePath) {
  try {
    ensureFileExists(filePath, []);
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (err) {
    console.error(`Error reading JSON file at ${filePath}:`, err);
    return [];
  }
}

// Write to JSON file with error handling
function writeJsonFile(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`Error writing to JSON file at ${filePath}:`, err);
  }
}

ensureFileExists(customUrlsPath, []);
ensureFileExists(configPath, { permissionsGranted: false });

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
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Send initial config and haram status to the renderer
  mainWindow.webContents.on("did-finish-load", () => {
    const config = readConfig();
    mainWindow.webContents.send("initial-config", config);

    isBlocklistApplied((blocked) => {
      mainWindow.webContents.send("check-haram-status", blocked);
    });
  });

  mainWindow.loadFile(path.join(__dirname, "renderer/index.html"));
});

// Handle "Block Haram Content" request
ipcMain.on("block-haram-content", (event) => {
  blockPresetUrls((success, message) => {
    event.reply("block-haram-success", { success, message });
  });
});

// Handle permission setup
ipcMain.on("setup-permissions", (event) => {
  setupPermissions((success, message) => {
    if (success) {
      updateConfig({ permissionsGranted: true });
    }
    event.reply("notify", { success, message });
  });
});

// Handle adding a custom URL
ipcMain.on("add-custom-url", (event, url) => {
  addCustomUrl(url, (success, message) => {
    event.reply("notify", { success, message });

    if (success) {
      const customUrls = readJsonFile(customUrlsPath);
      if (!customUrls.includes(url)) {
        customUrls.push(url);
        writeJsonFile(customUrlsPath, customUrls);
      }
      event.reply("update-custom-list", customUrls);
    }
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
