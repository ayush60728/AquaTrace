(() => {
  try { importScripts("../aon-config.js"); } catch (error) { /* tests may provide config directly */ }

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
  const AON_SANDBOX_PLACEMENT_ID = "plc_public_test_sandbox";
  const AON_DEFAULT_ORIGIN = "https://api.aon.pro";
  const AON_QUERY_TIMEOUT_MS = 8000;

  function getAonConfig() {
    const config = globalThis.AON_CONFIG || {};
    return {
      placementId: String(config.placementId || globalThis.AON_PLACEMENT_ID || "").trim(),
      apiOrigin: String(config.apiOrigin || AON_DEFAULT_ORIGIN).replace(/\/$/, ""),
      // A key is only valid for the public sandbox. Live Offer Query calls do
      // not send an API key, and this value is absent from the live config.
      apiKey: config.apiKey ? String(config.apiKey).trim() : ""
    };
  }

  function safeOfferUrl(value) {
    try {
      const url = new URL(String(value || ""));
      return url.protocol === "https:" && !url.username && !url.password ? url.href : "";
    } catch {
      return "";
    }
  }

  function normalizeAonOffer(offer) {
    const info = offer && offer.offer_info;
    const action = offer && offer.action;
    const commercial = info && info.commercial;
    const displayPrice = commercial && (commercial.display_price || commercial.price);
    if (!offer || !info || !action || !action.payload || !info.title) return null;
    const actionUrl = safeOfferUrl(action.payload.url);
    if (!actionUrl) return null;
    return {
      offerId: typeof offer.offer_id === "string" ? offer.offer_id : "",
      offerInstanceId: typeof offer.offer_instance_id === "string" ? offer.offer_instance_id : "",
      title: String(info.title),
      description: String(info.short_description || info.description || ""),
      entityName: offer.entity && typeof offer.entity.name === "string" ? offer.entity.name : "",
      price: displayPrice && displayPrice.amount ? String(displayPrice.amount) : "",
      currency: displayPrice && displayPrice.currency ? String(displayPrice.currency) : "",
      actionUrl,
      actionName: action.name ? String(action.name) : "Learn more",
      matchReason: offer.match_reason ? String(offer.match_reason) : "",
      offerType: info.offer_type ? String(info.offer_type) : ""
    };
  }

  async function queryAonOffers(intentText) {
    const intent = String(intentText || "").trim();
    if (!intent || intent.length > 200) {
      return { ok: false, code: "INVALID_INTENT", message: "Enter an intent between 1 and 200 characters." };
    }

    const config = getAonConfig();
    if (!config.placementId) {
      return { ok: false, code: "AON_NOT_CONFIGURED", message: "Offers are not configured yet." };
    }

    const controller = new AbortController();
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
      context: {
        platform: { name: "AquaTrace", channel: "browser_extension" }
      }
    };

    try {
      const response = await fetch(`${config.apiOrigin}/v1/offers/query`, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });
      let payload = null;
      try { payload = await response.json(); } catch { payload = null; }
      if (!response.ok) {
        return { ok: false, code: "AON_UNAVAILABLE", message: "Offers are unavailable right now." };
      }
      const data = payload && payload.data;
      const offers = data && Array.isArray(data.offers)
        ? data.offers.map(normalizeAonOffer).filter(Boolean)
        : [];
      return {
        ok: true,
        isTest: Boolean(data && data.extra && data.extra.is_test),
        requestId: data && typeof data.request_id === "string" ? data.request_id : "",
        offers
      };
    } catch (error) {
      return {
        ok: false,
        code: error && error.name === "AbortError" ? "AON_TIMEOUT" : "AON_UNAVAILABLE",
        message: "Offers are unavailable right now. Your AquaTrace tracking still works."
      };
    } finally {
      clearTimeout(timeout);
    }
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
    if (e.type === "AON_QUERY_OFFERS") {
      queryAonOffers(e.intent).then(t);
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

  chrome.runtime.onInstalled.addListener(async () => {
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
