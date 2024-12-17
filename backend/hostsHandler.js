const fs = require("fs");
const path = require("path");
const sudo = require("sudo-prompt");

const hostsPath =
  process.platform === "win32"
    ? "C:\\Windows\\System32\\drivers\\etc\\hosts"
    : "/etc/hosts";

const blocklistPath = path.join(__dirname, "../assets/preset-blocklist.txt");
const markerStart = "# SalamGuard Blocklist Start";
const markerEnd = "# SalamGuard Blocklist End";

// Helper to read preset blocklist
const readBlocklist = () => {
  return fs.readFileSync(blocklistPath, "utf-8").trim().split("\n");
};

// Check if the blocklist is already applied
const isBlocklistApplied = (callback) => {
  fs.readFile(hostsPath, "utf-8", (err, data) => {
    if (err) return callback(false);
    const blocked = data.includes(markerStart) && data.includes(markerEnd);
    callback(blocked);
  });
};

// Append URLs to the hosts file
const appendToHosts = (entries, callback) => {
  const combinedEntries = entries.join("\n"); // Combine all entries at once
  const command =
    process.platform === "win32"
      ? `echo "${combinedEntries}" >> "${hostsPath}"`
      : `sh -c 'echo "${combinedEntries}" >> "${hostsPath}"'`;

  sudo.exec(command, { name: "SalamGuard" }, (error) => {
    if (error) {
      console.error("Error appending to hosts file:", error);
      return callback(false, "Failed to update the hosts file.");
    }
    callback(true, "Successfully updated the hosts file.");
  });
};

// Block preset URLs
const blockPresetUrls = (callback) => {
  isBlocklistApplied((alreadyBlocked) => {
    if (alreadyBlocked) {
      return callback(false, "Haram content is already blocked.");
    }
    const urls = readBlocklist();
    appendToHosts(urls, callback);
  });
};

/**
 * Grant permissions to the hosts file (One-time setup).
 */
const setupPermissions = (callback) => {
  const command =
    process.platform === "win32"
      ? `icacls "${hostsPath}" /grant ${process.env.USERNAME}:F`
      : `chmod 666 "${hostsPath}"`;

  console.log("Executing permission setup command:", command);

  sudo.exec(command, { name: "SalamGuard" }, (error, stdout, stderr) => {
    if (error) {
      console.error("Permission setup failed:", error);
      return callback(false, "Failed to grant permissions.");
    }
    console.log("Permission setup output:", stdout);
    callback(true, "Permissions granted successfully.");
  });
};

/**
 * Add custom URL to the hosts file.
 */
const addCustomUrl = (url, callback) => {
  if (!url) {
    console.error("Backend: Invalid URL provided."); // Debug log
    return callback(false, "Invalid URL provided.");
  }

  const cleanDomain = url.replace(/^www\./, ""); // Ensure no duplicate "www."
  const entries = [`127.0.0.1 ${cleanDomain}`, `127.0.0.1 www.${cleanDomain}`];

  console.log("Backend: Attempting to add entries to hosts file:", entries); // Debug log

  fs.readFile(hostsPath, "utf-8", (err, data) => {
    if (err) {
      console.error("Backend: Error reading hosts file:", err); // Debug log
      return callback(false, "Unable to access hosts file.");
    }

    if (data.includes(url)) {
      console.log("Backend: URL already exists in hosts file."); // Debug log
      return callback(false, "URL is already in the hosts file.");
    }

    appendToHosts(entries, callback);
  });
};

/**
 * Remove custom URL from the hosts file.
 */
const removeCustomUrl = (url, callback) => {
  fs.readFile(hostsPath, "utf-8", (err, data) => {
    if (err) return callback(false, "Failed to read the hosts file.");

    // Filter out lines containing the URL
    const cleanDomain = url.replace(/^www\./, "");
    const updatedContent = data
      .split("\n")
      .filter(
        (line) =>
          !line.includes(`127.0.0.1 ${cleanDomain}`) &&
          !line.includes(`127.0.0.1 www.${cleanDomain}`)
      )
      .join("\n");

    // Use sudo to write the updated content back to the hosts file
    const command = `sh -c 'echo "${updatedContent}" > "${hostsPath}"'`;

    sudo.exec(command, { name: "SalamGuard" }, (error) => {
      if (error) return callback(false, "Failed to update the hosts file.");

      // Send updated list back
      const updatedUrls = extractCustomUrls(updatedContent);
      callback(true, updatedUrls);
    });
  });
};

// Helper to extract custom URLs from hosts file
const extractCustomUrls = (data) => {
  const regex = /127\.0\.0\.1\s+(?!localhost)(\S+)/g;
  const urls = [];
  let match;

  while ((match = regex.exec(data)) !== null) {
    const domain = match[1].replace(/^www\./, ""); // Clean 'www.' duplicates
    if (!urls.includes(domain)) urls.push(domain);
  }

  return urls;
};

module.exports = {
  blockPresetUrls,
  isBlocklistApplied,
  setupPermissions,
  addCustomUrl,
  removeCustomUrl,
};
