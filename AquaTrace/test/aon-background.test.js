"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "dist", "background.bundle.js"), "utf8");
const LIVE_PLACEMENT = "plc_JzfXkYlJazVljtml";
const START = Date.parse("2026-10-20T12:00:00Z");
const clone = value => JSON.parse(JSON.stringify(value));
const textQuery = text => ({ type: "AON_QUERY_TEXT", text });

function offer(overrides = {}) {
  return {
    offer_id: "offer-1",
    offer_instance_id: "instance-1",
    offer_info: {
      title: "A useful product",
      description: "Product description",
      commercial: { price: { amount: "19.99", currency: "USD" } }
    },
    entity: { name: "Example Store" },
    action: { type: "open_url", name: "View offer", payload: { url: "https://example.test/item?ref=aon" } },
    material: [{ format: "image", url: "https://example.test/image.png", alt_text: "Product" }],
    ...overrides
  };
}

function response({ offers = [], code = "SUCCESS", version = "1.0", status = 200, trace = "" } = {}) {
  return {
    status,
    headers: { get: name => name === "x-aon-trace-id" ? trace : null },
    json: async () => ({ code, data: { protocol_version: version, request_id: "request-1", offers } })
  };
}

function background(options = {}) {
  const local = options.local || { aonAutoMatchesEnabled: true };
  const session = options.session || {};
  const calls = [];
  const logs = [];
  const timers = new Map();
  const clearedTimers = [];
  const badges = [];
  const events = {};
  const storageListeners = [];
  const openedTabs = [];
  let now = options.now ?? START;
  let listener;
  let timerId = 0;
  const storageArea = (data, name) => ({
    async get(keys) {
      if (options.failGet === name) throw new Error("Storage unavailable");
      const selected = {};
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        if (Object.hasOwn(data, key)) selected[key] = data[key];
      }
      return clone(selected);
    },
    async set(values) {
      if (options.failSet === name) throw new Error("Storage unavailable");
      const changes = Object.fromEntries(Object.keys(values).map(key => [key, { oldValue: data[key], newValue: values[key] }]));
      Object.assign(data, clone(values));
      storageListeners.forEach(callback => callback(changes, name));
    }
  });
  const context = {
    AON_CONFIG: options.config || { placementId: LIVE_PLACEMENT, apiOrigin: "https://api.aon.pro" },
    AbortController,
    URL,
    Date: class extends Date {
      constructor(...args) { super(...(args.length ? args : [now])); }
      static now() { return now; }
    },
    console: { info: (...args) => logs.push(args) },
    importScripts() {},
    setTimeout(callback, delay) { timers.set(++timerId, { callback, delay }); return timerId; },
    clearTimeout(id) { clearedTimers.push(id); timers.delete(id); },
    async fetch(url, init) {
      calls.push({ url, init });
      return options.fetch ? options.fetch(url, init, calls.length) : response({ offers: [offer()] });
    },
    chrome: {
      action: { setBadgeText: value => badges.push(value.text), setBadgeBackgroundColor() {} },
      storage: { local: storageArea(local, "local"), session: storageArea(session, "session"),
        onChanged: { addListener: callback => storageListeners.push(callback) } },
      tabs: { create: async options => { openedTabs.push(options); } },
      runtime: {
        getURL: file => `chrome-extension://test/${file}`,
        onMessage: { addListener: callback => { listener = callback; } },
        onInstalled: { addListener: callback => { events.installed = callback; } },
        onStartup: { addListener: callback => { events.startup = callback; } }
      }
    }
  };
  vm.runInNewContext(source, context, { filename: "background.bundle.js" });
  return {
    local, session, calls, logs, timers, clearedTimers, badges, events, openedTabs,
    changePreference: enabled => context.chrome.storage.local.set({ aonAutoMatchesEnabled: enabled }),
    setNow(value) { now = value; },
    send(message) {
      return new Promise(resolve => {
        assert.equal(listener(message, {}, result => resolve(clone(result))), true);
      });
    }
  };
}

async function until(predicate) {
  for (let count = 0; count < 100; count += 1) {
    if (predicate()) return;
    await Promise.resolve();
  }
  assert.fail("Expected background operation did not start");
}

