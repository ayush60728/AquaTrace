(() => {
  var u = {
    "gpt-4o-mini": {
      label: "GPT-4o Mini",
      whPerToken: 1e-4,
      tokenizerAccuracy: "exact",
      company: "microsoft"
    },
    "gpt-4o": {
      label: "GPT-4o",
      whPerToken: 6e-4,
      tokenizerAccuracy: "exact",
      company: "microsoft"
    },
    "gpt-5": {
      label: "GPT-5",
      whPerToken: .0025,
      tokenizerAccuracy: "exact",
      company: "microsoft"
    },
    "claude-sonnet": {
      label: "Claude Sonnet",
      whPerToken: 6e-4,
      tokenizerAccuracy: "approx",
      company: "amazon"
    },
    "claude-opus": {
      label: "Claude Opus",
      whPerToken: .0018,
      tokenizerAccuracy: "approx",
      company: "amazon"
    },
    "gemini-flash": {
      label: "Gemini Flash",
      whPerToken: 12e-5,
      tokenizerAccuracy: "approx",
      company: "google"
    },
    "gemini-pro": {
      label: "Gemini Pro",
      whPerToken: 8e-4,
      tokenizerAccuracy: "approx",
      company: "google"
    },
    "deepseek-v3": {
      label: "DeepSeek V3",
      whPerToken: .001,
      tokenizerAccuracy: "approx",
      company: "china"
    },
    "deepseek-r1": {
      label: "DeepSeek R1",
      whPerToken: .0029,
      tokenizerAccuracy: "approx",
      company: "china"
    }
  },
    f = {
      amazon: {
        low: .15,
        high: 1.8
      },
      microsoft: {
        low: .3,
        high: 1.52
      },
      google: {
        low: .5,
        high: 1.2
      },
      china: {
        low: 1,
        high: 3
      }
    },
    x = {
      amazon: 445,
      microsoft: 445,
      google: 445,
      china: 555
    },
    k = {
      "chatgpt.com": "gpt-4o",
      "chat.openai.com": "gpt-4o",
      "claude.ai": "claude-sonnet",
      "gemini.google.com": "gemini-flash",
      "chat.deepseek.com": "deepseek-v3"
    },
    y = "gpt-4o-mini";
  var w = {
    "chatgpt.com": "ChatGPT",
    "chat.openai.com": "ChatGPT",
    "claude.ai": "Claude",
    "gemini.google.com": "Gemini",
    "chat.deepseek.com": "DeepSeek"
  },
    T = {
      amazon: "AWS",
      microsoft: "Microsoft Azure",
      google: "Google",
      china: "China's national grid"
    };
  function E(t) {
    return !!(t && (w[t] || k[t]))
  }

  async function S() {
    let e = (await chrome.storage.local.get("waterTrackerState")).waterTrackerState || {
      bySite: {},
      history: []
    };
    return e.bySite || (e.bySite = {}),
      e.history = Array.isArray(e.history) ? e.history.slice(0, 100) : [],
      Object.values(e.bySite).forEach(o => {
        u[o.modelId] || (o.modelId = y)
      }),
      e
  }

  function I() {
    return new Promise(t => {
      try {
        chrome.tabs.query({
          active: !0,
          currentWindow: !0
        },
          e => {
            try {
              let o = e && e[0] && e[0].url;
              t(o ? new URL(o).hostname : null)
            } catch {
              t(null)
            }
          })
      } catch {
        t(null)
      }
    })
  }

  function getActiveTabDetails() {
    return new Promise(resolve => {
      try {
        chrome.tabs.query({
          active: !0,
          currentWindow: !0
        }, tabs => {
          const tab = tabs && tabs[0];
          resolve(tab && tab.id != null ? tab : null);
        });
      } catch {
        resolve(null);
      }
    });
  }

  async function getLiveModel(site) {
    if (!E(site)) return null;
    const tab = await getActiveTabDetails();
    if (!tab || !tab.id) return null;
    let hostname = null;
    try {
      hostname = tab.url ? new URL(tab.url).hostname : null;
    } catch { }
    if (hostname !== site || !chrome.tabs.sendMessage) return null;
    return new Promise(resolve => {
      try {
        chrome.tabs.sendMessage(tab.id, { type: "GET_CURRENT_MODEL" }, response => {
          if (chrome.runtime && chrome.runtime.lastError) {
            resolve(null);
            return;
          }
          const modelId = response && response.modelId;
          resolve(u[modelId] ? modelId : null);
        });
      } catch {
        resolve(null);
      }
    });
  }

  function isShoppingHost(hostname) {
    const host = String(hostname || "").toLowerCase().replace(/\.$/, "");
    return host === "amazon.in" || host.endsWith(".amazon.in")
      || host === "amazon.com" || host.endsWith(".amazon.com")
      || host === "flipkart.com" || host.endsWith(".flipkart.com");
  }

  const AON_LAST_OFFERS_STORAGE_KEY = "aonLastNonEmptyOffers";
  const GENERIC_AON_INTENT = "Show me relevant offers";

  function cleanShoppingIntent(value) {
    if (typeof value !== "string" && typeof value !== "number") return "";
    return String(value)
      .replace(/(?:\b[a-z][a-z\d+.-]*:\/\/|\bwww\.|\/\/)\S+/gi, "")
      .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200)
      .trim();
  }

  function getActiveShoppingDetails() {
    return getActiveTabDetails().then(tab => {
      if (!tab || !tab.url) return { isShopping: false, intent: "" };
      try {
        const url = new URL(tab.url);
        const host = url.hostname.toLowerCase().replace(/\.$/, "");
        if (!isShoppingHost(host)) return { isShopping: false, intent: "" };
        const parameter = host === "amazon.in" || host.endsWith(".amazon.in")
          || host === "amazon.com" || host.endsWith(".amazon.com") ? "k" : "q";
        return {
          isShopping: true,
          intent: cleanShoppingIntent(url.searchParams.get(parameter) || "")
        };
      } catch {
        return { isShopping: false, intent: "" };
      }
    });
  }

  function getLastAonOffers() {
    return new Promise(resolve => {
      try {
        const session = chrome.storage && chrome.storage.session;
        if (!session || typeof session.get !== "function") {
          resolve([]);
          return;
        }
        const finish = result => {
          const entry = result && result[AON_LAST_OFFERS_STORAGE_KEY];
          resolve(entry && Array.isArray(entry.offers) ? entry.offers.slice(0, 3) : []);
        };
        const maybePromise = session.get(AON_LAST_OFFERS_STORAGE_KEY, finish);
        if (maybePromise && typeof maybePromise.then === "function") {
          maybePromise.then(finish, () => resolve([]));
        }
      } catch {
        resolve([]);
      }
    });
  }

  function getActiveProductContext() {
    return getActiveTabDetails().then(tab => {
      if (!tab || !tab.id) return null;
      let hostname = "";
      try {
        hostname = tab.url ? new URL(tab.url).hostname : "";
      } catch { }
      if (!isShoppingHost(hostname) || !chrome.tabs.sendMessage) return null;
      return new Promise(resolve => {
        try {
          chrome.tabs.sendMessage(tab.id, { type: "GET_PRODUCT_DATA" }, response => {
            if (chrome.runtime && chrome.runtime.lastError) {
              resolve(null);
              return;
            }
            resolve(response || null);
          });
        } catch {
          resolve(null);
        }
      });
    });
  }

  function A(t) {
    let e = t / 500;
    return e < .001 ? "\u2248 0.1% of a 500 mL water bottle" : e < 1 ? `\u2248 ${(e * 100).toFixed(1)}% of a 500 mL water bottle` : `\u2248 ${e.toFixed(1)} water bottles (500 mL)`
  }

  function M(t) {
    return Object.entries(u).map(([e, o]) => `<option value="${e}" ${e === t ? "selected" : ""}>${o.label}</option>`).join("")
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;"
    }[character]));
  }

  function safeHttpsUrl(value) {
    if (typeof value !== "string" || !value.trim()) return "";
    if (!/^https:\/\//i.test(value) || /[\s\u0000-\u001f\u007f-\u009f]/.test(value)) return "";
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password ? value : "";
    } catch {
      return "";
    }
  }

  function truncateOfferDescription(value, maxLength = 140) {
    const description = String(value ?? "").trim();
    if (description.length <= maxLength) return description;
    return `${description.slice(0, maxLength - 3).trimEnd()}...`;
  }

  function formatAonPrice(price, currency) {
    const amount = String(price ?? "").trim();
    const currencyCode = String(currency ?? "").trim().toUpperCase();
    if (!amount) return "Price unavailable";
    const numericAmount = Number(amount);
    if (currencyCode && Number.isFinite(numericAmount)) {
      try {
        return new Intl.NumberFormat(undefined, {
          style: "currency",
          currency: currencyCode
        }).format(numericAmount);
      } catch { }
    }
    return currencyCode ? `${currencyCode} ${amount}` : amount;
  }

  function getOfferImageUrl(offer) {
    const image = offer && (offer.imageUrl || offer.image_url || offer.imageURL || offer.image);
    if (typeof image === "string") return safeHttpsUrl(image);
    if (image && typeof image.url === "string") return safeHttpsUrl(image.url);
    return "";
  }

  function renderAonOffers(response) {
    const results = document.getElementById("aonOfferResults");
    if (!results) return;
    const offers = response && response.ok && Array.isArray(response.offers)
      ? response.offers.filter(offer => offer && String(offer.title || "").trim() && safeHttpsUrl(offer.actionUrl)).slice(0, 3)
      : [];
    const renderMessage = message => {
      const element = document.createElement("p");
      element.className = "aon-status";
      element.textContent = message;
      results.replaceChildren(element);
    };
    if (!response || !response.ok) {
      results.replaceChildren();
      return;
    }
    if (!offers.length) {
      renderMessage("No relevant sponsored products are available right now.");
      return;
    }
    const fragment = document.createDocumentFragment();
    offers.forEach(offer => {
      const title = String(offer.title).trim();
      const description = truncateOfferDescription(offer.description);
      const actionUrl = safeHttpsUrl(offer.actionUrl);
      const imageUrl = getOfferImageUrl(offer);
      const card = document.createElement("a");
      card.className = "aon-offer";
      card.href = actionUrl;
      card.target = "_blank";
      card.rel = "noopener noreferrer sponsored";
      card.referrerPolicy = "no-referrer";
      const image = imageUrl ? document.createElement("img") : document.createElement("div");
      if (imageUrl) {
        image.className = "aon-offer-image";
        image.referrerPolicy = "no-referrer";
        image.src = imageUrl;
        image.alt = String(offer.imageAlt || title);
        image.addEventListener("error", () => {
          const placeholder = document.createElement("div");
          placeholder.className = "aon-offer-image-placeholder";
          placeholder.setAttribute("aria-hidden", "true");
          placeholder.textContent = "💧";
          image.replaceWith(placeholder);
        }, { once: true });
      } else {
        image.className = "aon-offer-image-placeholder";
        image.setAttribute("aria-hidden", "true");
        image.textContent = "💧";
      }
      const body = document.createElement("div");
      body.className = "aon-offer-body";
      const meta = document.createElement("div");
      meta.className = "aon-offer-meta";
      const sponsored = document.createElement("span");
      sponsored.className = "aon-offer-sponsored";
      sponsored.textContent = `Sponsored · ${String(offer.entityName || offer.source || "AON")}`;
      const price = document.createElement("span");
      price.className = "aon-offer-price";
      price.textContent = formatAonPrice(offer.price, offer.currency);
      meta.append(sponsored, price);
      const titleLink = document.createElement("span");
      titleLink.className = "aon-offer-link aon-offer-title";
      titleLink.textContent = title;
      body.append(meta, titleLink);
      if (description) {
        const descriptionElement = document.createElement("p");
        descriptionElement.className = "aon-offer-description";
        descriptionElement.textContent = description;
        body.appendChild(descriptionElement);
      }
      const actionLink = document.createElement("span");
      actionLink.className = "aon-offer-link";
      actionLink.textContent = String(offer.actionName || "View deal");
      body.appendChild(actionLink);
      card.append(image, body);
      fragment.appendChild(card);
    });
    results.replaceChildren(fragment);
  }

  function normalizeProductText(value, limit) {
    if (typeof value !== "string" && typeof value !== "number") return "";
    return String(value).replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit).trim();
  }

  function normalizeProductContext(product) {
    if (!product || typeof product !== "object") return null;
    const title = normalizeProductText(product.title, 200);
    if (!title) return null;
    const category = normalizeProductText(product.category, 120);
    const rawPrice = normalizeProductText(product.price, 32).replace(/,/g, "");
    const price = /^\d+(?:\.\d{1,2})?$/.test(rawPrice) ? rawPrice : "";
    const rawCurrency = normalizeProductText(product.currency, 3).toUpperCase();
    const currency = /^[A-Z]{3}$/.test(rawCurrency) ? rawCurrency : "";
    return { title, category, price, currency };
  }

  function formatProductPreviewPrice(product) {
    if (!product || !product.price) return "Price not available";
    if (product.currency) {
      try {
        return new Intl.NumberFormat(undefined, {
          style: "currency",
          currency: product.currency
        }).format(Number(product.price));
      } catch { }
    }
    return product.currency ? `${product.currency} ${product.price}` : product.price;
  }

  function setupAonOfferForm() {
    const form = document.getElementById("aonOfferForm");
    const button = document.getElementById("aonSearchBtn");
    const autoToggle = document.getElementById("aonAutoMatchesToggle");
    const results = document.getElementById("aonOfferResults");
    const status = document.getElementById("aonProductStatus");
    const preview = document.getElementById("aonProductPreview");
    const titleElement = document.getElementById("aonProductTitle");
    const categoryElement = document.getElementById("aonProductCategory");
    const priceElement = document.getElementById("aonProductPrice");
    if (!form || !button || !autoToggle || !results || !status || !preview || !titleElement || !categoryElement || !priceElement) return;

    const AUTO_MATCHES_KEY = "aonAutoMatchesEnabled";
    let productContext = null;
    let activeShoppingPage = false;
    let shoppingIntent = "";
    let autoMatchesEnabled = false;
    let requestInFlight = false;
    let requestRevision = 0;

    const setButtonLabel = label => {
      const labelElement = button.querySelector("span");
      if (labelElement) {
        labelElement.textContent = label;
      } else {
        button.textContent = label;
      }
    };

    const updateIdleState = () => {
      if (!autoMatchesEnabled) {
        button.disabled = true;
        setButtonLabel("Enable suggestions above");
        return;
      }
      if (!activeShoppingPage) {
        button.disabled = true;
        setButtonLabel("Browse Amazon or Flipkart for live suggestions");
        return;
      }
      if (!productContext) {
        button.disabled = requestInFlight;
        setButtonLabel("Refresh suggestions");
        return;
      }
      button.disabled = requestInFlight;
      setButtonLabel(autoMatchesEnabled ? "Refresh suggestions" : "Find relevant products");
    };

    const requestOffers = async () => {
      if (!autoMatchesEnabled || !activeShoppingPage || requestInFlight) return;
      requestInFlight = true;
      const revision = requestRevision;
      button.disabled = true;
      setButtonLabel("Refreshing suggestions");
      status.textContent = "Finding relevant product suggestions...";
      const loadingMessage = document.createElement("p");
      loadingMessage.className = "aon-status";
      loadingMessage.setAttribute("role", "status");
      loadingMessage.textContent = "Finding sponsored suggestions...";
      results.replaceChildren(loadingMessage);
      try {
        const response = await chrome.runtime.sendMessage(productContext
          ? {
            type: "AON_QUERY_PRODUCT",
            product: {
              title: productContext.title,
              category: productContext.category,
              price: productContext.price,
              currency: productContext.currency
            }
          }
          : { type: "AON_QUERY_TEXT", text: shoppingIntent || GENERIC_AON_INTENT });
        if (revision !== requestRevision) return;
        if (response && response.ok && Array.isArray(response.offers) && response.offers.length) {
          renderAonOffers(response);
          status.textContent = "Live suggestions updated from AON.";
        } else {
          const reused = await showLastOffers("Showing your latest sponsored suggestions.", revision);
          if (!reused) {
            renderAonOffers({ ok: true, offers: [] });
            status.textContent = "No sponsored suggestions to show right now.";
          }
        }
      } catch {
        if (revision !== requestRevision) return;
        const reused = await showLastOffers("Showing your latest sponsored suggestions.", revision);
        if (!reused) {
          results.replaceChildren();
          status.textContent = "No sponsored suggestions to show right now.";
        }
      } finally {
        requestInFlight = false;
        updateIdleState();
        if (revision !== requestRevision && autoMatchesEnabled) requestOffers();
      }
    };

    const showLastOffers = async (message, expectedRevision = null) => {
      const offers = await getLastAonOffers();
      if (expectedRevision !== null && (expectedRevision !== requestRevision || !autoMatchesEnabled)) return false;
      if (!offers.length) {
        results.replaceChildren();
        return false;
      }
      renderAonOffers({ ok: true, offers });
      status.textContent = message;
      return true;
    };

    const showProductContext = (product, shoppingDetails) => {
      activeShoppingPage = Boolean(shoppingDetails && shoppingDetails.isShopping);
      shoppingIntent = cleanShoppingIntent(shoppingDetails && shoppingDetails.intent);
      productContext = normalizeProductContext(product);
      if (!productContext) {
        preview.hidden = true;
        updateIdleState();
        if (autoMatchesEnabled && activeShoppingPage) {
          status.textContent = "Loading live sponsored suggestions...";
          requestOffers();
        } else if (autoMatchesEnabled) {
          status.textContent = "Showing your latest sponsored suggestions.";
          showLastOffers("Showing your latest sponsored suggestions.").then(reused => {
            if (!reused) status.textContent = "No saved sponsored suggestions yet.";
          });
        } else {
          status.textContent = "Suggestions are off until you enable the checkbox.";
          results.replaceChildren();
        }
        return;
      }
      titleElement.textContent = productContext.title;
      categoryElement.textContent = productContext.category || "Not available";
      priceElement.textContent = formatProductPreviewPrice(productContext);
      preview.hidden = false;
      if (autoMatchesEnabled) {
        status.textContent = "Product detected. Loading relevant suggestions...";
        requestOffers();
      } else {
        updateIdleState();
        status.textContent = "Product detected. Suggestions stay off until you enable the checkbox.";
      }
    };

    const loadAutoMatchesPreference = async () => {
      try {
        const stored = await chrome.storage.local.get(AUTO_MATCHES_KEY);
        autoMatchesEnabled = stored && stored[AUTO_MATCHES_KEY] === true;
      } catch { }
      autoToggle.checked = autoMatchesEnabled;
      updateIdleState();
    };

    autoToggle.addEventListener("change", async () => {
      const previousValue = autoMatchesEnabled;
      autoMatchesEnabled = autoToggle.checked;
      if (!autoMatchesEnabled) {
        requestRevision += 1;
        results.replaceChildren();
      }
      updateIdleState();
      try {
        await chrome.storage.local.set({ [AUTO_MATCHES_KEY]: autoMatchesEnabled });
      } catch {
        autoMatchesEnabled = previousValue;
        autoToggle.checked = previousValue;
        updateIdleState();
        status.textContent = "Could not save the sponsored suggestions preference.";
        return;
      }

      // Storage.onChanged is the durable path used by the shopping content
      // script; send the same state directly to the active tab for immediate
      // visual feedback while the popup is open.
      try {
        const activeTab = await getActiveTabDetails();
        if (activeTab && activeTab.id != null && chrome.tabs.sendMessage) {
          chrome.tabs.sendMessage(activeTab.id, {
            type: "AON_AUTO_MATCHES_CHANGED",
            enabled: autoMatchesEnabled
          }, () => {
            void (chrome.runtime && chrome.runtime.lastError);
          });
        }
      } catch { }

      if (!autoMatchesEnabled) {
        status.textContent = productContext
          ? "Suggestions are off. Nothing is sent to AON."
          : "Automatic matches are off until you enable them again.";
        return;
      }

      if (!activeShoppingPage) {
        status.textContent = "Showing your latest sponsored suggestions.";
        showLastOffers("Showing your latest sponsored suggestions.").then(reused => {
          if (!reused) status.textContent = "No saved sponsored suggestions yet.";
        });
        return;
      }

      status.textContent = "Automatic matches enabled. Loading relevant suggestions...";
      requestOffers();
    });

    if (chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local" || !changes[AUTO_MATCHES_KEY]) return;
        const enabled = changes[AUTO_MATCHES_KEY].newValue === true;
        if (enabled === autoMatchesEnabled) return;
        autoMatchesEnabled = enabled;
        autoToggle.checked = enabled;
        if (!enabled) {
          requestRevision += 1;
          results.replaceChildren();
          status.textContent = "Automatic matches are off until you enable them again.";
        } else {
          status.textContent = "Automatic matches enabled on Amazon and Flipkart.";
          if (activeShoppingPage) requestOffers();
          else showLastOffers("Showing your latest sponsored suggestions.").then(reused => {
            if (!reused) status.textContent = "No saved sponsored suggestions yet.";
          });
        }
        updateIdleState();
      });
    }

    const initialize = async () => {
      await loadAutoMatchesPreference();
      const [product, shoppingDetails] = await Promise.all([
        getActiveProductContext(),
        getActiveShoppingDetails()
      ]);
      showProductContext(product, shoppingDetails);
    };

    initialize().catch(() => showProductContext(null, { isShopping: false, intent: "" }));

    form.addEventListener("submit", event => {
      event.preventDefault();
      requestOffers();
    });
  }

  function formatCompactNumber(value) {
    const number = Number(value) || 0;
    if (number >= 1000000) return `${(number / 1000000).toFixed(1)}M`;
    if (number >= 1000) return `${(number / 1000).toFixed(1)}k`;
    return String(Math.round(number));
  }

  function localDayKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function renderHistoryPanel(history, site) {
    const entries = (Array.isArray(history) ? history : []).filter(entry => {
      return entry && (!site || entry.site === site) && Number.isFinite(Number(entry.timestamp));
    });
    const siteLabel = site ? (w[site] || site) : "All sites";
    const now = new Date();
    const days = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
      const date = new Date(now);
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - offset);
      days.push({
        date,
        key: localDayKey(date),
        label: date.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2),
        tokens: 0,
        prompts: 0
      });
    }
    const byDay = new Map(days.map(day => [day.key, day]));
    entries.forEach(entry => {
      const date = new Date(Number(entry.timestamp));
      const day = byDay.get(localDayKey(date));
      if (!day) return;
      const promptTokens = Number(entry.promptTokens) || 0;
      const responseTokens = Number(entry.responseTokens) || 0;
      day.tokens += promptTokens + responseTokens;
      day.prompts += 1;
    });
    const maxTokens = Math.max(...days.map(day => day.tokens), 1);
    const bars = days.map(day => {
      const height = day.tokens ? Math.max(10, Math.round(day.tokens / maxTokens * 100)) : 4;
      return `<div class="trend-day" title="${escapeHtml(`${day.prompts} conversation${day.prompts === 1 ? "" : "s"}, ${formatCompactNumber(day.tokens)} tokens`)}">
        <div class="trend-bar-track"><div class="trend-bar" style="height:${height}%"></div></div>
        <span class="trend-day-label">${escapeHtml(day.label)}</span>
      </div>`;
    }).join("");
    const recent = entries.slice().sort((a, b) => Number(b.timestamp) - Number(a.timestamp)).slice(0, 5);
    const recentMarkup = recent.length ? recent.map(entry => {
      const timestamp = new Date(Number(entry.timestamp));
      const promptTokens = Number(entry.promptTokens) || 0;
      const responseTokens = Number(entry.responseTokens) || 0;
      const modelLabel = u[entry.modelId] ? u[entry.modelId].label : "Detected model";
      return `<li class="history-item">
        <div class="history-item-main">
          <strong>${escapeHtml(modelLabel)}</strong>
          <span>${escapeHtml(timestamp.toLocaleDateString(undefined, { month: "short", day: "numeric" }))} · ${escapeHtml(timestamp.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }))}</span>
        </div>
        <span class="history-item-tokens">${formatCompactNumber(promptTokens + responseTokens)} tokens</span>
      </li>`;
    }).join("") : '<li class="history-empty">No tracked conversations for this view yet.</li>';
    return `<section class="history-panel" aria-label="Conversation history and trends">
      <div class="history-panel-header">
        <div>
          <h3 class="section-title">Activity &amp; trends</h3>
          <p class="history-subtitle">Last 7 days · ${escapeHtml(siteLabel)}</p>
        </div>
        <span class="history-count">${entries.length} chat${entries.length === 1 ? "" : "s"}</span>
      </div>
      <div class="trend-chart" role="img" aria-label="Token activity for the last 7 days">${bars}</div>
      <div class="history-list-header">Recent conversations</div>
      <ul class="history-list">${recentMarkup}</ul>
    </section>`;
  }

  function B(t, e) {
    let o = u[e.modelId] || u[y],
      s = f[o.company],
      promptTokens = Number(e.promptTokens) || 0,
      responseTokens = Number(e.responseTokens) || 0,
      a = promptTokens + responseTokens,
      n = a * o.whPerToken,
      p = n * s.low,
      l = n * s.high,
      b = n / 1e3 * x[o.company],
      r = w[t] || t,
      d = T[o.company] || o.company,
      m = o.tokenizerAccuracy === "exact" ? "Exact tokenizer" : "Approximate tokenizer",
      g = Math.min(Math.max(l / 20 * 100, 15), 100),
      h = e.userOverride ? `Manually selected \xB7 <a href="#" id="autoDetectLink" data-site="${t}">Use auto-detect</a>` : e.liveDetected ? "Live model detected from page" : "Auto-detected from page";
    return `
    <div class="site-card" data-site="${t}">
      <div class="site-card-header">
        <div class="site-info-left">
          <div class="site-icon-box">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
          </div>
          <div class="site-title-area">
            <span class="site-name">${r}</span>
            <div class="status-indicator">
              <span class="status-dot"></span>
              <span class="status-text">Tracking</span>
            </div>
          </div>
        </div>
        <div class="model-pill-container">
          <select class="model-pill-select" id="modelSelect" data-site="${t}">
            ${M(e.modelId)}
          </select>
          <svg class="model-pill-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
        </div>
      </div>
      <div class="tokenizer-banner">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="16" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12.01" y2="8"></line>
        </svg>
        <span>${m} &middot; ${h}</span>
      </div>
      <div class="dashboard-grid">
        <div class="metric-card">
          <div class="metric-header">
            <svg class="metric-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
            <span class="metric-label">Prompts</span>
          </div>
          <div class="metric-value">${e.prompts}</div>
        </div>
        <div class="metric-card">
          <div class="metric-header">
            <svg class="metric-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 10 4 15 9 20"></polyline><path d="M20 4v7a4 4 0 0 1-4 4H4"></path></svg>
            <span class="metric-label">Prompt Tokens</span>
          </div>
          <div class="metric-value">${promptTokens.toLocaleString()}</div>
        </div>
        <div class="metric-card">
          <div class="metric-header">
            <svg class="metric-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 14 20 9 15 4"></polyline><path d="M4 20v-7a4 4 0 0 1 4-4h12"></path></svg>
            <span class="metric-label">Response Tokens</span>
          </div>
          <div class="metric-value">${responseTokens.toLocaleString()}</div>
        </div>
        <div class="metric-card accent">
          <div class="metric-header">
            <svg class="metric-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
            <span class="metric-label">Total Tokens</span>
          </div>
          <div class="metric-value">${a.toLocaleString()}</div>
        </div>
      </div>
    </div>
    <div class="impact-section">
      <h3 class="section-title">Environmental Impact</h3>
      <div class="water-hero-card">
        <div class="water-card-top">
          <div class="water-card-left">
            <div class="badge-icon water-badge">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="#2563eb">
                <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>
              </svg>
            </div>
            <span class="water-label">Water</span>
          </div>
          <div class="water-value">${p.toFixed(2)}&ndash;${l.toFixed(1)} mL</div>
        </div>
        <div class="water-subtext">${A(l)} &middot; based on ${d}'s reported water efficiency</div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" style="width: ${g}%;"></div>
        </div>
      </div>
      <div class="impact-sub-grid">
        <div class="sub-impact-card">
          <div class="badge-icon energy-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#f59e0b">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
            </svg>
          </div>
          <div class="sub-impact-text">
            <span class="sub-impact-label">Energy</span>
            <span class="sub-impact-value">${n.toFixed(3)} Wh</span>
          </div>
        </div>
        <div class="sub-impact-card">
          <div class="badge-icon co2-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"></path>
              <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"></path>
            </svg>
          </div>
          <div class="sub-impact-text">
            <span class="sub-impact-label">CO2e</span>
            <span class="sub-impact-value">${b.toFixed(2)} g</span>
          </div>
        </div>
      </div>
      <button class="reset-site-btn" id="siteResetBtn" data-site="${t}">
        Reset ${r} count
      </button>
      <div class="action-links-row">
        <button id="resetAllBtn" class="reset-all-link">Reset everything</button>
        <a href="#" id="methodologyLink" class="methodology-link">Methodology <span>&rarr;</span></a>
      </div>
    </div>
  `
  }

  function _() {
    return `
    <div class="empty-state-card">
      <div class="empty-icon-wrapper"><span style="font-size: 24px;">\u{1F4A7}</span></div>
      <h3>No active AI chat detected</h3>
      <p class="empty-state-text">
        Open ChatGPT, Claude, Gemini, or DeepSeek and send a message -- this popup will
        automatically start tracking that site.
      </p>
      <button id="resetAllBtn" class="reset-site-btn" style="margin-top: 16px;">Reset everything</button>
      <div class="action-links-row" style="justify-content: center; margin-top: 12px;">
        <a href="#" id="methodologyLink" class="methodology-link">Methodology <span>&rarr;</span></a>
      </div>
    </div>
  `
  }

  async function c(t) {
    let e = await S(),
      o = Object.keys(e.bySite),
      s = await I(),
      liveModelId = await getLiveModel(s),
      a = t || null;
    // Show all supported sites, not just ones with data
    // Use a Set to track seen display names and avoid duplicates
    let allSites = Object.keys(w);
    let seenNames = new Set();
    let uniqueSites = allSites.filter(site => {
      let displayName = w[site];
      if (seenNames.has(displayName)) {
        return false;
      }
      seenNames.add(displayName);
      return true;
    });
    a || (E(s) ? a = s : o.length > 0 && (a = o[o.length - 1]));
    let n = document.getElementById("siteSwitcherContainer");
    if (uniqueSites.length > 1) {
      n.style.display = "block";
      let i = document.getElementById("siteSwitcher");
      i.innerHTML = uniqueSites.map(v => `<option value="${v}" ${v === a ? "selected" : ""}>${w[v] || v}</option>`).join(""),
        i.value = a
    } else n.style.display = "none";
    let p = document.getElementById("currentSiteCard"),
      l = !!e.bySite[a],
      b = a === s && E(s),
      r = e.bySite[a] || {
        modelId: k[a] || y,
        prompts: 0,
        promptTokens: 0,
        responseTokens: 0,
        userOverride: !1
      };
    if (a === s && liveModelId && !r.userOverride) {
      r = { ...r, modelId: liveModelId, liveDetected: !0 };
    }
    !a || !l && !b ? p.innerHTML = _() : p.innerHTML = B(a,
      r);
    const historyPanel = document.getElementById("historyPanel");
    historyPanel && (historyPanel.innerHTML = renderHistoryPanel(e.history, a));
    let d = document.getElementById("modelSelect");
    d && (d.value = r.modelId,
      d.addEventListener("change",
        async i => {
          await chrome.runtime.sendMessage({
            type: "SET_MODEL",
            site: i.target.dataset.site,
            modelId: i.target.value
          }),
            c(a)
        }));
    let m = document.getElementById("autoDetectLink");
    m && m.addEventListener("click",
      async i => {
        i.preventDefault(),
          await chrome.runtime.sendMessage({
            type: "USE_AUTO_DETECT",
            site: i.target.dataset.site
          }),
          c(a)
      });
    let g = document.getElementById("siteResetBtn");
    g && g.addEventListener("click",
      async i => {
        await chrome.runtime.sendMessage({
          type: "RESET_SITE",
          site: i.target.dataset.site
        }),
          c(a)
      });
    let h = document.getElementById("resetAllBtn");
    h && h.addEventListener("click",
      async () => {
        await chrome.runtime.sendMessage({
          type: "RESET_ALL"
        }),
          c()
      })
  }

  document.addEventListener('DOMContentLoaded', () => {
    const exportBtn = document.getElementById('exportDataBtn');

    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        try {
          // 1. Fetch all tracked data from local storage
          chrome.storage.local.get('waterTrackerState', (result) => {
            try {
              const state = result.waterTrackerState;
              
              // Check if there's data to export
              if (!state || !state.bySite || Object.keys(state.bySite).length === 0) {
                const btn=document.getElementById("exportDataBtn"),orig=btn.innerText;btn.innerText="No data!";setTimeout(()=>{btn.innerText=orig},2000);
                return;
              }

              // 2. Generate CSV content
              const csvRows = [];
              const escapeCsv = value => {
                const text = String(value ?? '');
                return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
              };
              
              // CSV Header
              csvRows.push('Site,Model,Prompts,Input Tokens,Output Tokens,Water (mL) Low,Water (mL) High,Energy (Wh),CO2 (g)');
              
              // CSV Data Rows
              Object.entries(state.bySite).forEach(([site, data]) => {
                const modelInfo = u[data.modelId];
                if (!modelInfo) return;
                
                const promptTokens = Number(data.promptTokens) || 0;
                const responseTokens = Number(data.responseTokens) || 0;
                const totalTokens = promptTokens + responseTokens;
                const energyWh = totalTokens * modelInfo.whPerToken;
                const wueRange = f[modelInfo.company];
                const waterLow = (energyWh * wueRange.low).toFixed(2);
                const waterHigh = (energyWh * wueRange.high).toFixed(2);
                const co2 = ((energyWh / 1000) * x[modelInfo.company]).toFixed(2);
                
                const siteName = w[site] || site;
                const row = [
                  siteName,
                  modelInfo.label,
                  data.prompts,
                  promptTokens,
                  responseTokens,
                  waterLow,
                  waterHigh,
                  energyWh.toFixed(4),
                  co2
                ].map(escapeCsv).join(',');
                
                csvRows.push(row);
              });
              
              const csvContent = csvRows.join('\n');

              // 3. Create a blob download link
              const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
              const url = URL.createObjectURL(blob);

              const downloadAnchor = document.createElement('a');
              downloadAnchor.href = url;

              // 4. Generate timestamped filename
              const timestamp = new Date().toISOString().split('T')[0];
              downloadAnchor.download = `aquatrace_footprint_${timestamp}.csv`;

              // 5. Trigger download & cleanup
              document.body.appendChild(downloadAnchor);
              downloadAnchor.click();

              document.body.removeChild(downloadAnchor);
              URL.revokeObjectURL(url);
              
            } catch (err) {
              console.error('Export failed:', err);
              alert('Export failed. Please try again or check the console for details.');
            }
          });
        } catch (err) {
          console.error('Storage access failed:', err);
          alert('Could not access data. Please check extension permissions.');
        }
      });
    }
  });


  document.getElementById("siteSwitcher").addEventListener("change",
    t => c(t.target.value));
  var L = document.getElementById("themeToggleBtn");
  function updateThemeToggle() {
    if (!L) return;
    const dark = document.body.classList.contains("dark-theme");
    const nextTheme = dark ? "light" : "dark";
    L.setAttribute("aria-pressed", String(dark));
    L.setAttribute("aria-label", `Switch to ${nextTheme} theme`);
    L.setAttribute("title", `Switch to ${nextTheme} theme`);
  }
  L && L.addEventListener("click",
    () => {
      document.body.classList.toggle("dark-theme");
      try {
        localStorage.setItem("theme",
          document.body.classList.contains("dark-theme") ? "dark" : "light")
      } catch { }
      updateThemeToggle();
    });
  try {
    (localStorage.getItem("theme")==="dark" || (!localStorage.getItem("theme") && window.matchMedia("(prefers-color-scheme: dark)").matches)) && document.body.classList.add("dark-theme")
  } catch { }
  updateThemeToggle();

  var C = ["methodologyLink",
    "footerMethodologyLink"];
  C.forEach(t => {
    document.addEventListener("click",
      e => {
        e.target && e.target.id === t && (e.preventDefault(),
          chrome.tabs.create({
            url: chrome.runtime.getURL("methodology.html")
          }))
      })
  });

  function setupPopupTabs() {
    const readAttribute = (element, name) => element && typeof element.getAttribute === "function"
      ? element.getAttribute(name) || ""
      : element && element[name] || "";
    const byId = id => typeof document.getElementById === "function" ? document.getElementById(id) : null;
    const findElement = (ids, selectors) => {
      for (const id of ids) {
        const element = byId(id);
        if (element) return element;
      }
      if (typeof document.querySelector === "function") {
        for (const selector of selectors) {
          try {
            const element = document.querySelector(selector);
            if (element) return element;
          } catch { }
        }
      }
      return null;
    };
    const shoppingTab = findElement(
      ["shoppingTab", "shopping-tab", "shoppingTabButton", "shopping-tab-button"],
      ['[data-popup-tab="shopping"]', '[data-tab="shopping"]', ".popup-tab-shopping", ".tab-shopping", ".shopping-tab"]
    );
    const aiFootprintsTab = findElement(
      ["aiFootprintsTab", "ai-footprints-tab", "aiFootprintsTabButton", "ai-footprints-tab-button", "aiTab"],
      ['[data-popup-tab="ai-footprints"]', '[data-popup-tab="aiFootprints"]', '[data-tab="ai-footprints"]', '[data-tab="aiFootprints"]', ".popup-tab-ai-footprints", ".tab-ai-footprints", ".ai-footprints-tab"]
    );
    if (!shoppingTab || !aiFootprintsTab) return;

    const panelFor = (tab, ids, selectors) => {
      const controls = readAttribute(tab, "aria-controls").split(/\s+/).filter(Boolean);
      for (const id of controls) {
        const panel = byId(id);
        if (panel) return panel;
      }
      return findElement(ids, selectors);
    };
    const shoppingPanel = panelFor(
      shoppingTab,
      ["shoppingPanel", "shopping-panel", "shoppingContent", "shopping-content", "shoppingTabPanel", "shoppingTabContent"],
      ['[data-popup-panel="shopping"]', '[data-tab-panel="shopping"]', ".shopping-panel", ".popup-panel-shopping"]
    );
    const aiFootprintsPanel = panelFor(
      aiFootprintsTab,
      ["aiFootprintsPanel", "ai-footprints-panel", "aiFootprintsContent", "ai-footprints-content", "aiFootprintsTabPanel", "aiFootprintsTabContent", "aiTabPanel", "aiTabContent"],
      ['[data-popup-panel="ai-footprints"]', '[data-popup-panel="aiFootprints"]', '[data-tab-panel="ai-footprints"]', '[data-tab-panel="aiFootprints"]', ".ai-footprints-panel", ".popup-panel-ai-footprints"]
    );
    if (!shoppingPanel || !aiFootprintsPanel) return;

    const tabs = [
      { key: "shopping", element: shoppingTab, panel: shoppingPanel },
      { key: "ai-footprints", element: aiFootprintsTab, panel: aiFootprintsPanel }
    ];

    // Each popup opens on Shopping. Tab choice is deliberately transient and
    // never shares state with AON consent or AI tracking storage.
    let activeKey = "shopping";

    const setPanelVisibility = (panel, visible) => {
      if (!panel) return;
      panel.hidden = !visible;
      if (visible) {
        if (typeof panel.removeAttribute === "function") panel.removeAttribute("hidden");
      } else if (typeof panel.setAttribute === "function") {
        panel.setAttribute("hidden", "");
      }
      if (typeof panel.setAttribute === "function") panel.setAttribute("aria-hidden", String(!visible));
    };

    const selectTab = key => {
      if (!tabs.some(tab => tab.key === key)) return;
      activeKey = key;
      tabs.forEach(tab => {
        const selected = tab.key === activeKey;
        if (typeof tab.element.setAttribute === "function") {
          tab.element.setAttribute("role", "tab");
          tab.element.setAttribute("aria-selected", String(selected));
          tab.element.setAttribute("tabindex", selected ? "0" : "-1");
        }
        tab.element.tabIndex = selected ? 0 : -1;
        setPanelVisibility(tab.panel, selected);
      });
    };

    tabs.forEach(tab => {
      tab.element.addEventListener("click", event => {
        if (typeof event.preventDefault === "function") event.preventDefault();
         selectTab(tab.key);
      });
      tab.element.addEventListener("keydown", event => {
        const index = tabs.indexOf(tab);
        if (event.key === "ArrowRight" || event.key === "ArrowDown"
          || event.key === "ArrowLeft" || event.key === "ArrowUp"
          || event.key === "Home" || event.key === "End") {
          if (typeof event.preventDefault === "function") event.preventDefault();
          const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
          const backward = event.key === "ArrowLeft" || event.key === "ArrowUp";
          const nextIndex = event.key === "Home" ? 0
            : event.key === "End" ? tabs.length - 1
              : forward ? (index + 1) % tabs.length
                : backward ? (index - 1 + tabs.length) % tabs.length : index;
          const nextTab = tabs[nextIndex];
          selectTab(nextTab.key);
          if (nextTab.element && typeof nextTab.element.focus === "function") nextTab.element.focus();
          return;
        }
        if (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar" && event.key !== "Space") return;
        if (typeof event.preventDefault === "function") event.preventDefault();
        selectTab(tab.key);
      });
    });

    selectTab(activeKey);
  }

  setupPopupTabs();
  setupAonOfferForm();
  c();
})();
// Added for contact button
document.addEventListener('DOMContentLoaded', () => {
  const contactBtn = document.getElementById('contactBtn');
  if (contactBtn) {
    contactBtn.addEventListener('click', function(e) {
      e.preventDefault();
      chrome.windows.create({
        url: 'https://mail.google.com/mail/u/0/?fs=1&tf=cm&to=ayushkumar44344@gmail.com',
        type: 'popup',
        width: 500,
        height: 600
      });
    });
  }
});

