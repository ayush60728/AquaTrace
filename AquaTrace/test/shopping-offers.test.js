"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const load = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const source = load("shopping-offers.js");
const historySource = load("shopping-history.js");
const extractorSource = load("product-context.js");
const buildSource = load("build.py");
const clone = value => JSON.parse(JSON.stringify(value));
const flush = () => new Promise(resolve => setImmediate(resolve));

class Target {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(callback);
  }
  dispatchEvent(event) {
    event.target = this;
    for (const callback of this.listeners.get(event.type) || []) callback(event);
  }
}

class Element extends Target {
  constructor(tag) {
    super();
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.attributes = {};
    this.hidden = false;
    this.checked = false;
    this._text = "";
    this.style = { setProperty(name, value) { this[name] = value; } };
  }
  append(...children) { children.forEach(child => this.appendChild(child)); }
  prepend(child) { child.remove(); this.children.unshift(child); child.parentNode = this; }
  appendChild(child) { child.remove(); this.children.push(child); child.parentNode = this; return child; }
  remove() {
    if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this);
    this.parentNode = null;
  }
  get isConnected() { return this.tagName === "HTML" || Boolean(this.parentNode && this.parentNode.isConnected); }
  replaceChildren(...children) { this.children = []; this._text = ""; this.append(...children); }
  attachShadow() { this.shadowRoot = new Element("shadow-root"); return this.shadowRoot; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] || null; }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(""); }
  set innerHTML(_value) { throw new Error("Offer rendering must not use innerHTML"); }
}

function find(root, predicate) {
  const result = [];
  if (predicate(root)) result.push(root);
  for (const child of root.children || []) result.push(...find(child, predicate));
  return result;
}

const offer = (index = 1) => ({
  title: `Headphones ${index}`,
  price: "2999",
  currency: "INR",
  entityName: "Example Shop",
  imageUrl: `https://images.example.test/${index}.png`,
  actionUrl: `https://offer.example.test/buy?track=${index}&token=%2Fkeep%3D`,
  actionName: "View offer"
});