test("generic text queries use the fixed credential-free live endpoint and log only the trace id", async () => {
  const worker = background({
    config: { placementId: LIVE_PLACEMENT, apiOrigin: "https://ignored.test", apiKey: "not-a-live-key" },
    fetch: async () => response({ offers: [offer()], trace: "trace-123" })
  });
  const result = await worker.send({ ...textQuery("  noise cancelling headphones  "),
    context: { pageUrl: "https://private.test", history: "private" } });
  assert.equal(result.ok, true);
  assert.equal(result.offers[0].title, "A useful product");
  assert.equal(worker.calls.length, 1);
  const { url, init } = worker.calls[0];
  assert.equal(url, "https://api.aon.pro/v1/offers/query");
  assert.equal(init.method, "POST");
  assert.deepEqual(clone(init.headers), {
    "Content-Type": "application/json",
    "AON-Protocol-Version": "1.0",
    "X-AON-Placement-Id": LIVE_PLACEMENT
  });
  assert.equal(init.credentials, "omit");
  assert.equal(init.referrerPolicy, "no-referrer");
  assert.equal(init.redirect, "error");
  assert.deepEqual(JSON.parse(init.body), {
    intent: { content: [{ type: "input_text", text: "noise cancelling headphones" }], provenance: "user_expressed" },
    context: {}
  });
  assert.deepEqual(worker.logs, [["[AON] x-aon-trace-id:", "trace-123"]]);
  assert.equal(worker.local.aonOfferQueryQuota.count, 1);
  assert.equal(worker.timers.size, 0);
  assert.equal(worker.clearedTimers.length, 1);
});

test("text queries reject empty, non-text, and URL-only input before sending", async () => {
  const worker = background();
  for (const text of ["", "   ", null, {}, 123, "https://private.test/account", "www.private.test", "ftp://private.test"]) {
    const result = await worker.send(textQuery(text));
    assert.equal(result.code, "INVALID_INTENT");
  }
  assert.equal(worker.calls.length, 0);
  assert.equal(worker.local.aonOfferQueryQuota, undefined);
});

test("response envelope, protocol version, HTTP failures, and malformed JSON are checked", async () => {
  const cases = [
    [response({ code: "ERROR" }), "AON_INVALID_RESPONSE"],
    [response({ version: "2.0" }), "AON_INVALID_RESPONSE"],
    [response({ version: 1 }), "AON_INVALID_RESPONSE"],
    [response({ offers: null }), "AON_INVALID_RESPONSE"],
    [response({ status: 503 }), "AON_UNAVAILABLE"],
    [{ ...response(), json: async () => { throw new SyntaxError("bad JSON"); } }, "AON_INVALID_RESPONSE"]
  ];
  for (const [reply, code] of cases) {
    const worker = background({ fetch: async () => reply });
    const result = await worker.send(textQuery("product"));
    assert.equal(result.code, code);
    assert.equal(worker.session.aonOfferQueryCache, undefined);
    assert.equal(worker.local.aonOfferQueryQuota.count, 1);
  }
});

test("normalization allowlists bounded scalar fields and credential-free HTTPS links", async () => {
  const badLinks = ["javascript:alert(1)", "http://example.test", "https://user:pass@example.test", "data:text/plain,test"];
  const replies = badLinks.map(url => offer({ action: { payload: { url } } }));
  replies.push(offer({ offer_info: { title: { html: "Not a title" } } }));
  replies.push(offer({
    offer_info: { title: " Clean\n title ", description: "x".repeat(800), commercial: { price: { amount: 0, currency: "usd" } } },
    material: [{ format: "image", url: "https://user:pass@example.test/image" }],
    internal_data: { secret: "must not escape" },
    action: { name: { html: "not a label" }, payload: { url: "https://example.test/safe", secret: "must not escape" } }
  }));
  const worker = background({ fetch: async () => response({ offers: replies }) });
  const result = await worker.send(textQuery("product"));
  assert.equal(result.offers.length, 1);
  const normalized = result.offers[0];
  assert.equal(normalized.title, "Clean title");
  assert.equal(normalized.description.length, 500);
  assert.equal(normalized.price, "0");
  assert.equal(normalized.currency, "USD");
  assert.equal(normalized.imageUrl, "");
  assert.equal(normalized.actionName, "View deal");
  assert.equal(normalized.actionUrl, "https://example.test/safe");
  assert.deepEqual(Object.keys(normalized).sort(), [
    "offerId", "offerInstanceId", "title", "description", "entityName", "source", "price", "currency",
    "imageUrl", "imageAlt", "actionUrl", "actionName", "matchReason", "offerType"
  ].sort());
  assert.equal(JSON.stringify(worker.session).includes("must not escape"), false);
});

