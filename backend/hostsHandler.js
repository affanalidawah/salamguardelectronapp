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
  try {
    return fs.readFileSync(blocklistPath, "utf-8").trim().split("\n");
  } catch (error) {
    console.error("Failed to read blocklist:", error);
    return [];
  }
};

// Check if the blocklist is already applied
const isBlocklistApplied = (callback) => {
  fs.readFile(hostsPath, "utf-8", (err, data) => {
    if (err) {
      console.error("Error reading hosts file:", err);
      return callback(false);
    }
    callback(data.includes(markerStart) && data.includes(markerEnd));
  });
};

// Append blocklist and clean up invalid entries
const appendBlocklist = (event, callback) => {
  const blocklist = fs.readFileSync(blocklistPath, "utf-8").trim().split("\n");

  // Clean up entries: Ignore IPs like 0.0.0.0 and extract only domains
  const cleanedEntries = blocklist
    .map((line) => {
      const parts = line.split(/\s+/); // Split line by spaces
      if (parts.length === 2) return parts[1]; // If "0.0.0.0 domain.com", get the domain
      return parts[0]; // If only "domain.com", return as is
    })
    .filter((domain) => domain && !domain.startsWith("0.0.0.0")); // Exclude empty and invalid entries

  if (cleanedEntries.length === 0) {
    console.error("Blocklist is empty or invalid.");
    return callback(false, "Blocklist is empty or invalid.");
  }

  const tempFile = path.join(require("os").tmpdir(), "blocklist_temp.txt");

  const totalEntries = cleanedEntries.length;
  let currentProgress = 0;

  fs.writeFileSync(tempFile, ""); // Start with an empty temp file

  const batchSize = 500;
  let currentBatch = 0;

  const writeBatch = () => {
    const batch = cleanedEntries
      .slice(currentBatch * batchSize, (currentBatch + 1) * batchSize)
      .map((domain) => `127.0.0.1 ${domain}\n127.0.0.1 www.${domain}`)
      .join("\n");

    fs.appendFileSync(tempFile, batch + "\n");

    currentBatch++;
    currentProgress += batchSize;

    // Send progress updates to the renderer process
    event.sender.send(
      "update-progress",
      Math.min(currentProgress, totalEntries),
      totalEntries
    );

    if (currentBatch * batchSize < totalEntries) {
      setImmediate(writeBatch);
    } else {
      executeAppendCommand(tempFile, callback, event);
    }
  };

  writeBatch();
};

// Execute append command
const executeAppendCommand = (tempFile, callback, event) => {
  const appendCommand =
    process.platform === "win32"
      ? `
      if (Test-Path "${tempFile}") {
          Get-Content "${tempFile}" | Out-File -Append -Encoding ascii "${hostsPath}";
          ipconfig /flushdns;
          Remove-Item "${tempFile}";
      }
    `
      : `
      sudo sh -c '[ -f "${hostsPath}" ] && cat "${tempFile}" >> "${hostsPath}" && dscacheutil -flushcache && killall -HUP mDNSResponder && rm "${tempFile}"'
    `;

  sudo.exec(appendCommand, { name: "SalamGuard" }, (error) => {
    if (error) {
      console.error("Failed to append blocklist:", error);
      event.sender.send("blocklist-error", "Failed to append blocklist.");
      return callback(false, "Failed to append blocklist.");
    }

    event.sender.send("blocklist-success", "Blocklist appended successfully.");
    callback(true, "Blocklist appended successfully.");
  });
};

// Helper to flush DNS cache
const flushDNSCache = (callback) => {
  const flushCommand =
    process.platform === "win32"
      ? "ipconfig /flushdns"
      : "dscacheutil -flushcache && killall -HUP mDNSResponder";

  sudo.exec(flushCommand, { name: "SalamGuard" }, (error) => {
    if (error) {
      console.error("Failed to flush DNS cache:", error);
      return callback(false, "Failed to flush DNS cache.");
    }
    callback(true, "DNS cache flushed successfully.");
  });
};

// Undo the blocklist by removing content between markers
const undoBlocklist = (callback) => {
  fs.readFile(hostsPath, "utf-8", (err, data) => {
    if (err) return callback(false, "Failed to read the hosts file.");

    const updatedContent = data.replace(
      new RegExp(`${markerStart}[\\s\\S]*?${markerEnd}`, "g"),
      ""
    );
    writeSafelyToHosts(
      updatedContent,
      callback,
      "Blocklist removed successfully."
    );
  });
};

