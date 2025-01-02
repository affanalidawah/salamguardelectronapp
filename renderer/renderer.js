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
  let isLoading = false;

  function showModal(message, showProgress = false, hideCloseButton = false) {
    isLoading = true; // Set loading state to true
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

    // Control the visibility of the close button
    if (hideCloseButton) {
      modalClose.classList.add("hidden");
    } else {
      modalClose.classList.remove("hidden");
    }

    modal.classList.remove("hidden");
  }

  const closeModal = () => {
    isLoading = false; // Set loading state to false
    modal.classList.add("hidden");
    modal.classList.remove("show-progress");
  };

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
        message || "Haram content is not blocked on this computer.",
        action || {
          buttonId: "block-haram",
          buttonText: "Block Haram Content",
          onClick: () => {
            showModal(
              "Blocking haram content... Please enter your password.",
              true,
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
  window.electron.onBlocklistSuccess((message) => {
    console.log("Blocklist append success received. Message:", message);

    // Show progress modal while rechecking
    showModal("Rescanning your computer...", true, true);

    // Trigger integrity check
    window.electron.checkBlocklistIntegrity();

    // Handle integrity check result
    window.electron.onBlocklistIntegrityStatus((isValid, result) => {
      console.log("Blocklist integrity status after appending:", result);

      const statusMessage =
        result.status === 3
          ? "✔ Successfully blocked over 80,000 websites."
          : "❌ Blocklist update incomplete.";

      // Update UI before showing modal
      updateUI(result.status === 3, result.message || statusMessage);

      // Show modal after updating the UI
      showModal(statusMessage, false);
    });
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
          showModal("Your computer is now protected.");
        } else {
          isHaramBlocked = false; // Update state to unblocked
          showModal(
            "❌ Error: We were unable to secure your computer. Please try again or contact us for help."
          );
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

  const setLoadingState = (isLoading) => {
    const loadingIndicator = document.getElementById("loading-indicator");
    if (isLoading) {
      loadingIndicator.classList.remove("hidden");
    } else {
      loadingIndicator.classList.add("hidden");
    }
  };

  // Check Blocklist Integrity
  window.electron.checkBlocklistIntegrity();
  window.electron.onBlocklistIntegrityStatus((isValid, result) => {
    console.log("Blocklist integrity check triggered:");
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
        closeModal(); // Ensure modal closes after UI is updated
        console.log("Mission Success! Case 3");
        break;
      case 1:
        // Case 1: Blocklist needs rewriting
        isHaramBlocked = false;
        updateUI(false, message, {
          buttonId: "rewrite-blocklist",
          buttonText: "Update Blocklist",
          onClick: async () => {
            showModal("Blocking more sites... please wait", true, true);
            try {
              const response = await updateHostsFile();
              showModal("✔ Successfully updated blocklist.", false);
              updateUI(
                true,
                response.message || "Blocklist updated successfully."
              );
            } catch (error) {
              showModal(`❌ Error: ${error.message}`, false);
            } finally {
              closeModal();
            }
          },
        });
        console.log("We need to rewrite hosts!");
        break;
      case 2:
        isHaramBlocked = false; // Blocklist needs rewriting
        updateUI(false, message, {
          buttonId: "rewrite-blocklist",
          buttonText: "Update Blocklist",
          onClick: async () => {
            setLoadingState(true); // Show loading indicator

            try {
              const response = await rewriteHostsFile(true); // Perform async operation
              updateUI(
                true,
                response.message || "Blocklist updated successfully."
              );
            } catch (error) {
              updateUI(false, `Error: ${error.message}`);
            } finally {
              setLoadingState(false); // Hide loading indicator
            }
          },
        });
        console.log("We need to rewrite hosts!");
        break;
      default:
        // Default case: No protection
        isHaramBlocked = false;
        updateUI(false, "Haram content is not blocked on this computer.", {
          buttonId: "block-haram",
          buttonText: "Block Haram Content",
          onClick: async () => {
            showModal(
              "Blocking haram content... Please enter your password.",
              true,
              true
            );
            try {
              const response = await window.electron.blockHaramContent();
              showModal("✔ Successfully blocked haram content.", false);
              updateUI(
                true,
                response.message || "Blocklist updated successfully."
              );
            } catch (error) {
              showModal(`❌ Error: ${error.message}`, false);
            } finally {
              closeModal();
            }
          },
        });
        break;
    }

    console.log("isHaramBlocked state:", isHaramBlocked);
  });
  async function rewriteHostsFile(preserveUrls) {
    try {
      const BLOCKLIST_START = "# SalamGuard Blocklist Start";
      const BLOCKLIST_END = "# SalamGuard Blocklist End";
      const CORRECT_FORMAT_PREFIX = "127.0.0.1";

      let newHostsContent;

      if (preserveUrls) {
        const currentHostsContent = await getHostsContent();
        const currentHosts = currentHostsContent
          .split("\n")
          .map((line) => line.trim());

        const blocklistUrls = await fetchAndDisplayBlocklist();

        const blocklistDomains = new Set(
          blocklistUrls
            .map((line) => {
              const parts = line.split(/\s+/);
              return parts.length > 1 ? parts[1] : null;
            })
            .filter(Boolean)
        );

        const expandedBlocklistUrls = new Set();
        const existingBlocklistUrls = new Set(
          currentHosts
            .filter((line) => line.startsWith(CORRECT_FORMAT_PREFIX))
            .map((line) => {
              const parts = line.split(/\s+/);
              return parts.length > 1 ? parts[1] : null;
            })
            .filter(Boolean)
        );

        const normalizeDomain = (domain) => domain.replace(/^www\./, "");

        blocklistDomains.forEach((domain) => {
          if (!domain) return;

          const normalizedDomain = normalizeDomain(domain);
          const wwwDomain = `www.${normalizedDomain}`;

          if (!existingBlocklistUrls.has(normalizedDomain)) {
            expandedBlocklistUrls.add(
              `${CORRECT_FORMAT_PREFIX} ${normalizedDomain}`
            );
          }
          if (!existingBlocklistUrls.has(wwwDomain)) {
            expandedBlocklistUrls.add(`${CORRECT_FORMAT_PREFIX} ${wwwDomain}`);
          }
        });

        const nonBlocklistUrls = [];
        currentHosts.forEach((line) => {
          const normalizedLine = line.replace(/\s+/g, " ").trim();
          const [ip, domain] = normalizedLine.split(" ");

          if (!domain || normalizedLine.startsWith("#")) {
            nonBlocklistUrls.push(line);
          } else if (
            blocklistDomains.has(domain) ||
            blocklistDomains.has(normalizeDomain(domain))
          ) {
            // Skip existing blocklist entries
          } else {
            nonBlocklistUrls.push(line);
          }
        });

        const blocklistSection = [
          BLOCKLIST_START,
          ...Array.from(expandedBlocklistUrls),
          BLOCKLIST_END,
        ].join("\n");

        newHostsContent = [...nonBlocklistUrls, blocklistSection].join("\n");
      } else {
        const blocklistUrls = await fetchAndDisplayBlocklist();
        const blocklistSection = [
          BLOCKLIST_START,
          ...blocklistUrls.map(
            (line) => `${CORRECT_FORMAT_PREFIX} ${line.replace(/^www\\./, "")}`
          ),
          BLOCKLIST_END,
        ].join("\n");

        newHostsContent = blocklistSection;
      }

      // Send the new hosts content to the IPC handler
      return new Promise((resolve, reject) => {
        window.electron.rewriteHosts(newHostsContent, (success, response) => {
          if (success) {
            resolve(response);
          } else {
            reject(
              new Error(response.message || "Failed to rewrite hosts file.")
            );
          }
        });
      });
    } catch (error) {
      console.error("Error in rewriteHostsFile:", error);
      throw new Error("Failed to rewrite the hosts file.");
    }
  }

  async function updateHostsFile() {
    const BLOCKLIST_START = "# SalamGuard Blocklist Start";
    const BLOCKLIST_END = "# SalamGuard Blocklist End";
    const CORRECT_FORMAT_PREFIX = "127.0.0.1";

    const normalizeDomain = (domain) => domain.replace(/^www\./, "");

    try {
      // Fetch current hosts file content
      const currentHostsContent = await getHostsContent();
      const currentHosts = currentHostsContent
        .split("\n")
        .map((line) => line.trim());

      // Fetch updated blocklist
      const blocklistUrls = await fetchAndDisplayBlocklist();
      const blocklistDomains = new Set(
        blocklistUrls
          .map((line) => {
            const parts = line.split(/\s+/);
            return parts.length > 1 ? parts[1] : null; // Extract domain
          })
          .filter(Boolean) // Remove null/undefined entries
      );

      // Extract existing blocklist section
      const existingBlocklistStartIndex = currentHosts.indexOf(BLOCKLIST_START);
      const existingBlocklistEndIndex = currentHosts.indexOf(BLOCKLIST_END);

      let existingBlocklist = new Set();
      if (
        existingBlocklistStartIndex !== -1 &&
        existingBlocklistEndIndex !== -1
      ) {
        for (
          let i = existingBlocklistStartIndex + 1;
          i < existingBlocklistEndIndex;
          i++
        ) {
          const parts = currentHosts[i].split(/\s+/);
          if (parts.length > 1) existingBlocklist.add(parts[1]); // Extract domain
        }
      }

      // Merge blocklist: Add only new domains
      const updatedBlocklist = new Set([...existingBlocklist]);
      blocklistDomains.forEach((domain) => {
        const normalizedDomain = normalizeDomain(domain);
        const wwwDomain = `www.${normalizedDomain}`;

        // Add both "www." and non-"www." versions if they are not already present
        if (!updatedBlocklist.has(normalizedDomain)) {
          updatedBlocklist.add(normalizedDomain);
        }
        if (!updatedBlocklist.has(wwwDomain)) {
          updatedBlocklist.add(wwwDomain);
        }
      });

      // Format blocklist for hosts file
      const blocklistSection = [
        BLOCKLIST_START,
        ...Array.from(updatedBlocklist).map(
          (domain) => `${CORRECT_FORMAT_PREFIX} ${domain}`
        ),
        BLOCKLIST_END,
      ];

      // Rebuild hosts file
      const nonBlocklistLines = currentHosts.filter(
        (line, index) =>
          index < existingBlocklistStartIndex ||
          index > existingBlocklistEndIndex
      );
      const newHostsContent = [...nonBlocklistLines, ...blocklistSection].join(
        "\n"
      );

      return await new Promise((resolve, reject) => {
        window.electron.rewriteHosts(newHostsContent, (success, response) => {
          if (success) {
            resolve(response);
          } else {
            reject(
              new Error(response.message || "Failed to rewrite hosts file.")
            );
          }
        });
      });
    } catch (error) {
      console.error("Error in updateHostsFile:", error);
      throw new Error("Failed to rewrite the hosts file.");
    }
  }

  // Initialize App
  refreshCustomList();
});
