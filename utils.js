const fs = require("fs");
const path = require("path");

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
const customUrlsPath = path.join(__dirname, "customUrls.json");

module.exports = {
  ensureFileExists,
  readJsonFile,
  writeJsonFile,
  customUrlsPath,
};