test("session cache shares identical requests across worker restarts and expires at ten minutes", async () => {
  const local = { aonAutoMatchesEnabled: true };
  const session = {};
  const first = background({ local, session, fetch: async () => response() });
  const original = await first.send(textQuery("laptop"));
  assert.deepEqual(original.offers, []);
  assert.equal(first.calls.length, 1);
  assert.equal(Object.keys(session.aonOfferQueryCache).length, 1);
  const second = background({ local, session, now: START + 599999 });
  assert.deepEqual(await second.send(textQuery("laptop")), original);
  assert.equal(second.calls.length, 0);
  assert.equal(local.aonOfferQueryQuota.count, 1);
  second.setNow(START + 600000);
  assert.equal((await second.send(textQuery("laptop"))).offers.length, 1);
  assert.equal(second.calls.length, 1);
  assert.equal(local.aonOfferQueryQuota.count, 2);
});

test("the latest non-empty offer set is retained in session storage for the popup outside shopping sites", async () => {
  const worker = background({ fetch: async () => response({ offers: [offer()] }) });
  const result = await worker.send(textQuery("acer laptop"));
  assert.equal(result.offers.length, 1);
  assert.equal(worker.session.aonLastNonEmptyOffers.offers.length, 1);
  assert.equal(worker.session.aonLastNonEmptyOffers.offers[0].title, "A useful product");
});

test("simultaneous identical queries share one fetch and distinct queries keep all session cache entries", async () => {
  let finish;
  const worker = background({ fetch: () => new Promise(resolve => { finish = resolve; }) });
  const requests = Array.from({ length: 8 }, () => worker.send(textQuery("same product")));
  await until(() => finish);
  finish(response({ offers: [offer()] }));
  assert.equal((await Promise.all(requests)).every(result => result.ok), true);
  assert.equal(worker.calls.length, 1);
  assert.equal(worker.local.aonOfferQueryQuota.count, 1);

  const parallel = background();
  await Promise.all(Array.from({ length: 5 }, (_, index) => parallel.send(textQuery(`product ${index}`))));
  assert.equal(Object.keys(parallel.session.aonOfferQueryCache).length, 5);
  assert.equal(parallel.local.aonOfferQueryQuota.count, 5);
});

test("the saved preference gates every message, cached result, and caller-supplied automatic flag", async () => {
  const worker = background();
  await worker.send(textQuery("cached product"));
  worker.local.aonAutoMatchesEnabled = false;
  const messages = [
    textQuery("cached product"),
    { ...textQuery("uncached product"), automatic: false, userInitiated: true },
    { type: "AON_QUERY_PRODUCT", product: { title: "Laptop" }, automatic: false },
    { type: "AON_QUERY_INTENTS", intents: ["laptop", "computer"], automatic: false }
  ];
  for (const message of messages) {
    assert.equal((await worker.send(message)).code, "AON_AUTO_MATCHES_DISABLED");
  }
  assert.equal(worker.calls.length, 1);
  assert.equal(worker.local.aonOfferQueryQuota.count, 1);
  const fresh = background({ local: {} });
  assert.equal((await fresh.send(textQuery("product"))).code, "AON_AUTO_MATCHES_DISABLED");
  assert.equal(fresh.calls.length, 0);
});

test("daily quota is race-safe, persists through restarts, allows cache hits, and resets next UTC day", async () => {
  const local = { aonAutoMatchesEnabled: true };
  const worker = background({ local });
  const results = await Promise.all(Array.from({ length: 55 }, (_, index) => worker.send(textQuery(`product ${index}`))));
  assert.equal(worker.calls.length, 50);
  assert.equal(results.filter(result => result.ok).length, 50);
  assert.equal(results.filter(result => result.code === "AON_DAILY_LIMIT").length, 5);
  assert.equal(local.aonOfferQueryQuota.count, 50);
  assert.equal((await worker.send(textQuery("product 0"))).ok, true);
  assert.equal(worker.calls.length, 50);
  const restarted = background({ local });
  assert.equal((await restarted.send(textQuery("another product"))).code, "AON_DAILY_LIMIT");
  assert.equal(restarted.calls.length, 0);
  restarted.setNow(START + 86400000);
  assert.equal((await restarted.send(textQuery("another product"))).ok, true);
  assert.equal(restarted.calls.length, 1);
  assert.deepEqual(local.aonOfferQueryQuota, { day: "2026-10-21", count: 1 });
});

