const fs = require("fs");
const path = require("path");
const sudo = require("sudo-prompt");
const axios = require("axios");

const githubBlocklistUrl =
  "https://raw.githubusercontent.com/4skinSkywalker/Anti-Porn-HOSTS-File/refs/heads/master/HOSTS.txt";

const markerStart = "# SalamGuard Blocklist Start";
const markerEnd = "# SalamGuard Blocklist End";
const {
  readJsonFile,
  writeJsonFile,
  customUrlsPath,
  hostsPath,
} = require("../utils");

const specificUrls = [
  "exampleadultsite.com",
  "0006666.net",
  "pornhub.com",
  "redtube.com",
  "xhamster.com",
  "youporn.com",
  "xvideos.com",
];

const checkBlocklistIntegrity = async (callback) => {
  try {
    const blocklist = await fetchBlocklistFromGitHub();

    // Normalize blocklist domains
    const normalizedBlocklist = new Set(
      blocklist
        .filter((entry) => entry && typeof entry === "string") // Remove undefined or non-string entries
        .map((entry) =>
          entry
            .split(/\s+/)[1]
            ?.replace(/^www\./, "")
            .trim()
        )
        .filter(Boolean) // Remove any undefined results from split/map
    );

    // read hosts
    fs.readFile(hostsPath, "utf-8", (err, data) => {
      if (err) {
        console.error("Error reading hosts file:", err);
        return callback(false, { error: "Failed to read hosts file." });
      }

      const startFound = data.includes(markerStart);
      const endFound = data.includes(markerEnd);
      // Split data into lines and trim whitespace
      const dataLines = data
        .split("\n")
        .map((line) => line.replace(/\s+/g, " ").trim());

      // Collect existing hosts entries (normalized)
      const normalizedHostsEntries = new Set(
        dataLines
          .filter((line) => line.startsWith("127.0.0.1"))
          .flatMap((line) => {
            const [_, domain] = line.split(" ");
            return domain.startsWith("www.")
              ? [domain.replace(/^www\./, ""), domain]
              : [domain, `www.${domain}`];
          })
      );

      // Check if all blocklist domains are present and log missing ones
      const missingDomains = [...normalizedBlocklist].flatMap((domain) => {
        const wwwDomain = domain.startsWith("www.") ? domain : `www.${domain}`;
        const nonWwwDomain = domain.replace(/^www\./, "");
        const missing = [];

        // Check both "www." and non-"www." versions
        if (!normalizedHostsEntries.has(nonWwwDomain))
          missing.push(nonWwwDomain);
        if (!normalizedHostsEntries.has(wwwDomain)) missing.push(wwwDomain);

        return missing;
      });

      if (missingDomains.length > 0) {
        console.log("The following domains are missing in the hosts file:");
        missingDomains.forEach((domain) => console.log(domain));
      } else {
        console.log("All blocklist domains are present in the hosts file.");
      }

      // Determine if all URLs are found
      const allUrlsFound = missingDomains.length === 0;

      const urlsFound = specificUrls.every((url) => {
        const entry1 = `127.0.0.1 ${url}`;
        const entry2 = `0.0.0.0 ${url}`;

        // Check each line for an exact match
        const found = dataLines.some(
          (line) => line === entry1 || line === entry2
        );

        return found;
      });

      if (startFound && endFound && allUrlsFound) {
        // Case 3: Comments and specific URLs are there
        callback(true, {
          status: 3,
          message: "Haram content is successfully blocked.",
        });
      } else if (startFound && endFound && !allUrlsFound) {
        // Case 1: Comments are there, but specific URLs are not
        console.log("Blocklist markers exist, but update is needed.");
        callback(false, {
          status: 1,
          message: "Your Blocklist needs an update.",
        });
      } else if (!startFound && !endFound && urlsFound) {
        // Case 2: Comments are not there, but specific URLs are
        console.log("Specific URLs found, but blocklist markers are missing.");
        callback(false, {
          status: 2,
          message: "Your Blocklist needs patching.",
        });
      } else if (!startFound && !endFound && !urlsFound) {
        // Case 4: Neither comments nor specific URLs are there
        console.log("No blocklist or specific URLs found.");
        callback(false, {
          status: 4,
          message: "Your computer is unprotected.",
        });
      }
    });
  } catch (error) {
    console.error("Failed to check blocklist integrity:", error);
    callback(false, { error: "Error fetching or processing blocklist." });
  }
};

// Fetch blocklist from GitHub
const fetchBlocklistFromGitHub = async () => {
  try {
    const response = await axios.get(githubBlocklistUrl);
    const listarray = response.data
      .split("\n")
      .filter(
        (line) =>
          line.trim() && // Ignore empty lines
          !line.startsWith("#") && // Ignore comments
          !line.startsWith("0.0.0.0    target.com") &&
          line.startsWith("0.0.0.0") // Ignore already formatted entries
      )
      .map((line) => line.trim());
    listarray.push("exampleadultsite.com");
    return listarray;
  } catch (error) {
    console.error("Failed to fetch blocklist from GitHub:", error);
    return [];
  }
};

const appendBlocklist = async (event, callback) => {
  const githubBlocklist = await fetchBlocklistFromGitHub();

  if (!githubBlocklist.includes("exampleadultsite.com")) {
    githubBlocklist.push("exampleadultsite.com");
  }

  const cleanedEntries = githubBlocklist
    .map((line) => {
      const parts = line.split(/\s+/); // Split line by spaces
      if (parts.length === 2) return parts[1]; // If "0.0.0.0 domain.com", get the domain
      return parts[0]; // If only "domain.com", return as is
    })
    .filter((domain) => domain && !domain.startsWith("0.0.0.0")); // Exclude empty and invalid entries

  if (cleanedEntries.length === 0) {
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

    if (currentBatch * batchSize < totalEntries) {
      setImmediate(writeBatch);
    } else {
      fs.appendFileSync(tempFile, `${markerEnd}\n`); // Write end marker after all entries
      executeAppendCommand(tempFile, callback, event);
    }
  };

  writeBatch();
};

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
      if (event && event.sender) {
        event.sender.send("blocklist-error", "Failed to append blocklist.");
      }
      return callback(false, "Failed to append blocklist.");
    }
    callback(true, "Blocklist appended successfully.");
  });
};

// Safely write content to the hosts file using sudo
const writeSafelyToHosts = (
  content,
  callback,
  successMessage = "Hosts file updated successfully."
) => {
  if (typeof content !== "string") {
    console.error("Invalid content provided to writeSafelyToHosts:", content);
    return callback(false, "Invalid content provided.");
  }

  const tempFile = path.join(require("os").tmpdir(), "temp_hosts_update.txt");

  try {
    fs.writeFileSync(tempFile, content);
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
  fetchBlocklistFromGitHub,
  writeSafelyToHosts,
};
