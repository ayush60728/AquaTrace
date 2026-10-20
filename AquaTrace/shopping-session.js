// Service-worker bridge for tab-scoped UI state. chrome.storage.session is not
// exposed to content scripts; this keeps offer caches off the shopping page's
// own sessionStorage and preserves dismissal across same-tab site navigation.
(() => {
  "use strict";

  const memory = new Map();
  const pending = new Map();
  const keyFor = tabId => `aonShoppingTab:${tabId}`;
  const emptyState = () => ({ dismissed: false, lastOffers: [] });

  async function readState(tabId) {
    if (memory.has(tabId)) return memory.get(tabId);
    try {
      const stored = await chrome.storage.session.get(keyFor(tabId));
      const state = stored[keyFor(tabId)];
      if (state && typeof state === "object") {
        const normalized = {
          dismissed: state.dismissed === true,
          lastOffers: Array.isArray(state.lastOffers) ? state.lastOffers.slice(0, 3) : []
        };
        memory.set(tabId, normalized);
        return normalized;
      }
    } catch { /* The in-memory fallback still lasts for this worker session. */ }
    return emptyState();
  }

  async function updateState(tabId, message) {
    const previous = await readState(tabId);
    const next = {
      dismissed: message.dismissed === true || previous.dismissed,
      lastOffers: Array.isArray(message.lastOffers) && message.lastOffers.length
        ? message.lastOffers.slice(0, 3)
        : previous.lastOffers
    };
    memory.set(tabId, next);
    try {
      await chrome.storage.session.set({ [keyFor(tabId)]: next });
    } catch { /* Keep the in-memory copy when session storage is unavailable. */ }
    return next;
  }

  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (!message || !["AON_GET_TAB_SESSION", "AON_SET_TAB_SESSION"].includes(message.type)) return undefined;
    const tabId = sender && sender.tab && sender.tab.id;
    if (!Number.isInteger(tabId)) {
      respond(emptyState());
      return false;
    }
    const operation = (pending.get(tabId) || Promise.resolve()).then(() => (
      message.type === "AON_SET_TAB_SESSION" ? updateState(tabId, message) : readState(tabId)
    ));
    pending.set(tabId, operation.catch(() => {}));
    operation.then(respond, () => respond(emptyState()));
    return true;
  });

  if (chrome.tabs && chrome.tabs.onRemoved) {
    chrome.tabs.onRemoved.addListener(tabId => {
      const operation = pending.get(tabId) || Promise.resolve();
      operation.finally(async () => {
        pending.delete(tabId);
        memory.delete(tabId);
        try { await chrome.storage.session.remove(keyFor(tabId)); } catch { }
      });
    });
  }
})();