test("quota storage failures do not allow uncounted network requests", async () => {
  const worker = background({ failSet: "local" });
  assert.equal((await worker.send(textQuery("product"))).code, "AON_UNAVAILABLE");
  assert.equal(worker.calls.length, 0);
  const unreadable = background({ failGet: "local" });
  assert.equal((await unreadable.send(textQuery("product"))).ok, false);
  assert.equal(unreadable.calls.length, 0);
});

test("fallback candidates stop on a match or error and each network attempt consumes quota", async () => {
  const worker = background({ fetch: async (_url, _init, attempt) => response({ offers: attempt === 2 ? [offer()] : [] }) });
  const result = await worker.send({ type: "AON_QUERY_PRODUCT", product: {
    title: "Acme Model 100, long marketing description", category: "Electronics > Headphones",
    price: "99.00", currency: "USD", pageUrl: "https://private.test/account", seller: "private seller"
  } });
  assert.equal(result.offers.length, 1);
  assert.equal(worker.calls.length, 2);
  assert.equal(worker.local.aonOfferQueryQuota.count, 2);
  assert.equal(JSON.parse(worker.calls[1].init.body).intent.content[0].text, "Acme Model 100");
  assert.equal(worker.calls.some(call => call.init.body.includes("private")), false);
  const unavailable = background({ fetch: async () => response({ status: 503 }) });
  assert.equal((await unavailable.send({ type: "AON_QUERY_INTENTS", intents: ["laptop", "computer"] })).code, "AON_UNAVAILABLE");
  assert.equal(unavailable.calls.length, 1);
});

test("timeout aborts at eight seconds, including during response body reading", async () => {
  for (const duringBody of [false, true]) {
    const worker = background({ fetch: (_url, init) => {
      const pending = () => new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
      });
      return duringBody ? { ...response(), json: pending } : pending();
    } });
    const request = worker.send(textQuery("product"));
    await until(() => worker.calls.length === 1);
    // Let fetch resolve so json() installs its abort listener in the body case.
    await Promise.resolve();
    await Promise.resolve();
    const timer = [...worker.timers.values()][0];
    assert.equal(timer.delay, 8000);
    timer.callback();
    assert.equal((await request).code, "AON_TIMEOUT");
    assert.equal(worker.calls[0].init.signal.aborted, true);
    assert.equal(worker.timers.size, 0);
    assert.equal(worker.local.aonOfferQueryQuota.count, 1);
    assert.equal(worker.session.aonOfferQueryCache, undefined);
  }
});

test("tracking handlers remain usable while an offer request is pending", async () => {
  let finish;
  const worker = background({ fetch: () => new Promise(resolve => { finish = resolve; }) });
  const offerRequest = worker.send(textQuery("product"));
  await until(() => finish);
  await Promise.all(Array.from({ length: 3 }, () => worker.send({
    type: "PROMPT_SENT", site: "chatgpt.com", promptTokens: 5, responseTokens: 10, detectedModelId: "gpt-5"
  })));
  assert.equal(worker.local.waterTrackerState.bySite["chatgpt.com"].prompts, 3);
  assert.equal(worker.local.waterTrackerState.bySite["chatgpt.com"].promptTokens, 15);
  assert.equal(worker.local.waterTrackerState.history.length, 3);
  await worker.send({ type: "SET_MODEL", site: "chatgpt.com", modelId: "gpt-4o-mini" });
  await worker.send({ type: "PROMPT_SENT", site: "chatgpt.com", promptTokens: 1, responseTokens: 2, detectedModelId: "gpt-5" });
  assert.equal(worker.local.waterTrackerState.bySite["chatgpt.com"].modelId, "gpt-4o-mini");
  await worker.send({ type: "USE_AUTO_DETECT", site: "chatgpt.com" });
  assert.equal(worker.local.waterTrackerState.bySite["chatgpt.com"].modelId, "gpt-4o");
  await worker.send({ type: "RESET_SITE", site: "chatgpt.com" });
  assert.equal(worker.local.waterTrackerState.bySite["chatgpt.com"].prompts, 0);
  assert.deepEqual(worker.local.waterTrackerState.history, []);
  await worker.send({ type: "RESET_ALL" });
  assert.deepEqual(worker.local.waterTrackerState, { bySite: {}, history: [] });
  await worker.events.installed();
  await worker.events.startup();
  assert.equal(worker.badges.at(-1), "");
  assert.equal(worker.local.aonOfferQueryQuota.count, 1);
  finish(response());
  assert.equal((await offerRequest).ok, true);
});

