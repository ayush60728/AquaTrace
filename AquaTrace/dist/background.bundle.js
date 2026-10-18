(() => {
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
