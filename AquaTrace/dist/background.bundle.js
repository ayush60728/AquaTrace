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

  async function n() {
    let r = (await chrome.storage.local.get("waterTrackerState")).waterTrackerState || { bySite: {} };
    r.bySite || (r.bySite = {});
    Object.values(r.bySite).forEach(t => {
      c[t.modelId] || (t.modelId = p);
    });
    return r;
  }

  async function i(e) {
    await chrome.storage.local.set({ waterTrackerState: e });
    let r = Object.values(e.bySite).reduce((t, o) => t + o.prompts, 0);
    l(r);
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
      return (async () => {
        let o = await n(),
          a = d(o, e.site);
        a.prompts += 1;
        a.promptTokens += e.promptTokens || 0;
        a.responseTokens += e.responseTokens || 0;
        !a.userOverride && e.detectedModelId && c[e.detectedModelId] && (a.modelId = e.detectedModelId);
        await i(o);
        t({ ok: !0 });
      })(), !0;

    if (e.type === "SET_MODEL")
      return (async () => {
        let o = await n(),
          a = d(o, e.site);
        c[e.modelId] && (a.modelId = e.modelId, a.userOverride = !0, await i(o));
        t({ ok: !0 });
      })(), !0;

    if (e.type === "USE_AUTO_DETECT")
      return (async () => {
        let o = await n(),
          a = d(o, e.site);
        a.userOverride = !1;
        await i(o);
        t({ ok: !0 });
      })(), !0;

    if (e.type === "RESET_SITE")
      return (async () => {
        let o = await n();
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
          await i(o);
        }
        t({ ok: !0 });
      })(), !0;

    if (e.type === "RESET_ALL")
      return (async () => (await i({ bySite: {} }), t({ ok: !0 })))(), !0;
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
