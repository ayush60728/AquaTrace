(() => {
  "use strict";

  const AUTO_MATCHES_KEY = "aonAutoMatchesEnabled";
  const GENERIC_INTENT = "Show me relevant offers";
  const BAR_ID = "aquatrace-sponsored-offers";
  const MAX_OFFERS = 3;
  const INTENT_LIMIT = 200;
  const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F]/g;

  const host = typeof location !== "undefined" && typeof location.hostname === "string"
    ? location.hostname.toLowerCase().replace(/\.$/, "")
    : "";

  function isAmazonHost(value) {
    return value === "amazon.in" || value.endsWith(".amazon.in")
      || value === "amazon.com" || value.endsWith(".amazon.com");
  }

  function isFlipkartHost(value) {
    return value === "flipkart.com" || value.endsWith(".flipkart.com");
  }

  function isSupportedHost(value) {
    return isAmazonHost(value) || isFlipkartHost(value);
  }

  if (!isSupportedHost(host) || typeof document === "undefined") return;

  function cleanIntent(value) {
    if (typeof value !== "string" && typeof value !== "number") return "";
    return String(value)
      .replace(/(?:\b[a-z][a-z\d+.-]*:\/\/|\bwww\.|\/\/)\S+/gi, "")
      .replace(CONTROL_CHARACTERS, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, INTENT_LIMIT)
      .trim();
  }

  function uniqueIntents(values) {
    const seen = new Set();
    return values.map(cleanIntent).filter(value => {
      if (!value || seen.has(value.toLowerCase())) return false;
      seen.add(value.toLowerCase());
      return true;
    });
  }

  function brandModelText(title) {
    const value = cleanIntent(title);
    if (!value) return "";
    const lead = cleanIntent(value.split(/[,\u003A]/, 1)[0]);
    if (lead.length <= 80) return lead;
    const cut = lead.slice(0, 80);
    return cut.slice(0, cut.lastIndexOf(" ") > 0 ? cut.lastIndexOf(" ") : 80).trim();
  }

  function categoryWord(category) {
    const words = cleanIntent(category).split(/[\s>/,&]+/).filter(Boolean);
    return words.length ? cleanIntent(words[words.length - 1]) : "";
  }

  function normalizeProduct(product) {
    if (!product || typeof product !== "object") return null;
    const title = cleanIntent(product.title);
    const rawCategory = cleanIntent(product.category);
    const category = rawCategory.length <= 60 ? rawCategory : "";
    const rawPrice = cleanIntent(product.price).slice(0, 32).replace(/,/g, "");
    const price = /^\d+(?:\.\d{1,2})?$/.test(rawPrice) ? rawPrice : "";
    const rawCurrency = cleanIntent(product.currency).toUpperCase();
    const currency = /^(INR|USD)$/.test(rawCurrency) ? rawCurrency : "";
    if (!title && !category) return null;
    return { title, category, price, currency };
  }

  function productIntent(product) {
    const parts = [];
    if (product.title) parts.push(`Product title: ${product.title}`);
    if (product.category) parts.push(`Category: ${product.category}`);
    if (product.price && product.currency) parts.push(`Price: ${product.price} ${product.currency}`);
    return cleanIntent(parts.join("; "));
  }

  function buildIntentCandidates(product, urlIntent) {
    const normalizedProduct = normalizeProduct(product);
    if (normalizedProduct) {
      return uniqueIntents([
        productIntent(normalizedProduct),
        brandModelText(normalizedProduct.title),
        categoryWord(normalizedProduct.category),
        GENERIC_INTENT
      ]);
    }

    const cleanedUrlIntent = cleanIntent(urlIntent);
    return uniqueIntents([
      cleanedUrlIntent,
      brandModelText(cleanedUrlIntent),
      GENERIC_INTENT
    ]);
  }

  function getUrlIntent() {
    try {
      const url = new URL(location.href);
      const parameter = isAmazonHost(host) ? "k" : "q";
      return cleanIntent(url.searchParams.get(parameter) || "");
    } catch {
      return "";
    }
  }

  function getProductContext() {
    const helper = globalThis.AquaTraceProductContext;
    if (!helper || typeof helper.extractProductData !== "function") return null;
    try {
      return normalizeProduct(helper.extractProductData());
    } catch {
      return null;
    }
  }

  function safeHttpsUrl(value) {
    if (typeof value !== "string" || !value.trim()) return "";
    if (!/^https:\/\//i.test(value) || /[\s\u0000-\u001f\u007f-\u009f]/.test(value)) return "";
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" || url.username || url.password) return "";
      return value;
    } catch {
      return "";
    }
  }

  function storageGet(key) {
    return new Promise(resolve => {
      try {
        const maybePromise = chrome.storage.local.get(key, result => {
          void chrome.runtime.lastError;
          resolve(result || {});
        });
        if (maybePromise && typeof maybePromise.then === "function") {
          maybePromise.then(result => resolve(result || {}), () => resolve({}));
        }
      } catch {
        resolve({});
      }
    });
  }

  function sendMessage(message) {
    return new Promise((resolve, reject) => {
      try {
        const maybePromise = chrome.runtime.sendMessage(message, response => {
          const error = chrome.runtime && chrome.runtime.lastError;
          if (error) reject(error);
          else resolve(response);
        });
        if (maybePromise && typeof maybePromise.then === "function") {
          maybePromise.then(resolve, reject);
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  function normalizeOffer(offer) {
    if (!offer || typeof offer !== "object") return null;
    const actionUrl = safeHttpsUrl(offer.actionUrl || (offer.action && offer.action.payload && offer.action.payload.url));
    const title = cleanIntent(offer.title);
    if (!actionUrl || !title) return null;
    return {
      title,
      description: cleanIntent(offer.description),
      price: cleanIntent(offer.price),
      currency: cleanIntent(offer.currency).toUpperCase(),
      source: cleanIntent(offer.source || offer.entityName || "AON"),
      imageUrl: safeHttpsUrl(offer.imageUrl || offer.image_url || ""),
      imageAlt: cleanIntent(offer.imageAlt || title),
      actionUrl,
      actionName: cleanIntent(offer.actionName || "View deal")
    };
  }

  function saveSession(update) {
    sendMessage({ type: "AON_SET_TAB_SESSION", ...update }).catch(() => {});
  }

  function makeElement(tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
  }

  const barHost = document.createElement("div");
  barHost.id = BAR_ID;
  // Inline !important protects the host itself; Shadow DOM protects its children.
  barHost.style.cssText = "all: initial !important; position: relative !important; width: 100% !important; z-index: 2147483647 !important; pointer-events: none !important; display: none !important;";
  const shadow = barHost.attachShadow({ mode: "open" });
  const style = makeElement("style");
  style.textContent = `
    :host { all: initial; position: relative; display: block; pointer-events: none; }
    :host([hidden]) { display: none; }
    * { box-sizing: border-box; }
    .bar { pointer-events: auto; width: min(920px, calc(100vw - 24px)); margin: 8px auto; color: #172033; font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .panel { border: 1px solid #d7e0ef; border-radius: 12px; background: rgba(255,255,255,.98); box-shadow: 0 8px 24px rgba(20,35,65,.18); overflow: hidden; }
    .header { min-height: 38px; display: flex; align-items: center; gap: 8px; padding: 7px 10px; }
    .brand { color: #1d4ed8; font-weight: 750; white-space: nowrap; }
    .summary { min-width: 0; flex: 1; color: #526071; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .header-button { border: 0; border-radius: 7px; padding: 5px 7px; color: #42526a; background: #eef3fb; cursor: pointer; font: inherit; font-size: 11px; }
    .header-button:hover { background: #e2eaf7; color: #173b8f; }
    .content { padding: 0 10px 10px; }
    .offers { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
    .offer { min-width: 0; display: grid; grid-template-columns: 42px minmax(0, 1fr); gap: 8px; padding: 8px; border: 1px solid #d7e0ef; border-radius: 9px; color: inherit; text-decoration: none; background: #f8fbff; }
    .offer:hover { border-color: #8eb1f4; background: #f1f6ff; }
    .offer-image, .offer-placeholder { width: 42px; height: 42px; border-radius: 7px; object-fit: cover; background: #e8eef8; }
    .offer-placeholder { display: flex; align-items: center; justify-content: center; color: #2563eb; font-size: 18px; }
    .offer-body { min-width: 0; }
    .offer-meta { display: flex; justify-content: space-between; gap: 6px; margin-bottom: 2px; }
    .sponsored { color: #59677a; font-size: 10px; font-weight: 700; white-space: nowrap; }
    .price { color: #172033; font-size: 11px; font-weight: 750; white-space: nowrap; }
    .title { display: block; color: #172033; font-size: 12px; font-weight: 700; line-height: 1.25; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .source { margin-top: 3px; color: #64748b; font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .offer-button { display: inline-block; margin-top: 5px; border-radius: 5px; padding: 3px 8px; background: #1d4ed8; color: white; font-size: 11px; font-weight: 650; }
    a:focus-visible, button:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
    .description { margin: 3px 0 0; color: #64748b; font-size: 10px; line-height: 1.3; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
    @media (max-width: 680px) { .offers { grid-template-columns: 1fr; } .offer { grid-template-columns: 36px minmax(0, 1fr); } .offer-image, .offer-placeholder { width: 36px; height: 36px; } }
  `;
  shadow.appendChild(style);

  const bar = makeElement("div", "bar");
  const panel = makeElement("section", "panel");
  panel.setAttribute("aria-label", "Sponsored product offers");
  const header = makeElement("div", "header");
  const brand = makeElement("strong", "brand", "AquaTrace");
  const summary = makeElement("span", "summary", "Sponsored offers");
  const collapseButton = makeElement("button", "header-button", "Collapse");
  collapseButton.type = "button";
  collapseButton.setAttribute("aria-expanded", "true");
  const dismissButton = makeElement("button", "header-button", "Dismiss");
  dismissButton.type = "button";
  dismissButton.setAttribute("aria-label", "Dismiss sponsored offers for this tab");
  header.append(brand, summary, collapseButton, dismissButton);
  const content = makeElement("div", "content");
  panel.append(header, content);
  bar.appendChild(panel);
  shadow.appendChild(bar);
  barHost.hidden = true;

  let collapsed = false;
  let dismissed = false;
  let autoMatchesEnabled = false;
  let initialized = false;
  let preferenceRevision = 0;
  let requestInFlight = false;
  let pendingRefresh = false;
  let requestSequence = 0;
  let lastRequestKey = "";
  let lastOffers = [];
  let observedHref = location.href;

  function hideBar() {
    barHost.hidden = true;
    barHost.style.setProperty("display", "none", "important");
    barHost.remove();
  }

  function showBar() {
    if (!dismissed && autoMatchesEnabled) {
      // Reserve normal document space instead of covering the site's search
      // box: the user must still be able to search while suggestions are open.
      if (!barHost.isConnected) (document.body || document.documentElement).prepend(barHost);
      barHost.hidden = false;
      barHost.style.setProperty("display", "block", "important");
    }
  }

  function setSummary(text) {
    summary.textContent = text;
  }

  function renderLoading() {
    // No loading/error bar. Retain known offers during refresh, but hide them
    // if the final result is empty or unavailable; the session copy survives.
    if (lastOffers.length) renderOffers(lastOffers);
    else hideBar();
  }

  function formatPrice(offer) {
    if (!offer.price) return "Price unavailable";
    return offer.currency ? `${offer.currency} ${offer.price}` : offer.price;
  }

  function renderOffers(offers) {
    const normalizedOffers = offers.map(normalizeOffer).filter(Boolean).slice(0, MAX_OFFERS);
    if (!normalizedOffers.length) {
      hideBar();
      return;
    }
    lastOffers = normalizedOffers;
    saveSession({ lastOffers });
    content.replaceChildren();
    const offerGrid = makeElement("div", "offers");
    normalizedOffers.forEach(offer => {
      const card = makeElement("a", "offer");
      card.href = offer.actionUrl;
      card.target = "_blank";
      card.rel = "noopener noreferrer sponsored";
      card.referrerPolicy = "no-referrer";
      const image = offer.imageUrl ? document.createElement("img") : makeElement("div", "offer-placeholder", "💧");
      if (offer.imageUrl) {
        image.className = "offer-image";
        image.referrerPolicy = "no-referrer";
        image.src = offer.imageUrl;
        image.alt = offer.imageAlt || offer.title;
        image.addEventListener("error", () => {
          image.replaceWith(makeElement("div", "offer-placeholder", "💧"));
        }, { once: true });
      }
      const body = makeElement("div", "offer-body");
      const meta = makeElement("div", "offer-meta");
      meta.append(
        makeElement("span", "sponsored", "Sponsored"),
        makeElement("span", "price", formatPrice(offer))
      );
      body.append(meta, makeElement("span", "title", offer.title));
      body.appendChild(makeElement("div", "source", offer.source || "AON"));
      // A button-styled span inside the card anchor avoids nested interactive
      // elements: both the button surface and the whole card are the same link.
      body.appendChild(makeElement("span", "offer-button", offer.actionName || "View deal"));
      card.append(image, body);
      offerGrid.appendChild(card);
    });
    content.appendChild(offerGrid);
    setSummary(`Sponsored · ${normalizedOffers.length} offer${normalizedOffers.length === 1 ? "" : "s"}`);
    showBar();
  }

  function applyPreference(enabled) {
    preferenceRevision += 1;
    if (autoMatchesEnabled === (enabled === true)) return;
    autoMatchesEnabled = enabled === true;
    lastRequestKey = "";
    requestSequence += 1;
    if (!autoMatchesEnabled) {
      clearTimeout(scheduleRefresh.timer);
      scheduleRefresh.timer = null;
      pendingRefresh = false;
      hideBar();
      return;
    }
    if (initialized) refreshOffers(true);
  }

  function readRequest() {
    const product = getProductContext();
    const intents = buildIntentCandidates(product, getUrlIntent());
    return { product, intents, key: JSON.stringify([location.href, product, intents]) };
  }

  async function refreshOffers(force) {
    if (!initialized || dismissed || !autoMatchesEnabled) return;
    if (requestInFlight) {
      pendingRefresh = true;
      return;
    }
    const { product, intents, key: requestKey } = readRequest();
    if (!force && requestKey === lastRequestKey) return;
    lastRequestKey = requestKey;
    requestInFlight = true;
    requestSequence += 1;
    const sequence = requestSequence;
    renderLoading();
    try {
      const response = product
        ? await sendMessage({
          type: "AON_QUERY_PRODUCT",
          product,
          intents,
          automatic: true
        })
        : await sendMessage({
          type: "AON_QUERY_INTENTS",
          intents,
          automatic: true
        });
      if (sequence !== requestSequence || !autoMatchesEnabled || dismissed) return;
      if (readRequest().key !== requestKey) {
        pendingRefresh = true;
        hideBar();
        return;
      }
      if (response && response.ok && Array.isArray(response.offers) && response.offers.length) {
        renderOffers(response.offers);
      } else {
        hideBar();
      }
    } catch {
      if (sequence === requestSequence) hideBar();
    } finally {
      requestInFlight = false;
      if ((pendingRefresh || sequence !== requestSequence) && autoMatchesEnabled && !dismissed) {
        pendingRefresh = false;
        lastRequestKey = sequence !== requestSequence ? "" : lastRequestKey;
        scheduleRefresh();
      }
    }
  }

  async function initializePreference() {
    const revision = preferenceRevision;
    const [stored, session] = await Promise.all([
      storageGet(AUTO_MATCHES_KEY),
      sendMessage({ type: "AON_GET_TAB_SESSION" }).catch(() => null)
    ]);
    if (revision === preferenceRevision) {
      autoMatchesEnabled = stored[AUTO_MATCHES_KEY] === true;
    }
    dismissed = Boolean(session && session.dismissed);
    lastOffers = session && Array.isArray(session.lastOffers)
      ? session.lastOffers.map(normalizeOffer).filter(Boolean).slice(0, MAX_OFFERS) : [];
    initialized = true;
    if (dismissed) {
      hideBar();
    } else if (autoMatchesEnabled) {
      refreshOffers(true);
    } else {
      hideBar();
    }
  }

  function scheduleRefresh() {
    if (location.href !== observedHref) {
      observedHref = location.href;
      requestSequence += 1;
      lastRequestKey = "";
      if (autoMatchesEnabled) hideBar();
    }
    if (!autoMatchesEnabled || dismissed) return;
    // A busy carousel must not postpone navigation forever. Use an 800 ms
    // trailing debounce with a two-second maximum wait for continuous changes.
    if (!scheduleRefresh.timer) scheduleRefresh.startedAt = Date.now();
    clearTimeout(scheduleRefresh.timer);
    const wait = Math.min(800, Math.max(0, 2000 - (Date.now() - scheduleRefresh.startedAt)));
    scheduleRefresh.timer = setTimeout(() => {
      scheduleRefresh.timer = null;
      if (autoMatchesEnabled) refreshOffers(false);
    }, wait);
  }

  function dismissForSession() {
    dismissed = true;
    requestSequence += 1;
    clearTimeout(scheduleRefresh.timer);
    scheduleRefresh.timer = null;
    saveSession({ dismissed: true });
    hideBar();
  }

  collapseButton.addEventListener("click", () => {
    collapsed = !collapsed;
    content.hidden = collapsed;
    collapseButton.textContent = collapsed ? "Expand" : "Collapse";
    collapseButton.setAttribute("aria-expanded", String(!collapsed));
  });
  dismissButton.addEventListener("click", dismissForSession);

  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged
    && typeof chrome.storage.onChanged.addListener === "function") {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local" || !changes[AUTO_MATCHES_KEY]) return;
      applyPreference(changes[AUTO_MATCHES_KEY].newValue === true, true);
    });
  }

  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage
    && typeof chrome.runtime.onMessage.addListener === "function") {
    chrome.runtime.onMessage.addListener(message => {
      if (message && message.type === "AON_AUTO_MATCHES_CHANGED") {
        applyPreference(message.enabled === true, true);
      }
    });
  }

  window.addEventListener("popstate", scheduleRefresh);
  window.addEventListener("hashchange", scheduleRefresh);
  window.addEventListener("aquatrace-history-change", scheduleRefresh);
  window.addEventListener("online", () => { lastRequestKey = ""; scheduleRefresh(); });
  window.addEventListener("offline", () => { requestSequence += 1; hideBar(); });

  const observerRoot = document.documentElement || document.body;
  if (observerRoot && typeof MutationObserver === "function") {
    const observer = new MutationObserver(records => {
      // Ignore our own host's insertion/removal so it cannot perpetually restart
      // the debounce timer. Shadow-root mutations are not observed here.
      if (records.length && records.every(record => record.target === barHost
        || (record.type === "childList" && [...record.addedNodes, ...record.removedNodes]
          .every(node => node === barHost)))) return;
      scheduleRefresh();
    });
    observer.observe(observerRoot, {
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["content", "data-price", "data-category", "data-currency", "data-price-currency"],
      subtree: true
    });
  }

  initializePreference().catch(() => {
    hideBar();
  });
})();