// Remove blocklist by re-creating hosts file without blocklist entries
const removeBlocklist = (callback) => {
  fs.readFile(hostsPath, "utf-8", (err, data) => {
    if (err) return callback(false, "Failed to read the hosts file.");

    const updatedContent = data.replace(/127\.0\.0\.1\s+\S+\n?/g, "");

    const tempFile = path.join(require("os").tmpdir(), "hosts_cleaned.txt");
    fs.writeFileSync(tempFile, updatedContent);

    const overwriteCommand =
      process.platform === "win32"
        ? `copy "${tempFile}" "${hostsPath}" && ipconfig /flushdns && del "${tempFile}"`
        : `sudo cp "${tempFile}" "${hostsPath}" && dscacheutil -flushcache && killall -HUP mDNSResponder && rm "${tempFile}"`;

    sudo.exec(overwriteCommand, { name: "SalamGuard" }, (error) => {
      if (error) {
        console.error("Failed to remove blocklist:", error);
        return callback(false, "Failed to clean the hosts file.");
      }
      callback(true, "Blocklist removed successfully.");
    });
  });
};

// Safely write content to the hosts file using sudo
const writeSafelyToHosts = (
  content,
  callback,
  successMessage = "Hosts file updated successfully."
) => {
  const tempFile = path.join(__dirname, "temp_hosts_update.txt");

  try {
    fs.writeFileSync(tempFile, content);
  } catch (err) {
    console.error("Error writing to temp file:", err);
    return callback(false, "Failed to prepare the updated hosts file.");
  }

  const command =
    process.platform === "win32"
      ? `copy "${tempFile}" "${hostsPath}"`
      : `cp "${tempFile}" "${hostsPath}"`;

  sudo.exec(command, { name: "SalamGuard" }, (error) => {
    fs.unlinkSync(tempFile); // Cleanup temp file
    if (error) {
      console.error("Failed to write to hosts file:", error);
      return callback(false, "Failed to update the hosts file.");
    }
    callback(true, successMessage);
  });
};

// Grant permissions to the hosts file
const setupPermissions = (callback) => {
  const command =
    process.platform === "win32"
      ? `icacls "${hostsPath}" /grant ${process.env.USERNAME}:F`
      : `chmod 666 "${hostsPath}"`;

  console.log("Setting up permissions for hosts file...");
  sudo.exec(command, { name: "SalamGuard" }, (error) => {
    if (error) {
      console.error("Permission setup failed:", error);
      return callback(false, "Failed to grant permissions.");
    }
    callback(true, "Permissions granted successfully.");
  });
};

// Add a custom URL to the hosts file
const addCustomUrl = (url, callback) => {
  if (!url) return callback(false, "Invalid URL provided.");

  const cleanDomain = url.replace(/^www\./, "");
  const entries = [`127.0.0.1 ${cleanDomain}`, `127.0.0.1 www.${cleanDomain}`];

  fs.readFile(hostsPath, "utf-8", (err, data) => {
    if (err) return callback(false, "Failed to read the hosts file.");
    if (data.includes(`127.0.0.1 ${cleanDomain}`)) {
      return callback(false, "URL already exists in the hosts file.");
    }
    writeSafelyToHosts(`${data.trim()}\n${entries.join("\n")}\n`, callback);
  });
};

// Remove a custom URL from the hosts file
const removeCustomUrl = (url, callback) => {
  const cleanDomain = url.replace(/^www\./, "");
  fs.readFile(hostsPath, "utf-8", (err, data) => {
    if (err) return callback(false, "Failed to read the hosts file.");

    const updatedContent = data
      .split("\n")
      .filter(
        (line) =>
          !line.includes(`127.0.0.1 ${cleanDomain}`) &&
          !line.includes(`127.0.0.1 www.${cleanDomain}`)
      )
      .join("\n");

    writeSafelyToHosts(
      updatedContent,
      callback,
      "Custom URL removed successfully."
    );
  });
};

module.exports = {
  setupPermissions,
  addCustomUrl,
  removeCustomUrl,
  blockPresetUrls: (callback) => appendBlocklist(readBlocklist(), callback),
  isBlocklistApplied,
  undoBlocklist,
  appendBlocklist,
  removeBlocklist,
};