test("fresh install/upgrade migration stores 2.0, opens onboarding once unchecked, and preserves local AI tracking", async () => {
  for (const reason of ["install", "update"]) {
    const local = { aonAutoMatchesEnabled: true, waterTrackerState: {
      bySite: { "chatgpt.com": { modelId: "gpt-4o", prompts: 3 } }, history: []
    } };
    const worker = background({ local });
    await worker.events.installed({ reason });
    assert.equal(local.aonShoppingOnboardingVersion, "2.0.0");
    assert.equal(local.aonAutoMatchesEnabled, false);
    assert.equal(worker.openedTabs[0].url, "chrome-extension://test/onboarding.html");
    assert.equal(worker.calls.length, 0);
    assert.equal(local.waterTrackerState.bySite["chatgpt.com"].prompts, 3);
    await worker.changePreference(true);
    await worker.events.installed({ reason: "update" });
    assert.equal(worker.openedTabs.length, 1);
    assert.equal(local.aonAutoMatchesEnabled, true, "later reloads preserve the new explicit choice");
  }
});

test("already-migrated 2.0 users do not see onboarding again or lose their preference", async () => {
  const local = {
    aonShoppingOnboardingVersion: "2.0.0",
    aonAutoMatchesEnabled: true,
    waterTrackerState: { bySite: { "chatgpt.com": { modelId: "gpt-4o", prompts: 3 } }, history: [] }
  };
  const worker = background({ local });
  await worker.events.installed({ reason: "update" });
  assert.equal(worker.openedTabs.length, 0);
  assert.equal(local.aonShoppingOnboardingVersion, "2.0.0");
  assert.equal(local.aonAutoMatchesEnabled, true);
  assert.equal(local.waterTrackerState.bySite["chatgpt.com"].prompts, 3);
});

test("opt-out aborts the in-flight request and suppresses its entire fallback ladder", async () => {
  const worker = background({ fetch: (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
  }) });
  const request = worker.send({ type: "AON_QUERY_PRODUCT", product: { title: "Lenovo, unknown", category: "Laptops" } });
  await until(() => worker.calls.length);
  await worker.changePreference(false);
  assert.equal((await request).code, "AON_AUTO_MATCHES_DISABLED");
  assert.equal(worker.calls[0].init.signal.aborted, true);
  assert.equal(worker.calls.length, 1);
  assert.equal(worker.session.aonOfferQueryCache, undefined);
});

test("complete fallback ladder is specific title, brand/model, category word, then starter", async () => {
  const worker = background({ fetch: async () => response() });
  const result = await worker.send({ type: "AON_QUERY_PRODUCT", product: {
    title: "Lenovo Yoga 7, 16 GB: silver", category: "Computers > Laptops", price: "50000", currency: "INR"
  } });
  assert.deepEqual(result.offers, []);
  assert.deepEqual(worker.calls.map(call => JSON.parse(call.init.body).intent.content[0].text), [
    "Product title: Lenovo Yoga 7, 16 GB: silver; Category: Computers > Laptops; Price: 50000 INR",
    "Lenovo Yoga 7", "Laptops", "Show me relevant offers"
  ]);
});

test("bounded text and product cleaning exclude URLs, controls and long menu categories", async () => {
  const worker = background();
  await worker.send(textQuery(`  acer\n laptop www.private.test ftp://private.test ${"x".repeat(250)}`));
  const text = JSON.parse(worker.calls[0].init.body).intent.content[0].text;
  assert.equal(text.length, 200);
  assert.match(text, /^acer laptop /);
  assert.doesNotMatch(text, /private|[\u0000-\u001f]/);
  await worker.send({ type: "AON_QUERY_PRODUCT", product: {
    title: "Acer Laptop https://private.test/account", category: "Secret menu ".repeat(8),
    price: "50000", currency: "INR", url: "https://private.test", seller: "secret", history: "secret"
  } });
  const body = worker.calls[1].init.body;
  assert.doesNotMatch(body, /private|Secret|secret|menu/);
  assert.match(body, /Price: 50000 INR/);
});

test("signed action links are returned verbatim and missing actions use View deal", async () => {
  const url = "https://EXAMPLE.test:443/deals/../item?ref=%2f&tracking=%3D";
  const worker = background({ fetch: async () => response({ offers: [offer({ action: { payload: { url } } })] }) });
  const result = await worker.send(textQuery("acer laptop"));
  assert.equal(result.offers[0].actionUrl, url);
  assert.equal(result.offers[0].actionName, "View deal");
});
