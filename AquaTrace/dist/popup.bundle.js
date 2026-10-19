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
      || host === "www.flipkart.com";
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
    if (!response || !response.ok) {
      results.innerHTML = '<p class="aon-status">Product matches are unavailable right now. Local tracking still works.</p>';
      return;
    }
    if (!offers.length) {
      results.innerHTML = '<p class="aon-status">No relevant sponsored products are available right now.</p>';
      return;
    }
    results.innerHTML = offers.map(offer => {
      const title = String(offer.title).trim();
      const description = truncateOfferDescription(offer.description);
      const actionUrl = safeHttpsUrl(offer.actionUrl);
      const imageUrl = getOfferImageUrl(offer);
      const imageMarkup = imageUrl
        ? `<img class="aon-offer-image" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(offer.imageAlt || title)}" referrerpolicy="no-referrer" />`
        : '<div class="aon-offer-image-placeholder" aria-hidden="true">💧</div>';
      return `<article class="aon-offer">
        ${imageMarkup}
        <div class="aon-offer-body">
          <div class="aon-offer-meta">
            <span class="aon-offer-sponsored">Sponsored · ${escapeHtml(offer.entityName || "AON")}</span>
            <span class="aon-offer-price">${escapeHtml(formatAonPrice(offer.price, offer.currency))}</span>
          </div>
          <a class="aon-offer-link aon-offer-title" href="${escapeHtml(actionUrl)}" target="_blank" rel="noopener noreferrer sponsored" referrerpolicy="no-referrer">${escapeHtml(title)}</a>
          ${description ? `<p class="aon-offer-description">${escapeHtml(description)}</p>` : ""}
          <a class="aon-offer-link" href="${escapeHtml(actionUrl)}" target="_blank" rel="noopener noreferrer sponsored" referrerpolicy="no-referrer">${escapeHtml(offer.actionName || "View product")}</a>
        </div>
      </article>`;
    }).join("");
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
    const results = document.getElementById("aonOfferResults");
    const status = document.getElementById("aonProductStatus");
    const preview = document.getElementById("aonProductPreview");
    const titleElement = document.getElementById("aonProductTitle");
    const categoryElement = document.getElementById("aonProductCategory");
    const priceElement = document.getElementById("aonProductPrice");
    if (!form || !button || !results || !status || !preview || !titleElement || !categoryElement || !priceElement) return;

    let productContext = null;

    const showProductContext = product => {
      productContext = normalizeProductContext(product);
      if (!productContext) {
        preview.hidden = true;
        button.disabled = true;
        status.textContent = "Open an Amazon or Flipkart product page to enable product matches.";
        return;
      }
      titleElement.textContent = productContext.title;
      categoryElement.textContent = productContext.category || "Not available";
      priceElement.textContent = formatProductPreviewPrice(productContext);
      preview.hidden = false;
      button.disabled = false;
      status.textContent = "Product data stays in your browser until you choose to search.";
    };

    getActiveProductContext().then(showProductContext).catch(() => showProductContext(null));

    form.addEventListener("submit", async event => {
      event.preventDefault();
      if (!productContext) {
        results.innerHTML = '<p class="aon-status">No product data is available to send.</p>';
        return;
      }
      button.disabled = true;
      results.innerHTML = '<p class="aon-status" role="status">Finding relevant products using only the product fields above...</p>';
      try {
        const response = await chrome.runtime.sendMessage({
          type: "AON_QUERY_PRODUCT",
          product: {
            title: productContext.title,
            category: productContext.category,
            price: productContext.price,
            currency: productContext.currency
          }
        });
        renderAonOffers(response);
      } catch {
        results.innerHTML = "<p class=\"aon-status\">We couldn't load product matches right now. Local tracking still works.</p>";
      } finally {
        button.disabled = !productContext;
      }
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
  L && L.addEventListener("click",
    () => {
      document.body.classList.toggle("dark-theme");
      try {
        localStorage.setItem("theme",
          document.body.classList.contains("dark-theme") ? "dark" : "light")
      } catch { }
    });
  try {
    (localStorage.getItem("theme")==="dark" || (!localStorage.getItem("theme") && window.matchMedia("(prefers-color-scheme: dark)").matches)) && document.body.classList.add("dark-theme")
  } catch { }

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
