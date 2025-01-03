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

  const BLOCKLIST_START = "# SalamGuard Blocklist Start";
  const BLOCKLIST_END = "# SalamGuard Blocklist End";
  const CORRECT_FORMAT_PREFIX = "127.0.0.1";

  let isHaramBlocked = false;
  let modalProgressBar;

  // fetch data

  window.electron.checkBlocklistIntegrity();

  window.electron.onUpdateCustomList(renderCustomUrls);

  window.electron.receiveInitialConfig((config) => {
    isHaramBlocked = config.haramBlocked;
  });

  async function getHostsContent() {
    try {
      const hostsContent = await window.electron.readHostsFile();
      return hostsContent;
    } catch (error) {
      console.error("Failed to read hosts file:", error);
      throw error;
    }
  }

  async function fetchAndDisplayBlocklist() {
    try {
      const blocklist = await window.electron.getBlocklistUrls();
      return blocklist;
    } catch (error) {
      console.error("Failed to fetch blocklist:", error);
      throw error;
    }
  }

  // ui

  function showModal(message, showProgress = false, hideCloseButton = false) {
    console.log("showModal called with message:", message);
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

    if (hideCloseButton) {
      modalClose.classList.add("hidden");
    } else {
      modalClose.classList.remove("hidden");
    }
    modal.classList.remove("hidden");
  }

  const closeModal = () => {
    modal.classList.add("hidden");
    modal.classList.remove("show-progress");
  };

  // Event: Close Modal
  modalClose.addEventListener("click", () => {
    modal.classList.add("hidden");
    modalProgressBar?.classList.add("hidden");
  });

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

  function updateUI(isBlocked = isHaramBlocked, message = "", action = null) {
    console.log("updateUI called with:", { isBlocked, message, action });
    if (isBlocked) {
      renderBlockSection(true, message || "Your computer is protected.");
    } else {
      renderBlockSection(
        false,
        message || "Your computer is unprotected.",
        action || {
          buttonId: "block-haram",
          buttonText: "Block Haram Content",
          onClick: () => {
            showModal(
              "Blocking haram content... Please enter your password and wait a moment.",
              true,
              true
            );
            window.electron.blockHaramContent();
          },
        }
      );
    }
  }

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

  window.electron.onBlocklistError((error) => {
    modalMessage.textContent = error;
    modalProgressBar?.classList.add("hidden");
  });

  window.electron.onBlockHaramSuccess((response) => {
    if (response.success) {
      window.electron.checkBlocklistIntegrity();
      window.electron.onBlocklistIntegrityStatus((isValid, result) => {
        if (result.status === 3) {
          isHaramBlocked = true;
          modal.classList.add("hidden");
          showModal("Your computer is now protected.");
        } else {
          isHaramBlocked = false;
          modal.classList.add("hidden");
          showModal(
            "❌ Error: There was a problem. Please make sure you are connected to the internet and try again. Feel free to email us for help."
          );
        }

        updateUI();
      });
    } else {
      modal.classList.add("hidden");
      showModal(`❌ Error: ${response.message}`);
    }
  });

  // Check Blocklist Integrity
  window.electron.onBlocklistIntegrityStatus((isValid, result) => {
    const defaultMessage = "An issue was detected.";
    const message = result?.message || defaultMessage;

    switch (result?.status) {
      case 3: // Blocklist markers and specific URLs are present
        isHaramBlocked = true;
        updateUI(true, message);
        closeModal();
        break;
      case 1: // Case 1: Blocklist needs rewriting
        isHaramBlocked = false;
        updateUI(false, message, {
          buttonId: "rewrite-blocklist",
          buttonText: "Update Blocklist",
          onClick: async () => {
            showModal(
              "Blocking more sites... please enter your password and wait",
              true,
              true
            );
            try {
              const response = await updateHostsFile();
            } catch (error) {
              showModal(`❌ Error: ${error.message}`, false);
            }
          },
        });
        break;
      case 2: // Blocklist needs rewriting
        isHaramBlocked = false;
        updateUI(false, message, {
          buttonId: "rewrite-blocklist",
          buttonText: "Update Blocklist",
          onClick: async () => {
            showModal(
              "Patching your security... please enter your password and wait",
              true,
              true
            );
            try {
              const response = await rewriteHostsFile(true);
            } catch (error) {
              updateUI(false, `Error: ${error.message}`);
            }
          },
        });
        break;
      default: // Default case: No protection
        isHaramBlocked = false;
        updateUI(false, "Your computer is not protected from Haram Content.", {
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
            } catch (error) {
              const errorMessage =
                (error && error.message) || "An unexpected error occurred.";
              showModal(`❌ Error case default: ${errorMessage}`, false);
              console.log(error, error.message);
            }
          },
        });
        break;
    }
  });

  async function rewriteHostsFile(preserveUrls) {
    try {
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
