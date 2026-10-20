(() => {
  "use strict";
  const key = "aonAutoMatchesEnabled";
  const checkbox = document.getElementById("aonAutoMatchesToggle");
  const status = document.getElementById("preferenceStatus");
  let revision = 0;
  const show = enabled => {
    checkbox.checked = enabled === true;
    status.textContent = enabled === true
      ? "Suggestions are on. Open Amazon or Flipkart to see available sponsored offers."
      : "Suggestions are off. Nothing is sent to AON.";
  };
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[key]) {
      revision += 1;
      show(changes[key].newValue);
    }
  });
  const initialRevision = revision;
  chrome.storage.local.get(key).then(stored => {
    if (revision === initialRevision) show(stored[key]);
    checkbox.disabled = false;
  }).catch(() => {
    status.textContent = "Your choice could not be loaded. Please reopen this page.";
  });
  checkbox.addEventListener("change", async () => {
    const enabled = checkbox.checked;
    checkbox.disabled = true;
    try {
      await chrome.storage.local.set({ [key]: enabled });
      show(enabled);
    } catch {
      show(!enabled);
      status.textContent = "Your choice could not be saved. Please try again.";
    } finally {
      checkbox.disabled = false;
    }
  });
})();
