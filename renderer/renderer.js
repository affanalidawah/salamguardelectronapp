document.addEventListener("DOMContentLoaded", () => {
  // DOM Elements
  const blockButton = document.getElementById("block-haram");
  const addButton = document.getElementById("add-url");
  const setupButton = document.getElementById("setup-permissions");
  const setupStatus = document.getElementById("setup-status");
  const customList = document.getElementById("custom-list");
  const customUrlInput = document.getElementById("custom-url");
  const blockSection = document.getElementById("block-section");
  const modal = document.getElementById("modal");
  const modalMessage = document.getElementById("modal-message");
  const modalClose = document.getElementById("modal-close");
  const undoButton = document.getElementById("undo-blocklist");

  // Progress bar elements
  let modalProgressBar;

  // Event: Undo Blocklist
  undoButton?.addEventListener("click", () => {
    showModal("Undoing blocklist...");
    window.electron.undoBlocklist();
  });

  // Check if websites are blocked
  window.electron.onCheckHaramStatus((blocked) => {
    isHaramBlocked = blocked;
    updateUI();
  });

  // Check for required elements
  if (!blockSection || !setupStatus) {
    console.error("Critical elements not found in the DOM.");
    return;
  }

  // State Variables
  let isPermissionsGranted = false;
  let isHaramBlocked = false;

  // Utility: Show Modal Notification with Progress Bar Option
  function showModal(message, showProgress = false) {
    modalMessage.textContent = message;

    if (showProgress) {
      // Add a progress bar dynamically if not already added
      if (!modalProgressBar) {
        modalProgressBar = document.createElement("progress");
        modalProgressBar.id = "modal-progress-bar";
        modalProgressBar.value = 0;
        modalProgressBar.max = 100;
        modalMessage.insertAdjacentElement("afterend", modalProgressBar);
      }
      modalProgressBar.classList.remove("hidden");
    } else {
      if (modalProgressBar) modalProgressBar.classList.add("hidden");
    }

    modal.classList.remove("hidden");
  }

  // Utility: Update Progress Bar
  function updateProgressBar(current, total) {
    if (modalProgressBar) {
      modalProgressBar.value = Math.round((current / total) * 100);
    }
  }

  // Close Modal
  modalClose.addEventListener("click", () => {
    modal.classList.add("hidden");
    if (modalProgressBar) modalProgressBar.classList.add("hidden");
  });

  // Update UI based on state
  function updateUI() {
    if (isPermissionsGranted) {
      setupStatus.innerHTML = `
      <div class="success-message">
        <span class="checkmark">✔</span>
        <h2>Permissions have been successfully granted.</h2>
      </div>
    `;
    }

    if (isHaramBlocked) {
      blockSection.innerHTML = `
      <div class="success-message">
        <span class="checkmark">✔</span>
        <h2>Haram content is blocked on this computer.</h2>
        <button id="undo-blocklist">Undo Blocking</button>
      </div>
    `;

      // Attach the event listener to the new "Undo Blocking" button
      document
        .getElementById("undo-blocklist")
        ?.addEventListener("click", () => {
          showModal("Undoing blocklist...");
          window.electron.undoBlocklist();
        });
    } else {
      blockSection.innerHTML = `
      <h2>Block Haram Content</h2>
      <button id="block-haram">Block Haram Content</button>
    `;

      document.getElementById("block-haram")?.addEventListener("click", () => {
        showModal("Blocking haram content... This might take a while.", true);
        window.electron.blockHaramContent();
      });
    }
  }

  // Handle Permission Setup Success
  function showSetupSuccess() {
    isPermissionsGranted = true;
    updateUI();
  }

  // Handle Haram Content Block Success
  function showBlockedMessage() {
    isHaramBlocked = true;
    updateUI();
  }

  // Validate URL
  function validateDomain(domain) {
    // Regex to validate domain names (e.g., youtube.com, example.org)
    const domainRegex = /^(?!-)[A-Za-z0-9-]{1,63}(?<!-)\.[A-Za-z]{2,}$/;
    return domainRegex.test(domain);
  }

  // Render custom URL list
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
              </li>
            `
          )
          .join("")
      : "<p>No custom URLs added yet.</p>";
  }

  // Refresh custom URL list
  function refreshCustomList() {
    window.electron.getCustomList();
  }
  blockButton?.addEventListener("click", () => {
    showModal("Blocking haram content... This might take a while.", true);
    window.electron.blockHaramContent();
  });

  // Listen for progress updates
  window.electron.onUpdateProgress((current, total) => {
    updateProgressBar(current, total);
  });

  // Listen for success
  window.electron.onBlocklistSuccess((message) => {
    modalMessage.textContent = message;
    modalProgressBar.classList.add("hidden");
  });

  // Listen for errors
  window.electron.onBlocklistError((error) => {
    modalMessage.textContent = error;
    modalProgressBar.classList.add("hidden");
  });

  // Listen for progress updates
  window.electron.on("update-progress", (current, total) => {
    updateProgressBar(current, total);
  });

  // Listen for blocking completion
  window.electron.onBlockHaramSuccess((response) => {
    modal.classList.add("hidden");
    if (response.success) {
      showBlockedMessage();
      showModal("✔ Haram content has been successfully blocked.");
    } else {
      showModal(`❌ Error: ${response.message}`);
    }
  });

  // Event: Setup Permissions
  setupButton?.addEventListener("click", () => {
    showModal("Setting up permissions...");
    window.electron.setupPermissions();
  });

  // Event: Add Custom URL
  addButton.addEventListener("click", () => {
    const domain = customUrlInput.value.trim();

    if (!validateDomain(domain)) {
      console.log("Invalid domain entered:", domain);
      showModal(
        "❌ Please enter a valid domain in the format websitename.com (e.g., youtube.com)."
      );
      return;
    }

    console.log("Adding domain to hosts file:", domain);

    // Automatically add plain and www. versions to the list
    window.electron.addCustomUrl(domain);

    customUrlInput.value = ""; // Clear input
  });

  // Event: Remove Custom URL (Event Delegation)
  customList?.addEventListener("click", (e) => {
    if (e.target.classList.contains("remove-url")) {
      const url = e.target.dataset.url;
      window.electron.removeCustomUrl(url, (success, updatedUrls) => {
        if (success) {
          console.log("URL removed successfully.");
          renderCustomUrls(updatedUrls); // Re-render the updated list
        } else {
          console.error("Failed to remove URL.");
          showModal("❌ Failed to remove the URL. Please try again.");
        }
      });
    }
  });

  // Load initial configuration
  window.electron.receiveInitialConfig((config) => {
    if (config.permissionsGranted) showSetupSuccess();
    if (config.haramBlocked) showBlockedMessage();
  });

  // Update custom URL list
  window.electron.onUpdateCustomList((customUrls) => {
    renderCustomUrls(customUrls);
  });

  // Initialize App
  function init() {
    refreshCustomList();
  }

  init();
});
