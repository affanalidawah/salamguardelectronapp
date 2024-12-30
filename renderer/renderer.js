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
  function renderBlockSection(isBlocked, message, buttonId, buttonText) {
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
          <button id="${buttonId}">${buttonText}</button>
        </div>`;

      document.getElementById(buttonId)?.addEventListener("click", () => {
        showModal(
          "Blocking haram content... Please enter your password.",
          true
        );
        window.electron.blockHaramContent();
      });
    }
  }

  // Update UI based on state
  function updateUI() {
    if (isHaramBlocked) {
      renderBlockSection(true, "Haram content is blocked on this computer.");
    } else {
      renderBlockSection(
        false,
        "Block Haram Content",
        "block-haram",
        "Block Haram Content"
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

    // Force UI update on initialization
    updateUI();
  });

  // Check Blocklist Integrity
  window.electron.checkBlocklistIntegrity();
  window.electron.onBlocklistIntegrityStatus((isValid, result) => {
    console.log("Blocklist integrity check triggered:");
    console.log("Is valid:", isValid);
    console.log("Result:", result);
    console.log("Result status:", result.status);

    const blockSection = document.getElementById("block-section");

    // Handle cases based on result status
    if (result.status === 3) {
      // Case 3: Blocklist markers and specific URLs are present
      isHaramBlocked = true; // Update state
      blockSection.innerHTML = `
        <div class="success-message">
          <span class="checkmark">✔</span>
          <h2>${result.message}</h2>
          <button id="undo-blocklist">Undo Blocking</button>
        </div>`;

      document
        .getElementById("undo-blocklist")
        ?.addEventListener("click", () => {
          showModal("Undoing blocklist...");
          window.electron.undoBlocklist();
        });
    } else {
      // Reset state for all other cases (statuses 1, 2, or 4)
      isHaramBlocked = false;

      if (result.status === 1 || result.status === 2) {
        // Case 1 or 2: Rewrite hosts file
        blockSection.innerHTML = `
          <div class="warning-message">
            <h2>${result.message}</h2>
            <button id="rewrite-blocklist">Rewrite Hosts File</button>
          </div>`;

        document
          .getElementById("rewrite-blocklist")
          ?.addEventListener("click", () => {
            showModal("Rewriting hosts file...");
            window.electron.rewriteHosts();
          });
      } else if (result.status === 4) {
        // Case 4: No blocklist or URLs found
        blockSection.innerHTML = `
          <h2>${result.message}</h2>
          <button id="block-haram">Block Haram Content</button>`;

        document
          .getElementById("block-haram")
          ?.addEventListener("click", () => {
            showModal(
              "Blocking haram content... Please enter your password.",
              true
            );
            window.electron.blockHaramContent();
          });
      }
    }

    // Ensure the UI reflects the current state
    console.log("isHaramBlocked state:", isHaramBlocked);
    updateUI();
  });

  // Initialize App
  refreshCustomList();
});