function browser({ enabled, url = "https://www.amazon.in/s?k=headphones", product = null,
  response = { ok: true, offers: [offer()] }, session = {}, network = null, nodes = null,
  tabId = 7, networkSession = {} } = {}) {
  const root = new Element("html");
  const created = [];
  const document = { documentElement: root, body: root, createElement: tag => {
    const element = new Element(tag); created.push(element); return element;
  } };
  const window = new Target();
  const location = new URL(url);
  const local = enabled === undefined ? {} : { aonAutoMatchesEnabled: enabled };
  const storageListeners = [];
  const messageListeners = [];
  const requests = [];
  const fetchCalls = [];
  const workerEvents = {};
  const openedTabs = [];
  let workerSend;
  let currentNodes = nodes;
  document.querySelector = selector => (currentNodes && currentNodes[selector] || [])[0] || null;
  document.querySelectorAll = selector => currentNodes && currentNodes[selector] || [];
  let currentProduct = product;
  let currentResponse = response;
  let observerCallback;
  let observerOptions;
  let timerId = 0;
  const timers = new Map();
  const preferenceChange = value => {
    const oldValue = local.aonAutoMatchesEnabled;
    local.aonAutoMatchesEnabled = value;
    storageListeners.forEach(listener => listener({ aonAutoMatchesEnabled: { oldValue, newValue: value } }, "local"));
  };
  const history = {
    pushState(_state, _unused, href) { location.href = new URL(href, location.href).href; return "history-result"; },
    replaceState(_state, _unused, href) { location.href = new URL(href, location.href).href; return "history-result"; }
  };
  window.history = history;
  const context = {
    console, URL, document, window, location, history,
    Event: class { constructor(type) { this.type = type; } },
    MutationObserver: class {
      constructor(callback) { observerCallback = callback; }
      observe(_element, options) { observerOptions = options; }
    },
    setTimeout: callback => { timers.set(++timerId, callback); return timerId; },
    clearTimeout: id => timers.delete(id),
    AquaTraceProductContext: { extractProductData: () => currentProduct },
    chrome: {
      storage: {
        local: {
          get: async (_key, callback) => { const value = clone(local); if (callback) callback(value); return value; },
          set: async (values, callback) => {
            preferenceChange(values.aonAutoMatchesEnabled);
            if (callback) callback();
          }
        },
        onChanged: { addListener: listener => storageListeners.push(listener) }
      },
      runtime: {
        onMessage: { addListener: listener => messageListeners.push(listener) },
        sendMessage: async (message, callback) => {
          let result;
          if (workerSend) {
            if (message.type.startsWith("AON_QUERY_")) requests.push(clone(message));
            result = await workerSend(message);
          }
          else if (message.type === "AON_GET_TAB_SESSION") {
            result = clone(session);
            if (message.sessionId) {
              result.dismissed = session.dismissedSessionId === message.sessionId;
            }
          }
          else if (message.type === "AON_SET_TAB_SESSION") {
            if (message.lastOffers) session.lastOffers = clone(message.lastOffers);
            if (message.dismissed) {
              session.dismissed = true;
              session.dismissedSessionId = message.sessionId || "";
            }
            result = clone(session);
          } else {
            requests.push(clone(message));
            result = typeof currentResponse === "function" ? await currentResponse(message) : clone(currentResponse);
          }
          if (callback) callback(result);
          return result;
        }
      }
    }
  };
  if (network) {
    const listeners = [];
    const area = (data, name) => ({
      get: async keys => clone(Object.fromEntries((Array.isArray(keys) ? keys : [keys])
        .filter(key => Object.hasOwn(data, key)).map(key => [key, data[key]]))),
      set: async values => {
        const changes = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { newValue: value }]));
        Object.assign(data, clone(values));
        storageListeners.forEach(listener => listener(changes, name));
      },
      remove: async key => { delete data[key]; }
    });
    const worker = vm.createContext({
      URL, AbortController, console,
      // Worker timeout is covered independently; do not use UI debounce timers.
      setTimeout: () => 1, clearTimeout() {},
      fetch: async (url, init) => {
        fetchCalls.push({ url, init });
        const payload = await network(JSON.parse(init.body).intent.content[0].text);
        return { status: 200, headers: { get: () => "" }, json: async () => payload };
      },
      chrome: {
        action: { setBadgeText() {}, setBadgeBackgroundColor() {} },
        runtime: {
          getURL: file => `chrome-extension://aquatrace/${file}`,
          onMessage: { addListener: listener => listeners.push(listener) },
          onInstalled: { addListener: listener => { workerEvents.installed = listener; } },
          onStartup: { addListener() {} }
        },
        tabs: { create: async value => openedTabs.push(value), onRemoved: { addListener() {} } },
        storage: { local: area(local, "local"), session: area(networkSession, "session"),
          onChanged: { addListener: listener => storageListeners.push(listener) } }
      }
    });
    worker.importScripts = (...files) => files.forEach(file => vm.runInContext(load(file.replace(/^\.\.\//, "")), worker));
    vm.runInContext(load("dist/background.bundle.js"), worker);
    workerSend = message => new Promise(resolve => {
      listeners.forEach(listener => listener(message, { tab: { id: tabId }, frameId: 0 }, value => resolve(clone(value))));
    });
  }
  vm.createContext(context);
  vm.runInContext(historySource, context, { filename: "shopping-history.js" });
  if (nodes) vm.runInContext(extractorSource, context, { filename: "product-context.js" });
  vm.runInContext(source, context, { filename: "shopping-offers.js" });
   const host = created.find(element => element.id === "aquatrace-sponsored-offers");
  return {
    context, local, session, host, requests, location, history, fetchCalls, networkSession, workerEvents, openedTabs, workerSend,
    setNodes: value => { currentNodes = value; },
    find: predicate => find(host.shadowRoot, predicate),
    text: () => host.shadowRoot.textContent,
    reload: options => browser({
      enabled: local.aonAutoMatchesEnabled,
      url: location.href,
      product: currentProduct,
      response: currentResponse,
      session,
      network,
      nodes: currentNodes,
      tabId,
      networkSession,
      ...options
    }),
    setProduct: value => { currentProduct = value; },
    setResponse: value => { currentResponse = value; },
    preferenceChange,
    broadcast: enabled => messageListeners.forEach(listener => listener({ type: "AON_AUTO_MATCHES_CHANGED", enabled })),
    mutate: () => observerCallback([]),
    observerOptions: () => observerOptions,
    tick: async () => {
      const callbacks = [...timers.values()];
      timers.clear();
      callbacks.forEach(callback => callback());
      await flush();
    }
  };
}

test("fresh install has no injected bar or request until the shared checkbox preference is on", async () => {
  const page = browser();
  await flush();
  assert.equal(page.requests.length, 0);
  assert.equal(page.host.hidden, true);
  assert.equal(page.host.isConnected, false);
  page.preferenceChange(true);
  await flush();
  assert.equal(page.local.aonAutoMatchesEnabled, true);
  assert.equal(page.requests.length, 1, "storage notification and checkbox must not duplicate the request");
  assert.equal(page.requests[0].automatic, true);
});

test("explicit opt-out hides the bar and makes no offer requests", async () => {
  const page = browser({ enabled: false });
  await flush();
  assert.equal(page.host.hidden, true);
  assert.equal(page.host.isConnected, false);
  page.mutate();
  await page.tick();
  assert.equal(page.requests.length, 0);
});

test("product snapshot wins over URL search and only the four product fields leave the page", async () => {
  const page = browser({ enabled: true, product: {
    title: "Sony WH-1000XM5, Wireless: Black",
    category: "Over Ear Headphones",
    price: "29,999",
    currency: "INR",
    seller: "private seller",
    cookie: "secret"
  } });
  await flush();
  assert.equal(page.requests.length, 1);
  const message = page.requests[0];
  assert.equal(message.type, "AON_QUERY_PRODUCT");
  assert.deepEqual(Object.keys(message.product).sort(), ["category", "currency", "price", "title"]);
  assert.deepEqual(message.intents, [
    "Product title: Sony WH-1000XM5, Wireless: Black; Category: Over Ear Headphones; Price: 29999 INR",
    "Sony WH-1000XM5", "Headphones", "Show me relevant offers"
  ]);
  assert.doesNotMatch(JSON.stringify(message), /private seller|secret|www\.amazon/);
});

test("Amazon k and Flipkart q search are cleaned and bounded, with a generic fallback", async () => {
  for (const [domain, parameter] of [["amazon.com", "k"], ["www.flipkart.com", "q"]]) {
    const text = `   Sony\u0000 headphones https://secret.example.test/a?account=4 www.secret.test ${"x".repeat(250)}`;
    const page = browser({ enabled: true, url: `https://${domain}/search?${parameter}=${encodeURIComponent(text)}` });
    await flush();
    assert.equal(page.requests[0].type, "AON_QUERY_INTENTS");
    const first = page.requests[0].intents[0];
    assert.match(first, /^Sony headphones /);
    assert.doesNotMatch(first, /secret|https|www\.|[\u0000-\u001F]/);
    assert.equal(first.length, 200);
  }
  const home = browser({ enabled: true, url: "https://amazon.in/" });
  await flush();
  assert.deepEqual(home.requests[0].intents, ["Show me relevant offers"]);
});

test("offer cards use safe direct HTTPS actions, text nodes, visible Sponsored labels, and a three-card limit", async () => {
  const page = browser({ enabled: true, response: { ok: true, offers: [
    { ...offer(), actionUrl: "javascript:alert(1)" },
    { ...offer(), title: "<img src=x onerror=alert(1)>" }, offer(2), offer(3), offer(4)
  ] } });
  await flush();
  assert.equal(page.host.hidden, false);
  const cards = page.find(element => element.className === "offer");
  assert.equal(cards.length, 3);
  assert.equal(cards[0].href, offer().actionUrl);
  for (const card of cards) {
    assert.equal(card.tagName, "A");
    assert.equal(card.target, "_blank");
    assert.equal(card.rel, "noopener noreferrer sponsored");
    assert.match(card.textContent, /Sponsored/);
    assert.match(card.textContent, /Example Shop/);
    assert.match(card.textContent, /View offer/);
  }
  assert.equal(cards[0].children[0].crossOrigin, undefined,
    "remote offer images must not opt into CORS; the image host need not send ACAO");
  assert.match(cards[0].textContent, /<img src=x onerror=alert\(1\)>/);
  assert.equal(page.find(element => element.tagName === "IMG").length, 3);
});

test("storage opt-out is immediate and late offer responses cannot reopen the bar", async () => {
  let resolve;
  const page = browser({ enabled: true, response: () => new Promise(done => { resolve = done; }) });
  await flush();
  page.preferenceChange(false);
  assert.equal(page.host.hidden, true);
  resolve({ ok: true, offers: [offer()] });
  await flush();
  assert.equal(page.host.hidden, true);
  assert.equal(page.session.lastOffers, undefined);
});

test("empty/error responses hide without replacing the last non-empty tab-session cache", async () => {
  const page = browser({ enabled: true });
  await flush();
  assert.equal(page.session.lastOffers.length, 1);
  for (const [index, response] of [[2, { ok: true, offers: [] }], [3, { ok: false }]]) {
    page.setResponse(response);
    page.history.pushState(null, "", `/s?k=product${index}`);
    await page.tick();
    assert.equal(page.host.hidden, true);
    assert.equal(page.session.lastOffers[0].title, "Headphones 1");
  }
});

test("dismissal hides the current page, then same-tab navigation shows a fresh page", async () => {
  const page = browser({ enabled: true });
  await flush();
  const collapse = page.find(element => element.textContent === "Collapse")[0];
  collapse.dispatchEvent({ type: "click" });
  assert.equal(collapse.getAttribute("aria-expanded"), "false");
  page.find(element => element.textContent === "Dismiss")[0].dispatchEvent({ type: "click" });
  await flush();
  assert.equal(page.session.dismissed, true);
  page.history.pushState(null, "", "/s?k=speakers");
  await page.tick();
  assert.equal(page.host.hidden, false);
  assert.equal(page.requests.length, 2, "a new page should request fresh offers after dismissal");
});

test("fresh tabs do not inherit another tab's dismissal", async () => {
  const dismissedTab = browser({ enabled: true });
  await flush();
  dismissedTab.find(element => element.textContent === "Dismiss")[0]
    .dispatchEvent({ type: "click" });
  await flush();

  const freshTab = browser({ enabled: true, url: "https://www.flipkart.com/" });
  await flush();
  assert.equal(freshTab.host.hidden, false);
  assert.equal(freshTab.requests.length, 1);
  assert.equal(freshTab.session.dismissed, undefined);
});

test("a document refresh resets dismissal and request state while retaining tab offers", async () => {
  const page = browser({ enabled: true });
  await flush();
  assert.equal(page.requests.length, 1);
  assert.equal(page.host.hidden, false);

  page.find(element => element.textContent === "Dismiss")[0].dispatchEvent({ type: "click" });
  await flush();
  assert.equal(page.host.hidden, true);

  const refreshed = page.reload();
  await flush();
  assert.notEqual(refreshed.host, page.host, "refresh must create a new document host");
  assert.equal(refreshed.requests.length, 1, "refresh must not reuse the old document's request key");
  assert.equal(refreshed.host.hidden, false);
  assert.equal(refreshed.session.lastOffers.length, 1, "tab-session offers survive the refresh");
});

test("MAIN-world history bridge and debounced mutations refresh only after relevant changes", async () => {
  const page = browser({ enabled: true });
  await flush();
  page.mutate(); page.mutate(); page.mutate();
  await page.tick();
  assert.equal(page.requests.length, 1, "unchanged pages must not keep querying");
  assert.equal(page.history.pushState(null, "", "/s?k=speakers"), "history-result");
  assert.equal(page.requests.length, 1, "history refresh is debounced");
  await page.tick();
  assert.equal(page.requests.length, 2);
  assert.equal(page.requests[1].intents[0], "speakers");
  page.setProduct({ title: "New Product", category: "Speakers", price: "50", currency: "USD" });
  page.mutate();
  await page.tick();
  assert.equal(page.requests.length, 3);
  assert.equal(page.observerOptions().characterData, true);
});

test("manifest and build allowlist include every shopping content-script input", () => {
  const manifest = JSON.parse(load("manifest.json"));
  const historyScript = manifest.content_scripts.find(script => script.js.includes("shopping-history.js"));
  const offersScript = manifest.content_scripts.find(script => script.js.includes("shopping-offers.js"));

  assert.deepEqual(historyScript.js, ["shopping-history.js"]);
  assert.equal(historyScript.world, "MAIN");
  assert.equal(historyScript.run_at, "document_start");
  assert.deepEqual(offersScript.js, ["product-context.js", "shopping-offers.js"]);
  assert.equal(offersScript.run_at, "document_idle");

  for (const file of ["product-context.js", "shopping-offers.js", "shopping-history.js", "shopping-session.js"]) {
    assert.match(buildSource, new RegExp(`"${file}"`), `${file} must be a release input`);
  }
  assert.match(buildSource, /glob\("\*\.test\.js"\)/, "build must discover regression tests");
  assert.match(buildSource, /\["node", "--test", \*tests\]/, "build must run discovered tests");
});

test("a navigation while a request is pending cannot display stale offers or lose the new request", async () => {
  let resolve;
  const page = browser({ enabled: true, response: () => new Promise(done => { resolve = done; }) });
  await flush();
  page.history.replaceState(null, "", "/s?k=speakers");
  await page.tick();
  page.setResponse({ ok: true, offers: [offer(2)] });
  resolve({ ok: true, offers: [offer(1)] });
  await flush();
  assert.equal(page.host.hidden, true);
  await page.tick();
  assert.equal(page.requests.length, 2);
  assert.equal(page.session.lastOffers[0].title, "Headphones 2");
});

test("reusable extractor retains breadcrumb-first category selection and popup message support", () => {
  const title = new Element("h1"); title.textContent = "Sony WH-1000XM5";
  const price = new Element("span"); price.textContent = "₹29,999";
  const breadcrumb = new Element("a"); breadcrumb.textContent = "Over-Ear Headphones";
  const menu = new Element("div"); menu.textContent = "All electronics and a long unrelated navigation mega menu";
  const json = new Element("script");
  json.textContent = JSON.stringify({ "@type": "Product", name: "Sony WH-1000XM5", category: "Accessories" });
  const nodes = {
    'script[type="application/ld+json"]': [json],
    "#productTitle": [title],
    "#corePriceDisplay_desktop_feature_div .a-price .a-offscreen": [price],
    "#wayfinding-breadcrumbs_feature_div a": [breadcrumb],
    '[data-category]': [menu]
  };
  const listeners = [];
  const context = {
    location: new URL("https://www.amazon.in/dp/B012345678"),
    document: {
      querySelector: selector => (nodes[selector] || [])[0] || null,
      querySelectorAll: selector => nodes[selector] || []
    },
    chrome: { runtime: { onMessage: { addListener: listener => listeners.push(listener) } } }
  };
  vm.runInNewContext(extractorSource, context, { filename: "product-context.js" });
  const product = context.AquaTraceProductContext.extractProductData();
  assert.deepEqual(clone(product), {
    title: "Sony WH-1000XM5", category: "Over-Ear Headphones", price: "29999", currency: "INR"
  });
  let popupProduct;
  listeners[0]({ type: "GET_PRODUCT_DATA" }, {}, value => { popupProduct = value; });
  assert.deepEqual(popupProduct, product);
  breadcrumb.textContent = "Not a real category ".repeat(5);
  json.textContent = JSON.stringify({ "@type": "Product", name: "Sony WH-1000XM5", category: "Navigation menu ".repeat(6) });
  menu.textContent = "Another navigation menu ".repeat(6);
  assert.equal(context.AquaTraceProductContext.extractProductData().category, "");
});

test("tab-session bridge persists through worker restart, retains non-empty offers, and isolates tabs", async () => {
  const sessionData = {};
  const createWorker = () => {
    let listener;
    let removeListener;
    vm.runInNewContext(load("shopping-session.js"), {
      chrome: {
        runtime: { onMessage: { addListener: value => { listener = value; } } },
        storage: { session: {
          get: async key => ({ [key]: sessionData[key] }),
          set: async value => Object.assign(sessionData, clone(value)),
          remove: async key => { delete sessionData[key]; }
        } },
        tabs: { onRemoved: { addListener: value => { removeListener = value; } } }
      }
    }, { filename: "shopping-session.js" });
    return {
      query: (tabId, message) => new Promise(resolve => listener(message, { tab: { id: tabId } }, resolve)),
      closeTab: tabId => removeListener(tabId)
    };
  };
  const worker = createWorker();
  await worker.query(7, { type: "AON_SET_TAB_SESSION", lastOffers: [offer()] });
  await worker.query(7, { type: "AON_SET_TAB_SESSION", dismissed: true, lastOffers: [] });
  const restarted = createWorker();
  const restored = await restarted.query(7, { type: "AON_GET_TAB_SESSION" });
  assert.equal(restored.dismissed, true);
  assert.equal(restored.lastOffers.length, 1);
  assert.equal((await restarted.query(8, { type: "AON_GET_TAB_SESSION" })).dismissed, false);
  restarted.closeTab(7);
  await flush();
  assert.equal(sessionData["aonShoppingTab:7"], undefined);
});

test("popup toggle saves the shared preference, broadcasts opt-out, and observes changes from onboarding", async () => {
  const ids = [
    "aonOfferForm", "aonSearchBtn", "aonAutoMatchesToggle", "aonOfferResults",
    "aonProductStatus", "aonProductPreview", "aonProductTitle", "aonProductCategory",
    "aonProductPrice", "siteSwitcher", "siteSwitcherContainer", "currentSiteCard", "historyPanel"
  ];
  const elements = Object.fromEntries(ids.map(id => [id, new Element("div")]));
  for (const element of Object.values(elements)) {
    element.style = {};
    element.querySelector = () => null;
  }
  // Existing AI stats still use markup. Keep the AON nodes strict so any
  // reintroduction of HTML rendering into the offer flow fails this smoke test.
  for (const id of ["siteSwitcher", "currentSiteCard", "historyPanel"]) {
    Object.defineProperty(elements[id], "innerHTML", { set: value => { elements[id]._text = value; } });
  }
  const document = new Target();
  document.getElementById = id => elements[id] || null;
  document.createElement = tag => new Element(tag);
  document.createDocumentFragment = () => new Element("fragment");
  document.body = { classList: { contains: () => false, add: () => {} } };
  let enabled = true;
  const storageListeners = [];
  const broadcasts = [];
  const queries = [];
  const liveTab = { id: 7, url: "https://www.amazon.in/dp/B012345678" };
  const preferenceChange = value => {
    enabled = value;
    storageListeners.forEach(listener => listener({ aonAutoMatchesEnabled: { newValue: value } }, "local"));
  };
  vm.runInNewContext(load("dist/popup.bundle.js"), {
    document, URL, console,
    localStorage: { getItem: () => "light" },
    chrome: {
      storage: {
        local: {
          get: async key => key === "aonAutoMatchesEnabled"
            ? { aonAutoMatchesEnabled: enabled }
            : { waterTrackerState: { bySite: {}, history: [] } },
          set: async values => preferenceChange(values.aonAutoMatchesEnabled)
        },
        session: {
          get: async () => ({}),
          set: async () => {}
        },
        onChanged: { addListener: callback => storageListeners.push(callback) }
      },
      tabs: {
        query: (_options, callback) => callback([liveTab]),
        sendMessage: (_tab, message, callback) => {
          if (message.type === "GET_PRODUCT_DATA") callback({ title: "Headphones", category: "Headphones", price: "20", currency: "USD" });
          else { broadcasts.push(message); if (callback) callback(); }
        }
      },
      runtime: {
        sendMessage: async message => { queries.push(message); return { ok: true, offers: [offer()] }; }
      }
    }
  }, { filename: "popup.bundle.js" });
  await flush();
  assert.equal(elements.aonAutoMatchesToggle.checked, true);
  assert.equal(queries[0].type, "AON_QUERY_PRODUCT");
  const card = find(elements.aonOfferResults, element => element.className === "aon-offer")[0];
  assert.equal(card.tagName, "A");
  assert.equal(card.href, offer().actionUrl);
  assert.equal(card.rel, "noopener noreferrer sponsored");
  elements.aonAutoMatchesToggle.checked = false;
  elements.aonAutoMatchesToggle.dispatchEvent({ type: "change" });
  await flush();
  assert.equal(enabled, false);
  assert.equal(broadcasts[0].enabled, false);
  assert.equal(elements.aonOfferResults.children.length, 0);
  preferenceChange(true);
  await flush();
  assert.equal(elements.aonAutoMatchesToggle.checked, true);
  assert.equal(queries.length, 2);
  preferenceChange(false);
  elements.aonOfferForm.dispatchEvent({ type: "submit", preventDefault() {} });
  await flush();
  assert.equal(queries.length, 2, "a popup submit must not bypass an unchecked checkbox");
  assert.equal(elements.aonSearchBtn.disabled, true);
});

// Acceptance fixtures run the actual worker, session bridge, MAIN-world bridge,
// shopping UI and (where specified) product extractor. Only Chrome/DOM/network
// boundaries are simulated; these are NOT real-site browser acceptance tests.
const apiOffer = title => ({
  offer_id: "fixture-offer", offer_instance_id: "fixture-instance",
  offer_info: { title, commercial: { price: { amount: "39999", currency: "INR" } } },
  listing_source: { name: "Shopsy" },
  material: [{ format: "image", url: "https://images.example.test/laptop.png" }],
  action: { payload: { url: "https://aon.link/fixture?token=%2fexact%3D" } }
});
const apiReply = offers => ({ code: "SUCCESS", data: { protocol_version: "1.0", offers } });
const fixtureNetwork = async text => apiReply(text === "Show me relevant offers"
  ? [apiOffer("Starter deal")] : /acer/i.test(text) ? [apiOffer("Acer laptop deal")] : []);
const sentTexts = page => page.fetchCalls.map(call => JSON.parse(call.init.body).intent.content[0].text);
const productNodes = (site = "amazon") => {
  const node = (tag, text) => { const element = new Element(tag); element.textContent = text; return element; };
  return site === "amazon" ? {
    "#productTitle": [node("h1", "Acer Aspire 5, 16 GB RAM")],
    "#corePriceDisplay_desktop_feature_div .a-price .a-offscreen": [node("span", "₹39,999")],
    "#wayfinding-breadcrumbs_feature_div a": [node("a", "Laptops")]
  } : {
    "h1.B_NuCI": [node("h1", "Acer Aspire 5, 16 GB RAM")],
    '[data-testid="price"]': [node("span", "₹39,999")],
    "#breadcrumb a": [node("a", "Laptops")]
  };
};
const openOnboarding = page => {
  const checkbox = new Element("input");
  const status = new Element("p");
  vm.runInNewContext(load("onboarding.js"), {
    chrome: page.context.chrome,
    document: { getElementById: id => id === "aonAutoMatchesToggle" ? checkbox : status }
  });
  return { checkbox, status };
};

test("acceptance fixture 1: fresh install opens unchecked onboarding, no AON request or shopping bar", async () => {
  const page = browser({ url: "https://www.amazon.in/", network: fixtureNetwork });
  await page.workerEvents.installed({ reason: "install" });
  const onboarding = openOnboarding(page);
  await flush();
  assert.equal(onboarding.checkbox.checked, false);
  assert.equal(page.fetchCalls.length, 0);
  assert.equal(page.host.isConnected, false);
  assert.equal(page.openedTabs[0].url, "chrome-extension://aquatrace/onboarding.html");
  const html = load("onboarding.html");
  assert.equal((html.match(/type="checkbox"/g) || []).length, 1);
  assert.doesNotMatch(html, /\schecked(?:\s|[=>])/);
  assert.ok(html.includes("Show sponsored product suggestions while I shop on Amazon and Flipkart"));
  assert.ok(html.includes("When on, AquaTrace sends AON the product title, category and price of the product page you view, or the search words you type into Amazon/Flipkart search. It never sends the page URL, cookies, account or seller data, page text, AI chats or local history."));
});

test("acceptance fixture 2: ticking onboarding while Amazon home is open displays starter offers", async () => {
  const page = browser({ enabled: false, url: "https://www.amazon.in/", network: fixtureNetwork });
  const onboarding = openOnboarding(page);
  await flush();
  onboarding.checkbox.checked = true;
  onboarding.checkbox.dispatchEvent({ type: "change" });
  await flush();
  assert.deepEqual(sentTexts(page), ["Show me relevant offers"]);
  assert.equal(page.host.isConnected, true);
  assert.match(page.text(), /Starter deal/);
  assert.doesNotMatch(page.text(), /Show me relevant offers|input_text|protocol_version/);
});

test("acceptance fixture 3: Amazon acer laptop search updates automatically without a popup", async () => {
  const page = browser({ enabled: true, url: "https://www.amazon.in/", network: fixtureNetwork });
  await flush();
  page.history.pushState(null, "", "/s?k=acer+laptop");
  await page.tick();
  assert.deepEqual(sentTexts(page), ["Show me relevant offers", "acer laptop"]);
  assert.match(page.text(), /Acer laptop deal/);
});

test("acceptance fixture 4: Acer product uses the actual product-context extractor", async () => {
  const page = browser({ enabled: true, url: "https://www.amazon.in/dp/B012345678", nodes: productNodes(), network: fixtureNetwork });
  await flush();
  assert.deepEqual(sentTexts(page), ["Product title: Acer Aspire 5, 16 GB RAM; Category: Laptops; Price: 39999 INR"]);
  assert.match(page.text(), /Acer laptop deal/);
  assert.deepEqual(JSON.parse(page.fetchCalls[0].init.body).context, {});
});

test("acceptance fixture 5: unknown product exhausts fallbacks, then uses starter or hides quietly", async () => {
  for (const starter of [true, false]) {
    const page = browser({ enabled: true, product: { title: "Lenovo Yoga, 16 GB", category: "Laptops", price: "50000", currency: "INR" },
      network: starter ? fixtureNetwork : async () => apiReply([]) });
    await flush();
    assert.deepEqual(sentTexts(page), [
      "Product title: Lenovo Yoga, 16 GB; Category: Laptops; Price: 50000 INR",
      "Lenovo Yoga", "Laptops", "Show me relevant offers"
    ]);
    assert.equal(page.host.isConnected, starter);
    if (starter) assert.match(page.text(), /Starter deal/);
    assert.doesNotMatch(page.text(), /error|failed|unavailable/i);
  }
});

test("acceptance fixture 6: Flipkart pushState/replaceState and DOM-only changes update the bar", async () => {
  const page = browser({ enabled: true, url: "https://www.flipkart.com/", nodes: {}, network: fixtureNetwork });
  await flush();
  page.history.pushState(null, "", "/search?q=acer+laptop");
  await page.tick();
  assert.equal(sentTexts(page).at(-1), "acer laptop");
  page.history.replaceState(null, "", "/acer-aspire/p/itm123");
  page.setNodes(productNodes("flipkart"));
  page.mutate();
  await page.tick();
  assert.match(sentTexts(page).at(-1), /Product title: Acer Aspire 5/);
  assert.equal(page.fetchCalls.length, 3);
  const nextNodes = productNodes("flipkart");
  nextNodes["h1.B_NuCI"][0].textContent = "Acer Nitro 5";
  page.setNodes(nextNodes); page.mutate();
  await page.tick();
  assert.match(sentTexts(page).at(-1), /Acer Nitro 5/);
});

test("acceptance fixture 7: shared popup opt-out removes the bar and gates all later worker calls", async () => {
  const page = browser({ enabled: true, network: fixtureNetwork });
  await flush();
  page.preferenceChange(false);
  assert.equal(page.host.isConnected, false);
  page.history.pushState(null, "", "/s?k=acer+laptop");
  await page.tick();
  const before = page.fetchCalls.length;
  const response = await page.workerSend({ type: "AON_QUERY_TEXT", text: "acer laptop" });
  assert.equal(response.code, "AON_AUTO_MATCHES_DISABLED");
  assert.equal(page.fetchCalls.length, before);
});

test("acceptance fixture 8: offline/internal error hide offers while AI tracking messages still work", async () => {
  for (const network of [async () => { throw new Error("offline"); }, async () => ({ code: "INTERNAL_ERROR" })]) {
    const page = browser({ enabled: true, url: "https://amazon.com/", network });
    await flush();
    assert.equal(page.host.isConnected, false);
    const result = await page.workerSend({ type: "PROMPT_SENT", site: "chatgpt.com", promptTokens: 4, responseTokens: 12, detectedModelId: "gpt-4o" });
    assert.equal(result.ok, true);
    assert.equal(page.local.waterTrackerState.bySite["chatgpt.com"].promptTokens, 4);
    assert.doesNotMatch(page.fetchCalls[0].init.body, /chatgpt|promptTokens|history/);
  }
});

test("acceptance fixture 9: card and button surface use the verbatim HTTPS new-tab anchor", async () => {
  const page = browser({ enabled: true, network: fixtureNetwork });
  await flush();
  const card = page.find(element => element.className === "offer")[0];
  const button = page.find(element => element.className === "offer-button")[0];
  assert.equal(card.href, "https://aon.link/fixture?token=%2fexact%3D");
  assert.equal(card.target, "_blank");
  assert.equal(card.rel, "noopener noreferrer sponsored");
  assert.equal(button.textContent, "View deal");
  assert.equal(button.parentNode.parentNode, card);
  assert.match(card.textContent, /Sponsored/);
  assert.match(card.textContent, /Shopsy/);
  assert.equal(card.children[0].crossOrigin, undefined);
});
