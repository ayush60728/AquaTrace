(() => {
  try { importScripts("../aon-config.js"); } catch (error) { /* tests may provide config directly */ }
  try { importScripts("../shopping-session.js"); } catch (error) { /* optional tab-session bridge */ }

  var c = {
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
  };

  var s = {
    "chatgpt.com": "gpt-4o",
    "chat.openai.com": "gpt-4o",
    "claude.ai": "claude-sonnet",
    "gemini.google.com": "gemini-flash",
    "chat.deepseek.com": "deepseek-v3"
  };

  var p = "gpt-4o-mini";
  const HISTORY_LIMIT = 100; // state.history is retained newest first.

  const AON_PROTOCOL_VERSION = "1.0";
  const AON_LIVE_PLACEMENT_ID = "plc_JzfXkYlJazVljtml";
  const AON_SANDBOX_PLACEMENT_ID = "plc_public_test_sandbox";
  const AON_DEFAULT_ORIGIN = "https://api.aon.pro";
  const AON_QUERY_ENDPOINT = `${AON_DEFAULT_ORIGIN}/v1/offers/query`;
  const AON_QUERY_TIMEOUT_MS = 8000;
  const AON_CACHE_TTL_MS = 10 * 60 * 1000;
  const AON_DAILY_REQUEST_LIMIT = 50;
  const AON_AUTO_MATCHES_KEY = "aonAutoMatchesEnabled";
  const AON_CACHE_STORAGE_KEY = "aonOfferQueryCache";
  const AON_LAST_OFFERS_STORAGE_KEY = "aonLastNonEmptyOffers";
  const AON_QUOTA_STORAGE_KEY = "aonOfferQueryQuota";
  const AON_GENERIC_INTENT = "Show me relevant offers";

  function getAonConfig() {
    const config = globalThis.AON_CONFIG || {};
    const placementId = String(config.placementId || globalThis.AON_PLACEMENT_ID || "").trim();
    return {
      placementId,
      // Live traffic must always use the production AON endpoint. Keeping a
      // configurable origin is useful for the public sandbox and test harness.
      apiOrigin: placementId === AON_LIVE_PLACEMENT_ID
        ? AON_DEFAULT_ORIGIN
        : String(config.apiOrigin || AON_DEFAULT_ORIGIN).replace(/\/$/, ""),
      // A key is only valid for the public sandbox. Live Offer Query calls do
      // not send an API key, and this value is absent from the live config.
      apiKey: config.apiKey ? String(config.apiKey).trim() : ""
    };
  }

  function getChromeStorageArea(name) {
    try {
      if (typeof chrome === "undefined" || !chrome.storage) return null;
      const area = chrome.storage[name];
      return area && typeof area.get === "function" && typeof area.set === "function" ? area : null;
    } catch {
      return null;
    }
  }

  async function readChromeStorage(area, key) {
    if (!area) return null;
    try {
      return await area.get(key);
    } catch {
      return null;
    }
  }

  async function writeChromeStorage(area, value) {
    if (!area) return false;
    try {
      await area.set(value);
      return true;
    } catch {
      return false;
    }
  }

  function cleanAonProductValue(value, limit) {
    if (typeof value !== "string" && typeof value !== "number") return "";
    return String(value)
      .replace(/(?:\b[a-z][a-z\d+.-]*:\/\/|\bwww\.|\/\/)\S+/gi, "")
      .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, limit)
      .trim();
  }

  function cleanAonIntent(value) {
    return cleanAonProductValue(value, 200);
  }

  function normalizeAonProduct(product) {
    if (!product || typeof product !== "object") return null;
    const title = cleanAonProductValue(product.title, 200);
    const rawCategory = cleanAonProductValue(product.category, 121);
    const category = rawCategory.length <= 60 ? rawCategory : "";
    if (!title && !category) return null;
    const rawCurrency = cleanAonProductValue(product.currency, 3).toUpperCase();
    const currency = /^[A-Z]{3}$/.test(rawCurrency) ? rawCurrency : "";
    const rawPrice = cleanAonProductValue(product.price, 32).replace(/,/g, "");
    const price = currency && /^\d+(?:\.\d{1,2})?$/.test(rawPrice) ? rawPrice : "";
    return { title, category, price, currency };
  }

  function productToAonIntent(product) {
    // Keep the specific title first (not the brand/model fallback), reserving
    // room for the category and price within AON's 200-character total limit.
    const suffix = (product.category ? `; Category: ${product.category}` : "")
      + (product.price && product.currency ? `; Price: ${product.price} ${product.currency}` : "");
    const title = product.title.slice(0, 200 - "Product title: ".length - suffix.length).trim();
    return cleanAonIntent(`Product title: ${title}${suffix}`);
  }

  function brandModelIntent(value) {
    const lead = cleanAonIntent(String(value || "").split(/[,\u003A]/, 1)[0]);
    if (lead.length <= 80) return lead;
    const cut = lead.slice(0, 80);
    return cut.slice(0, cut.lastIndexOf(" ") > 0 ? cut.lastIndexOf(" ") : 80).trim();
  }

  function categoryWordIntent(value) {
    const words = cleanAonIntent(value).split(/[\s>/,&]+/).filter(Boolean);
    return words.length ? cleanAonIntent(words[words.length - 1]) : "";
  }

  function buildAonIntentCandidates(product, suppliedIntents) {
    const normalized = normalizeAonProduct(product);
    const specific = normalized ? productToAonIntent(normalized) : "";
    const title = normalized && normalized.title ? normalized.title : "";
    const category = normalized && normalized.category ? normalized.category : "";
    const supplied = Array.isArray(suppliedIntents) ? suppliedIntents.slice(0, 4) : [];
    const candidates = normalized
      ? [specific, brandModelIntent(title), categoryWordIntent(category), AON_GENERIC_INTENT]
      : supplied;
    if (!candidates.length) candidates.push(AON_GENERIC_INTENT);
    const seen = new Set();
    return candidates.map(cleanAonIntent).filter(intent => {
      const key = intent.toLowerCase();
      if (!intent || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function cleanAonOfferValue(value, limit) {
    if (typeof value !== "string" && typeof value !== "number") return "";
    return String(value)
      .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, limit)
      .trim();
  }

  function safeOfferUrl(value) {
    const rawUrl = typeof value === "string" ? value : "";
    if (!/^https:\/\//i.test(rawUrl) || /[\s\u0000-\u001f\u007f-\u009f]/.test(rawUrl)) return "";
    try {
      const url = new URL(rawUrl);
      // Validate without rewriting signed/tracking URLs or adding click reports.
      return url.protocol === "https:" && !url.username && !url.password ? rawUrl : "";
    } catch {
      return "";
    }
  }

  function normalizeAonOfferPrice(value) {
    const price = cleanAonOfferValue(value, 32).replace(/,/g, "");
    return /^\d+(?:\.\d{1,2})?$/.test(price) ? price : "";
  }

  function normalizeAonOfferCurrency(value) {
    const currency = cleanAonOfferValue(value, 3).toUpperCase();
    return /^[A-Z]{3}$/.test(currency) ? currency : "";
  }

  function normalizeAonOffer(offer) {
    const info = offer && offer.offer_info;
    const action = offer && offer.action;
    const commercial = info && info.commercial;
    const displayPrice = commercial && (commercial.display_price || commercial.price);
    const material = Array.isArray(offer && offer.material) ? offer.material : [];
    const imageMaterial = material.find(asset => asset && asset.format === "image" && safeOfferUrl(asset.url));
    const listingSource = offer && offer.listing_source;
    const entity = offer && offer.entity;
    const title = cleanAonOfferValue(info && info.title, 200);
    if (!offer || !info || !action || !action.payload || !title) return null;
    const actionUrl = safeOfferUrl(action.payload.url);
    if (!actionUrl) return null;
    return {
      offerId: cleanAonOfferValue(offer.offer_id, 128),
      offerInstanceId: cleanAonOfferValue(offer.offer_instance_id, 128),
      title,
      description: cleanAonOfferValue(info.short_description || info.description, 500),
      entityName: cleanAonOfferValue(
        listingSource && listingSource.name
          ? listingSource.name
          : entity && entity.name,
        160
      ),
      source: cleanAonOfferValue(
        listingSource && listingSource.name
          ? listingSource.name
          : entity && entity.name,
        160
      ),
      price: normalizeAonOfferPrice(displayPrice && displayPrice.amount),
      currency: normalizeAonOfferCurrency(displayPrice && displayPrice.currency),
      imageUrl: imageMaterial ? safeOfferUrl(imageMaterial.url) : "",
      imageAlt: cleanAonOfferValue(imageMaterial && imageMaterial.alt_text, 160),
      actionUrl,
      actionName: cleanAonOfferValue(action.name, 80) || "View deal",
      matchReason: cleanAonOfferValue(offer.match_reason, 240),
      offerType: cleanAonOfferValue(info.offer_type, 80)
    };
  }

  const aonMemoryCache = new Map();
  const aonInFlight = new Map();
  const aonControllers = new Set();
  let aonConsentRevision = 0;
  let aonQuotaQueue = Promise.resolve();
  let aonCacheQueue = Promise.resolve();

  // Aborting cannot undo a request already delivered, but it prevents a late
  // response or a queued fallback from restarting offers after opt-out.
  if (chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes[AON_AUTO_MATCHES_KEY]) return;
      aonConsentRevision += 1;
      if (changes[AON_AUTO_MATCHES_KEY].newValue !== true) {
        for (const controller of aonControllers) controller.abort();
      }
    });
  }

  function aonDayKey(timestamp = Date.now()) {
    return new Date(timestamp).toISOString().slice(0, 10);
  }

  function cloneAonResult(result) {
    try {
      return JSON.parse(JSON.stringify(result));
    } catch {
      return result;
    }
  }

  function aonCacheKey(config, intent) {
    return JSON.stringify({ version: AON_PROTOCOL_VERSION, origin: config.apiOrigin, placementId: config.placementId, intent });
  }

  function isFreshAonCacheEntry(entry, now) {
    return Boolean(entry && Number.isFinite(entry.timestamp)
      && now >= entry.timestamp && now - entry.timestamp < AON_CACHE_TTL_MS
      && entry.result && entry.result.ok === true && Array.isArray(entry.result.offers));
  }

  async function readAonCacheEntry(key) {
    const now = Date.now();
    const memoryEntry = aonMemoryCache.get(key);
    if (isFreshAonCacheEntry(memoryEntry, now)) {
      return cloneAonResult(memoryEntry.result);
    }
    if (memoryEntry) aonMemoryCache.delete(key);

    const session = getChromeStorageArea("session");
    const stored = await readChromeStorage(session, AON_CACHE_STORAGE_KEY);
    const cache = stored && stored[AON_CACHE_STORAGE_KEY];
    const entry = cache && typeof cache === "object" ? cache[key] : null;
    if (!isFreshAonCacheEntry(entry, now)) return null;
    const result = entry.result;
    aonMemoryCache.set(key, entry);
    return cloneAonResult(result);
  }

  function writeAonCacheEntry(key, result) {
    const entry = { timestamp: Date.now(), result: cloneAonResult(result) };
    aonMemoryCache.set(key, entry);
    while (aonMemoryCache.size > 100) {
      aonMemoryCache.delete(aonMemoryCache.keys().next().value);
    }

    const task = aonCacheQueue.then(async () => {
      const session = getChromeStorageArea("session");
      if (!session) return;
      const stored = await readChromeStorage(session, AON_CACHE_STORAGE_KEY);
      const cache = stored && stored[AON_CACHE_STORAGE_KEY] && typeof stored[AON_CACHE_STORAGE_KEY] === "object"
        ? { ...stored[AON_CACHE_STORAGE_KEY] }
        : {};
      const now = Date.now();
      Object.keys(cache).forEach(cacheKey => {
        if (!isFreshAonCacheEntry(cache[cacheKey], now)) delete cache[cacheKey];
      });
      cache[key] = entry;
      const cacheKeys = Object.keys(cache);
      while (cacheKeys.length > 100) delete cache[cacheKeys.shift()];
      await writeChromeStorage(session, { [AON_CACHE_STORAGE_KEY]: cache });
    });
    aonCacheQueue = task.catch(() => {});
    return aonCacheQueue;
  }

  async function writeLastAonOffers(result) {
    if (!result || result.ok !== true || !Array.isArray(result.offers) || !result.offers.length) return;
    const session = getChromeStorageArea("session");
    if (!session) return;
    await writeChromeStorage(session, {
      [AON_LAST_OFFERS_STORAGE_KEY]: {
        timestamp: Date.now(),
        offers: result.offers.slice(0, 3)
      }
    });
  }

  function aonUnavailable() {
    return { ok: false, code: "AON_UNAVAILABLE", message: "Offers are unavailable right now. Your AquaTrace tracking still works." };
  }

  function aonDisabled() {
    return { ok: false, code: "AON_AUTO_MATCHES_DISABLED", message: "Automatic product matches are disabled." };
  }

  // Serialize only the quota reservation, never tracking operations or fetches.
  // Persist before sending so worker/browser restarts cannot reset the daily cap.
  function reserveAonRequest() {
    const task = aonQuotaQueue.then(async () => {
      const local = getChromeStorageArea("local");
      const stored = await readChromeStorage(local, [AON_AUTO_MATCHES_KEY, AON_QUOTA_STORAGE_KEY]);
      if (!stored) return aonUnavailable();
      if (stored[AON_AUTO_MATCHES_KEY] !== true) return aonDisabled();
      const saved = stored[AON_QUOTA_STORAGE_KEY];
      const day = aonDayKey();
      const count = saved && saved.day === day
        ? Number.isInteger(saved.count) && saved.count >= 0 ? saved.count : AON_DAILY_REQUEST_LIMIT
        : 0;
      if (count >= AON_DAILY_REQUEST_LIMIT) {
        return { ok: false, code: "AON_DAILY_LIMIT", message: "The daily offer-search limit has been reached." };
      }
      const written = await writeChromeStorage(local, { [AON_QUOTA_STORAGE_KEY]: { day, count: count + 1 } });
      return written ? null : aonUnavailable();
    });
    aonQuotaQueue = task.catch(() => {});
    return task;
  }

  async function aonAutoMatchesAreEnabled() {
    const local = getChromeStorageArea("local");
    const stored = await readChromeStorage(local, AON_AUTO_MATCHES_KEY);
    return Boolean(stored && stored[AON_AUTO_MATCHES_KEY] === true);
  }

  async function fetchAonOffers(config, intent) {
    const controller = new AbortController();
    aonControllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), AON_QUERY_TIMEOUT_MS);
    const headers = {
      "Content-Type": "application/json",
      "AON-Protocol-Version": AON_PROTOCOL_VERSION,
      "X-AON-Placement-Id": config.placementId
    };
    // The public test pair is the only supported API-key path for this client.
    if (config.placementId === AON_SANDBOX_PLACEMENT_ID && config.apiKey) {
      headers.Authorization = `Bearer ${config.apiKey}`;
    }

    const requestBody = {
      intent: {
        content: [{ type: "input_text", text: intent }],
        provenance: "user_expressed"
      },
      // Keep context empty: no platform, tab, session, history, or user data
      // is sent in addition to the allowlisted product intent above.
      context: {}
    };

    try {
      const endpoint = config.placementId === AON_LIVE_PLACEMENT_ID
        ? AON_QUERY_ENDPOINT
        : `${config.apiOrigin}/v1/offers/query`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal,
        credentials: "omit",
        referrerPolicy: "no-referrer",
        redirect: "error"
      });
      let traceId = "";
      try {
        traceId = response.headers && typeof response.headers.get === "function"
          ? String(response.headers.get("x-aon-trace-id") || "").trim()
          : "";
      } catch { traceId = ""; }
      if (traceId) {
        try {
          if (typeof console !== "undefined" && typeof console.info === "function") {
            console.info("[AON] x-aon-trace-id:", traceId);
          }
        } catch { /* tracing must not affect the offer response */ }
      }

      let payload = null;
      try { payload = await response.json(); } catch (error) {
        if (error && error.name === "AbortError") throw error;
        payload = null;
      }
      const status = Number(response.status);
      if (!Number.isInteger(status) || status < 200 || status > 299) {
        return { ok: false, code: "AON_UNAVAILABLE", message: "Offers are unavailable right now." };
      }
      if (!payload || payload.code !== "SUCCESS") {
        return { ok: false, code: "AON_INVALID_RESPONSE", message: "Offers are unavailable right now." };
      }
      const data = payload && payload.data;
      if (!data || data.protocol_version !== AON_PROTOCOL_VERSION || !Array.isArray(data.offers)) {
        return { ok: false, code: "AON_INVALID_RESPONSE", message: "Offers are unavailable right now." };
      }
      const offers = data.offers.slice(0, 50).map(normalizeAonOffer).filter(Boolean);
      return {
        ok: true,
        isTest: Boolean(payload && payload.extra && payload.extra.is_test),
        requestId: cleanAonOfferValue(data.request_id, 128),
        offers
      };
    } catch (error) {
      return {
        ok: false,
        code: error && error.name === "AbortError" ? "AON_TIMEOUT" : "AON_UNAVAILABLE",
        message: "Offers are unavailable right now. Your AquaTrace tracking still works."
      };
    } finally {
      aonControllers.delete(controller);
      clearTimeout(timeout);
    }
  }

  async function queryAonOffers(intentText) {
    const rawIntent = typeof intentText === "string" ? intentText.trim() : "";
    const intent = cleanAonIntent(rawIntent);
    if (!intent) {
      return { ok: false, code: "INVALID_INTENT", message: "Enter an intent between 1 and 200 characters." };
    }

    // Enforce the stored switch for every entry point. A caller-controlled
    // `automatic: false` flag must not bypass the user's disabled preference.
    const revision = aonConsentRevision;
    if (!await aonAutoMatchesAreEnabled() || revision !== aonConsentRevision) return aonDisabled();

    const config = getAonConfig();
    if (!config.placementId) {
      return { ok: false, code: "AON_NOT_CONFIGURED", message: "Offers are not configured yet." };
    }

    const cacheKey = aonCacheKey(config, intent);
    const cached = await readAonCacheEntry(cacheKey);
    if (revision !== aonConsentRevision) return aonDisabled();
    if (cached) {
      await writeLastAonOffers(cached);
      return cached;
    }
    const existing = aonInFlight.get(cacheKey);
    if (existing) return cloneAonResult(await existing);

    const request = (async () => {
      const reservationError = await reserveAonRequest();
      if (reservationError) return reservationError;
      // Recheck after async cache/quota work in case the user disabled matches.
      if (!await aonAutoMatchesAreEnabled() || revision !== aonConsentRevision) return aonDisabled();
      const result = await fetchAonOffers(config, intent);
      if (revision !== aonConsentRevision || !await aonAutoMatchesAreEnabled()) return aonDisabled();
      if (result.ok) {
        await writeAonCacheEntry(cacheKey, result);
        await writeLastAonOffers(result);
      }
      return result;
    })();
    aonInFlight.set(cacheKey, request);
    try {
      return cloneAonResult(await request);
    } finally {
      if (aonInFlight.get(cacheKey) === request) aonInFlight.delete(cacheKey);
    }
  }

  async function queryAonIntentCandidates(intents) {
    const candidates = Array.isArray(intents) ? intents : [];
    const revision = aonConsentRevision;
    let lastResult = { ok: true, offers: [] };
    for (const intent of candidates) {
      if (revision !== aonConsentRevision) return aonDisabled();
      const result = await queryAonOffers(intent);
      lastResult = result;
      if (!result.ok || result.offers.length) return result;
    }
    return lastResult;
  }

  async function queryAonProductOffers(product, suppliedIntents) {
    const candidates = buildAonIntentCandidates(product, suppliedIntents);
    return queryAonIntentCandidates(candidates);
  }

  async function n() {
    let r = (await chrome.storage.local.get("waterTrackerState")).waterTrackerState || { bySite: {}, history: [] };
    r.bySite || (r.bySite = {});
    r.history = Array.isArray(r.history) ? r.history.slice(0, HISTORY_LIMIT) : [];
    Object.values(r.bySite).forEach(t => {
      c[t.modelId] || (t.modelId = p);
    });
    return r;
  }

  async function i(e) {
    try { await chrome.storage.local.set({ waterTrackerState: e }); } catch(err) { chrome.action.setBadgeText({ text: "ERR" }); return !1; }
    let r = Object.values(e.bySite).reduce((t, o) => t + o.prompts, 0);
    l(r);
    return !0;
  }

  let operationQueue = Promise.resolve();

  function enqueueOperation(e, r) {
    let t = operationQueue.then(e);
    operationQueue = t.catch(() => {});
    t.then(e => r({ ok: e !== !1 }), () => r({ ok: !1 }));
    return !0;
  }

  function l(e) {
    chrome.action.setBadgeText({ text: e > 0 ? String(e) : "" });
    chrome.action.setBadgeBackgroundColor({ color: "#2979FF" });
  }

  function d(e, r) {
    if (!e.bySite[r]) {
      let t = s[r] || p;
      e.bySite[r] = {
        modelId: c[t] ? t : p,
        prompts: 0,
        promptTokens: 0,
        responseTokens: 0,
        userOverride: !1
      };
    }
    return e.bySite[r];
  }

  chrome.runtime.onMessage.addListener((e, r, t) => {
    if (!e || typeof e !== "object") return;
    if (e.type === "AON_AUTO_MATCHES_CHANGED") {
      if (typeof t === "function") t({ ok: true });
      return true;
    }

    if (e.type === "AON_QUERY_PRODUCT") {
      queryAonProductOffers(e.product, e.intents).then(t, () => t(aonUnavailable()));
      return true;
    }

    if (e.type === "AON_QUERY_TEXT") {
      queryAonOffers(e.text ?? e.intent).then(t, () => t(aonUnavailable()));
      return true;
    }

    if (e.type === "AON_QUERY_INTENTS") {
      queryAonIntentCandidates(buildAonIntentCandidates(null, e.intents)).then(t, () => t(aonUnavailable()));
      return true;
    }

    if (e.type === "PROMPT_SENT")
      return enqueueOperation(async () => {
        let o = await n(),
          a = d(o, e.site);
        let promptTokens = e.promptTokens || 0,
          responseTokens = e.responseTokens || 0;
        a.prompts += 1;
        a.promptTokens += promptTokens;
        a.responseTokens += responseTokens;
        !a.userOverride && e.detectedModelId && c[e.detectedModelId] && (a.modelId = e.detectedModelId);
        o.history.unshift({
          timestamp: Date.now(),
          site: e.site,
          modelId: a.modelId,
          promptTokens: promptTokens,
          responseTokens: responseTokens
        });
        o.history.length = Math.min(o.history.length, HISTORY_LIMIT);
        return i(o);
      }, t);

    if (e.type === "SET_MODEL")
      return enqueueOperation(async () => {
        let o = await n(),
          a = d(o, e.site);
        if (c[e.modelId]) {
          a.modelId = e.modelId;
          a.userOverride = !0;
          return i(o);
        }
      }, t);

    if (e.type === "USE_AUTO_DETECT")
      return enqueueOperation(async () => {
        let o = await n(),
          a = d(o, e.site);
        let defaultModel = s[e.site] || p;
        a.modelId = c[defaultModel] ? defaultModel : p;
        a.userOverride = !1;
        return i(o);
      }, t);

    if (e.type === "RESET_SITE")
      return enqueueOperation(async () => {
        let o = await n();
        let historyLength = o.history.length;
        o.history = o.history.filter(a => a.site !== e.site);
        if (o.bySite[e.site]) {
          let a = o.bySite[e.site].modelId;
          let userPref = o.bySite[e.site].userOverride || !1;
          o.bySite[e.site] = {
            modelId: a,
            prompts: 0,
            promptTokens: 0,
            responseTokens: 0,
            userOverride: userPref
          };
          return i(o);
        }
        if (o.history.length !== historyLength) return i(o);
      }, t);

    if (e.type === "RESET_ALL")
      return enqueueOperation(() => i({ bySite: {}, history: [] }), t);
  });

  chrome.runtime.onInstalled.addListener(async details => {
    // This migration marker records the automatic shopping/search consent
    // introduced before 2.0. Ask once on install/upgrade, never precheck.
    if (details && ["install", "update"].includes(details.reason)) {
      try {
        const key = "aonShoppingOnboardingVersion";
        const stored = await chrome.storage.local.get(key);
        if (stored[key] !== "1.3.0") {
          await chrome.storage.local.set({ [AON_AUTO_MATCHES_KEY]: false, [key]: "1.3.0" });
          await chrome.tabs.create({ url: chrome.runtime.getURL("onboarding.html") });
        }
      } catch { /* Never let onboarding failures interrupt local AI tracking. */ }
    }
    let e = await n(),
      r = Object.values(e.bySite).reduce((t, o) => t + o.prompts, 0);
    l(r);
  });

  chrome.runtime.onStartup.addListener(async () => {
    let e = await n(),
      r = Object.values(e.bySite).reduce((t, o) => t + o.prompts, 0);
    l(r);
  });
})();
