const fs = require("fs");
const path = require("path");
const sudo = require("sudo-prompt");
const axios = require("axios");

const hostsPath =
  process.platform === "win32"
    ? "C:\\Windows\\System32\\drivers\\etc\\hosts"
    : "/etc/hosts";

const githubBlocklistUrl =
  "https://raw.githubusercontent.com/4skinSkywalker/Anti-Porn-HOSTS-File/refs/heads/master/HOSTS.txt";

const markerStart = "# SalamGuard Blocklist Start";
const markerEnd = "# SalamGuard Blocklist End";
const { readJsonFile, writeJsonFile, customUrlsPath } = require("../utils");

const specificUrls = [
  "exampleadultsite.com",
  "0006666.net",
  "pornhub.com",
  "redtube.com",
  "xhamster.com",
  "youporn.com",
  "xvideos.com",
];

const checkBlocklistIntegrity = (callback) => {
  fs.readFile(hostsPath, "utf-8", (err, data) => {
    if (err) {
      console.error("Error reading hosts file:", err);
      return callback(false, { error: "Failed to read hosts file." });
    }

    // console.log("Hosts file content:", data);

    const startFound = data.includes(markerStart);
    const endFound = data.includes(markerEnd);
    const urlsFound = specificUrls.every((url) =>
      data.includes(`127.0.0.1 ${url}`)
    );

    if (startFound && endFound && urlsFound) {
      // Case 3: Comments and specific URLs are there
      callback(true, {
        status: 3,
        message: "✔ Haram content is successfully blocked.",
      });
    } else if (startFound && endFound && !urlsFound) {
      // Case 1: Comments are there, but specific URLs are not
      callback(false, {
        status: 1,
        message: "Blocklist markers exist, but specific URLs are missing.",
      });
    } else if (!startFound && !endFound && urlsFound) {
      // Case 2: Comments are not there, but specific URLs are
      callback(false, {
        status: 2,
        message: "Specific URLs found, but blocklist markers are missing.",
      });
    } else {
      // Case 4: Neither comments nor specific URLs are there
      callback(false, {
        status: 4,
        message: "No blocklist or specific URLs found.",
      });
    }
  });
};

// Fetch blocklist from GitHub
const fetchBlocklistFromGitHub = async () => {
  try {
    const response = await axios.get(githubBlocklistUrl);
    return response.data
      .split("\n")
      .filter(
        (line) =>
          line.trim() && // Ignore empty lines
          !line.startsWith("#") && // Ignore comments
          !line.startsWith("0.0.0.0 target.com") &&
          line.startsWith("0.0.0.0") // Ignore already formatted entries
      )
      .map((line) => line.trim());
  } catch (error) {
    console.error("Failed to fetch blocklist from GitHub:", error);
    return [];
  }
};

// Append blocklist and clean up invalid entries
const appendBlocklist = async (event, callback) => {
  const githubBlocklist = await fetchBlocklistFromGitHub();

  // Ensure "exampleadultsite.com" is included
  if (!githubBlocklist.includes("exampleadultsite.com")) {
    githubBlocklist.push("exampleadultsite.com");
  }

  // Clean up entries: Ignore IPs like 0.0.0.0 and extract only domains
  const cleanedEntries = githubBlocklist
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

  fs.writeFileSync(tempFile, `${markerStart}\n`); // Write start marker to temp file

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
      fs.appendFileSync(tempFile, `${markerEnd}\n`); // Write end marker after all entries
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

// Safely write content to the hosts file using sudo
const writeSafelyToHosts = (
  content,
  callback,
  successMessage = "Hosts file updated successfully."
) => {
  const tempFile = path.join(require("os").tmpdir(), "temp_hosts_update.txt");

  try {
    fs.writeFileSync(tempFile, content);
    console.log("Temporary file created:", tempFile); // Debug log
  } catch (err) {
    console.error("Error writing to temp file:", err);
    return callback(false, "Failed to prepare the updated hosts file.");
  }

  const command = `cp "${tempFile}" "${hostsPath}"`;

  sudo.exec(command, { name: "SalamGuard" }, (error) => {
    fs.unlinkSync(tempFile); // Cleanup temp file
    if (error) {
      console.error("Failed to write to hosts file:", error);
      return callback(false, "Failed to update the hosts file.");
    }
    callback(true, successMessage);
  });
};

// Add a custom URL to the hosts file
const addCustomUrl = (url, callback) => {
  if (!url) {
    console.error("Invalid URL provided.");
    return callback(false, "Invalid URL provided.");
  }

  const cleanDomain = url.replace(/^www\./, "").trim();
  const entries = [`127.0.0.1 ${cleanDomain}`, `127.0.0.1 www.${cleanDomain}`];

  console.log("Adding entries to hosts file:", entries);

  fs.readFile(hostsPath, "utf-8", (err, data) => {
    if (err) {
      console.error("Failed to read the hosts file:", err);
      return callback(false, "Failed to read the hosts file.");
    }

    if (data.includes(`127.0.0.1 ${cleanDomain}`)) {
      console.log("Domain already exists in the hosts file:", cleanDomain);
      return callback(false, "URL already exists in the hosts file.");
    }

    const updatedHosts = `${data.trim()}\n${entries.join("\n")}\n`;

    writeSafelyToHosts(updatedHosts, (success, message) => {
      console.log("Write to hosts file result:", { success, message });
      if (success) {
        updateCustomUrls(cleanDomain, callback); // Add this!
      } else {
        callback(false, "Failed to update hosts file.");
      }
    });
  });
};

const updateCustomUrls = (url, callback) => {
  const customUrls = readJsonFile(customUrlsPath);

  console.log("Before updating custom URLs:", customUrls);

  if (!customUrls.includes(url)) {
    customUrls.push(url);
    console.log("Adding URL to customUrls.json:", url);
    writeJsonFile(customUrlsPath, customUrls);
  } else {
    console.log("URL already exists in customUrls.json:", url);
  }

  callback(true, "Custom URL added successfully.");
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
  addCustomUrl,
  checkBlocklistIntegrity,
  removeCustomUrl,
  blockPresetUrls: (callback) => appendBlocklist(readBlocklist(), callback),
  appendBlocklist,
};
