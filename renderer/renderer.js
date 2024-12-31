document.addEventListener("DOMContentLoaded", () => {
  // DOM Elements
  const blockButton = document.getElementById("block-haram");
  const addButton = document.getElementById("add-url");
  const customList = document.getElementById("custom-list");
  const customUrlInput = document.getElementById("custom-url");
  const blockSection = document.getElementById("block-section");
  const modal = document.getElementById("modal");
  const modalMessage = document.getElementById("modal-message");
  const modalClose = document.getElementById("modal-close");

  async function getHostsContent() {
    try {
      const hostsContent = await window.electron.readHostsFile();
      // console.log("Hosts File Content:", hostsContent);
      console.log("Type of currentHosts:", typeof hostsContent);
      console.log("currentHosts content:", hostsContent);
      return hostsContent; // Return the content for use elsewhere
    } catch (error) {
      console.error("Failed to read hosts file:", error);
      throw error; // Rethrow error if needed
    }
  }

  async function fetchAndDisplayBlocklist() {
    try {
      const blocklist = await window.electron.getBlocklistUrls();
      console.log("Fetched Blocklist:", blocklist);
      return blocklist;
      // You can now use this blocklist in your app
    } catch (error) {
      console.error("Failed to fetch blocklist:", error);
      throw error;
    }
  }

  window.electron.onRewriteHostsResult((success, message) => {
    if (success) {
      console.log("Hosts file successfully rewritten.");
      showModal("✔ Successfully updated the hosts file.", false); // Reflect success
    } else {
      console.error("Failed to update hosts file:", message);
      showModal(`❌ Failed to update the hosts file. ${message}`, false); // Reflect failure
    }
  });

  // State Variables
  let isHaramBlocked = false;
  let modalProgressBar;

  // Utility: Show Modal Notification with Progress Bar Option
  function showModal(message, showProgress = false) {
    modalMessage.textContent = message;
    if (showProgress) {
      if (!modalProgressBar) {
        modalProgressBar = document.createElement("progress");
        modalProgressBar.id = "modal-progress-bar";
        modalProgressBar.value = 0;
        modalProgressBar.max = 100;
        modalMessage.insertAdjacentElement("afterend", modalProgressBar);
      }
      modalProgressBar.classList.remove("hidden");
    } else {
      modalProgressBar?.classList.add("hidden");
    }
    modal.classList.remove("hidden");
  }

  // Utility: Update Progress Bar
  function updateProgressBar(current, total) {
    if (modalProgressBar) {
      modalProgressBar.value = Math.round((current / total) * 100);
    }
  }

  // Utility: Render Block Section
  function renderBlockSection(isBlocked, message, action = null) {
    if (isBlocked) {
      blockSection.innerHTML = `
          <div class="success-message">
              <span class="icon">✔</span>
              <h2>${message}</h2>
          </div>`;
    } else {
      blockSection.innerHTML = `
          <div class="error-message">
              <span class="icon">❌</span>
              <h2>${message}</h2>
              ${
                action
                  ? `<button id="${action.buttonId}">${action.buttonText}</button>`
                  : ""
              }
          </div>`;

      if (action) {
        document
          .getElementById(action.buttonId)
          ?.addEventListener("click", action.onClick);
      }
    }
  }

  // Consolidated UI update function
  function updateUI(isBlocked = isHaramBlocked, message = "", action = null) {
    console.log("updateUI() triggered with message:", message);
    if (isBlocked) {
      renderBlockSection(
        true,
        message || "Haram content is blocked on this computer."
      );
    } else {
      renderBlockSection(
        false,
        message || "Block Haram Content",
        action || {
          buttonId: "block-haram",
          buttonText: "Block Haram Content",
          onClick: () => {
            showModal(
              "Blocking haram content... Please enter your password.",
              true
            );
            window.electron.blockHaramContent();
          },
        }
      );
    }
  }

  // Event: Close Modal
  modalClose.addEventListener("click", () => {
    modal.classList.add("hidden");
    modalProgressBar?.classList.add("hidden");
  });

  // Validate URL
  function validateDomain(domain) {
    const domainRegex = /^(?!:\/\/)(www\.)?[a-zA-Z0-9-]+(\.[a-zA-Z]{2,})+$/;
    return domainRegex.test(domain);
  }

  // Render Custom URL List
  function renderCustomUrls(customUrls) {
    const uniqueDomains = [
      ...new Set(customUrls.map((url) => url.replace(/^www\./, ""))),
    ];
    customList.innerHTML = uniqueDomains.length
      ? uniqueDomains
          .map(
            (url) => `
              <li>
                ${url} <button class="remove-url" data-url="${url}">Remove</button>
              </li>`
          )
          .join("")
      : "<p>No custom URLs added yet.</p>";
  }

  // Refresh Custom URL List
  function refreshCustomList() {
    window.electron.getCustomList();
  }

  // Event: Add Custom URL
  addButton?.addEventListener("click", () => {
    const domain = customUrlInput.value.trim();
    if (!validateDomain(domain)) {
      showModal(
        "❌ Please enter a valid domain in the correct format (e.g., youtube.com).",
        false
      );
      return;
    }
    window.electron.addCustomUrl(domain);
    customUrlInput.value = "";
  });

  // Event: Remove Custom URL (Event Delegation)
  customList?.addEventListener("click", (e) => {
    if (e.target.classList.contains("remove-url")) {
      const url = e.target.dataset.url;
      window.electron.removeCustomUrl(url, (success, updatedUrls) => {
        if (success) {
          renderCustomUrls(updatedUrls);
        } else {
          showModal("❌ Failed to remove the URL. Please try again.", false);
        }
      });
    }
  });

  // Electron IPC Handlers
  window.electron.onUpdateProgress(updateProgressBar);
  window.electron.onBlocklistSuccess((message) => {
    modalMessage.textContent = message;
    modalProgressBar?.classList.add("hidden");
  });
  window.electron.onBlocklistError((error) => {
    modalMessage.textContent = error;
    modalProgressBar?.classList.add("hidden");
  });
  window.electron.onBlockHaramSuccess((response) => {
    console.log("BlockHaramSuccess triggered. Response:", response);
    modal.classList.add("hidden");

    if (response.success) {
      console.log("Blocking succeeded. Rechecking blocklist integrity...");

      // Recheck the blocklist integrity and update state immediately
      window.electron.checkBlocklistIntegrity();

      window.electron.onBlocklistIntegrityStatus((isValid, result) => {
        console.log("Blocklist integrity status after blocking:", result);

        if (result.status === 3) {
          isHaramBlocked = true; // Update state to blocked
          showModal("✔ Successfully blocked over 80,000 websites.");
        } else {
          isHaramBlocked = false; // Update state to unblocked
          showModal("❌ Error: Blocklist integrity check failed.");
        }

        updateUI(); // Reflect the new state in the UI
      });
    } else {
      showModal(`❌ Error: ${response.message}`);
    }
  });

  // Keep the custom list rendering and initial config handling as is
  window.electron.onUpdateCustomList(renderCustomUrls);

  window.electron.receiveInitialConfig((config) => {
    console.log("Received initial config:", config);

    isHaramBlocked = config.haramBlocked;
  });

  // Check Blocklist Integrity
  window.electron.checkBlocklistIntegrity();
  window.electron.onBlocklistIntegrityStatus((isValid, result) => {
    console.log("Blocklist integrity check triggered:");
    console.log("Is valid:", isValid);
    console.log("Result object:", JSON.stringify(result, null, 2));

    // Default fallback message
    const defaultMessage =
      "An issue was detected. Please update the blocklist.";
    const message = result?.message || defaultMessage;

    // Update the state based on result status
    switch (result?.status) {
      case 3:
        isHaramBlocked = true; // Blocklist markers and specific URLs are present
        updateUI(true, message);
        console.log("Mission Success!");
        break;
      case 1:
      case 2:
        isHaramBlocked = false; // Blocklist needs rewriting
        updateUI(false, message, {
          buttonId: "rewrite-blocklist",
          buttonText: "Update Required",
          onClick: () => {
            showModal("Blocking sites... please wait", true);
            rewriteHostsFile(true); // Pass flag to preserve specific URLs
          },
        });
        console.log("We need to rewrite hosts!");
        break;
      default:
        isHaramBlocked = false; // Default case
        updateUI(false, "Block Haram Content", {
          buttonId: "block-haram",
          buttonText: "Block Haram Content",
          onClick: () => {
            showModal(
              "Blocking haram content... please enter your password.",
              true
            );
            window.electron.blockHaramContent();
          },
        });
        break;
    }

    console.log("isHaramBlocked state:", isHaramBlocked);
  });

  async function rewriteHostsFile(preserveUrls) {
    const BLOCKLIST_START = "# SalamGuard Blocklist Start";
    const BLOCKLIST_END = "# SalamGuard Blocklist End";
    const CORRECT_FORMAT_PREFIX = "127.0.0.1";

    if (preserveUrls) {
      const currentHostsContent = await getHostsContent();
      const currentHosts = currentHostsContent
        .split("\n")
        .map((line) => line.trim());
      console.log("currentHosts array:", currentHosts);

      const blocklistUrls = await fetchAndDisplayBlocklist();
      console.log("blocklistUrls", blocklistUrls);

      // Extract domains from blocklist, filtering out invalid lines
      const blocklistDomains = new Set(
        blocklistUrls
          .map((line) => {
            const parts = line.split(/\s+/);
            return parts.length > 1 ? parts[1] : null; // Extract domain if it exists
          })
          .filter(Boolean) // Remove null/undefined entries
      );

      // Initialize sets for new blocklist and existing blocklist entries
      const expandedBlocklistUrls = new Set();
      const existingBlocklistUrls = new Set(
        currentHosts
          .filter((line) => line.startsWith(CORRECT_FORMAT_PREFIX))
          .map((line) => {
            const parts = line.split(/\s+/);
            return parts.length > 1 ? parts[1] : null;
          })
          .filter(Boolean) // Remove null/undefined entries
      );

      // Normalize domain function
      const normalizeDomain = (domain) => domain.replace(/^www\./, "");

      // Process blocklist domains
      blocklistDomains.forEach((domain) => {
        if (!domain) return; // Skip invalid domains

        const normalizedDomain = normalizeDomain(domain);
        const wwwDomain = `www.${normalizedDomain}`;

        // Ensure target.com and www.target.com are not added
        if (
          normalizedDomain === "target.com" ||
          wwwDomain === "www.target.com"
        ) {
          console.log(`Skipping target.com to avoid accidental blocking.`);
          return;
        }

        // Add only if neither version is in the existing blocklist
        if (
          !existingBlocklistUrls.has(normalizedDomain) &&
          !existingBlocklistUrls.has(wwwDomain)
        ) {
          expandedBlocklistUrls.add(
            `${CORRECT_FORMAT_PREFIX} ${normalizedDomain}`
          );
          expandedBlocklistUrls.add(`${CORRECT_FORMAT_PREFIX} ${wwwDomain}`);
        }
      });

      // Separate existing hosts into non-blocklist and blocklist categories
      const nonBlocklistUrls = [];
      currentHosts.forEach((line) => {
        const normalizedLine = line.replace(/\s+/g, " ").trim();
        const [ip, domain] = normalizedLine.split(" ");

        if (!domain || normalizedLine.startsWith("#")) {
          // Preserve comments or empty lines
          nonBlocklistUrls.push(line);
        } else if (
          blocklistDomains.has(domain) ||
          blocklistDomains.has(normalizeDomain(domain))
        ) {
          // Skip existing blocklist entries
        } else {
          // Preserve non-blocklist entries
          nonBlocklistUrls.push(line);
        }
      });

      // Combine blocklist entries into the correct format
      const blocklistSection = [
        BLOCKLIST_START,
        ...Array.from(expandedBlocklistUrls),
        BLOCKLIST_END,
      ].join("\n");

      // Write the new hosts file content
      const newHostsContent = [
        ...nonBlocklistUrls, // Retain preserved non-blocklist entries
        blocklistSection, // Add the new blocklist section
      ].join("\n");

      window.electron.rewriteHosts(newHostsContent); // Send to backend
      console.log(
        "Hosts file rewritten with blocklist demarcated, corrected, and cleaned."
      );
      updateUI(true);
    } else {
      // Only write the blocklist section with proper formatting
      const blocklistContent = [
        BLOCKLIST_START,
        ...window.electron.getBlocklistUrls(),
        BLOCKLIST_END,
      ].join("\n");
      window.electron.rewriteHostsFile(blocklistContent);
      console.log("Hosts file rewritten with only the blocklist section.");
    }
  }

  // Initialize App
  refreshCustomList();
});
