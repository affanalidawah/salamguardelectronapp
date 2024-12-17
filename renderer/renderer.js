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

  // Check for required elements
  if (!blockSection || !setupStatus) {
    console.error("Critical elements not found in the DOM.");
    return;
  }

  // State Variables
  let isPermissionsGranted = false;
  let isHaramBlocked = false;

  // Utility: Show Modal Notification
  function showModal(message) {
    modalMessage.textContent = message;
    modal.classList.remove("hidden");
  }

  // Close Modal
  modalClose.addEventListener("click", () => {
    modal.classList.add("hidden");
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
        </div>
      `;
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

  // Event: Block Haram Content
  blockButton?.addEventListener("click", () => {
    showModal("Blocking haram content...");
    window.electron.blockHaramContent();
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