// Added for copy summary button
document.addEventListener('DOMContentLoaded', () => {
  const copyBtn = document.getElementById('copySummaryBtn');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      chrome.storage.local.get('waterTrackerState', (result) => {
        const state = result.waterTrackerState;
        if (!state || !state.bySite || Object.keys(state.bySite).length === 0) {
          const orig = copyBtn.innerText;
          copyBtn.innerText = 'No Data!';
          setTimeout(() => copyBtn.innerText = orig, 2000);
          return;
        }
        const selector = document.getElementById('siteSwitcher');
        let site = selector && selector.value && state.bySite[selector.value]
          ? selector.value
          : Object.keys(state.bySite)[0];
        const data = site ? state.bySite[site] : null;
        if (!data) {
          const orig = copyBtn.innerText;
          copyBtn.innerText = 'No Data!';
          setTimeout(() => copyBtn.innerText = orig, 2000);
          return;
        }

        const promptTokens = Number(data.promptTokens) || 0;
        const responseTokens = Number(data.responseTokens) || 0;
        const text = `💧 AquaTrace Stats for ${site}\nPrompts: ${data.prompts}\nInput Tokens: ${promptTokens}\nOutput Tokens: ${responseTokens}\nTotal Tokens: ${promptTokens + responseTokens}`;

        if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
          const orig = copyBtn.innerText;
          copyBtn.innerText = 'Copy unavailable';
          setTimeout(() => copyBtn.innerText = orig, 2000);
          return;
        }

        navigator.clipboard.writeText(text).then(() => {
          const orig = copyBtn.innerText;
          copyBtn.innerText = 'Copied!';
          setTimeout(() => copyBtn.innerText = orig, 2000);
        }).catch(() => {
          const orig = copyBtn.innerText;
          copyBtn.innerText = 'Copy failed';
          setTimeout(() => copyBtn.innerText = orig, 2000);
        });
      });
    });
  }
});
