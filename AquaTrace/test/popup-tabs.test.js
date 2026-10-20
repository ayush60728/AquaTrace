"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const source = fs.readFileSync(
  path.join(__dirname, "..", "dist", "popup.bundle.js"),
  "utf8"
);
const popupHtml = fs.readFileSync(
  path.join(__dirname, "..", "popup.html"),
  "utf8"
);

class EventTarget {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }
  dispatch(type, event = {}) {
    const payload = { ...event, type, target: event.target || this };
    for (const listener of this.listeners.get(type) || []) listener(payload);
    return payload;
  }
}

class Element extends EventTarget {
  constructor(id = "") {
    super();
    this.id = id;
    this.attributes = {};
    this.hidden = false;
    this.innerHTML = "";
    this.textContent = "";
    this.style = {};
    this.value = "";
    this.classList = {
      values: new Set(),
      add: value => this.classList.values.add(value),
      remove: value => this.classList.values.delete(value),
      contains: value => this.classList.values.has(value),
      toggle: value => {
        if (this.classList.values.has(value)) {
          this.classList.values.delete(value);
          return false;
        }
        this.classList.values.add(value);
        return true;
      }
    };
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] || null; }
  removeAttribute(name) { delete this.attributes[name]; }
  click() { this.dispatch("click"); }
  focus() { this.focused = true; }
}

function createPopup() {
  const elements = new Map();
  const allElements = [];
  const add = (element, attributes = {}) => {
    Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
    elements.set(element.id, element);
    allElements.push(element);
    return element;
  };
  const document = new EventTarget();
  document.body = add(new Element("body"));
  document.getElementById = id => elements.get(id) || null;
  document.createElement = tag => new Element(tag);
  document.querySelectorAll = selector => {
    if (selector === '[role="tab"]') return allElements.filter(element => element.getAttribute("role") === "tab");
    if (selector === '[role="tabpanel"]') return allElements.filter(element => element.getAttribute("role") === "tabpanel");
    if (selector === "[data-popup-tab]") return allElements.filter(element => element.getAttribute("data-popup-tab"));
    if (selector === "[data-popup-panel]") return allElements.filter(element => element.getAttribute("data-popup-panel"));
    if (selector === "[data-tab]") return allElements.filter(element => element.getAttribute("data-tab"));
    if (selector === "[data-tab-panel]") return allElements.filter(element => element.getAttribute("data-tab-panel"));
    if (selector === ".popup-tab" || selector === ".popup-tab-button") return [];
    if (selector === ".popup-tab-panel" || selector === ".popup-panel") return [];
    return [];
  };

  const shoppingTab = add(new Element("shoppingTab"), {
    "data-popup-tab": "shopping",
    "aria-controls": "shoppingPanel"
  });
  const aiTab = add(new Element("aiFootprintsTab"), {
    "data-popup-tab": "ai-footprints",
    "aria-controls": "aiFootprintsPanel"
  });
  const shoppingPanel = add(new Element("shoppingPanel"), { role: "tabpanel" });
  const aiPanel = add(new Element("aiFootprintsPanel"), { role: "tabpanel" });
  add(new Element("siteSwitcher"));
  add(new Element("siteSwitcherContainer"));
  add(new Element("currentSiteCard"));
  add(new Element("historyPanel"));
  add(new Element("themeToggleBtn"));

  const localValues = {};
  const localStorage = {
    getItem: key => Object.hasOwn(localValues, key) ? localValues[key] : null,
    setItem: (key, value) => { localValues[key] = String(value); }
  };
  const localStorageWrites = [];
  const storageState = {
    aonAutoMatchesEnabled: false,
    waterTrackerState: { bySite: {}, history: [] }
  };
  const chromeStorageWrites = [];
  const openedTabs = [];
  const context = {
    console,
    URL,
    Intl,
    document,
    localStorage: {
      getItem: key => localStorage.getItem(key),
      setItem: (key, value) => {
        localStorageWrites.push([key, value]);
        localStorage.setItem(key, value);
      }
    },
    window: { matchMedia: () => ({ matches: false }) },
    chrome: {
      storage: {
        local: {
          get: async () => ({ ...storageState }),
          set: async values => {
            chromeStorageWrites.push(values);
            Object.assign(storageState, values);
          }
        }
      },
      tabs: {
        query: (_query, callback) => callback([]),
        create: async options => openedTabs.push(options)
      },
      runtime: { getURL: file => `chrome-extension://aquatrace/${file}` }
    },
    setTimeout,
    clearTimeout
  };
  vm.runInNewContext(source, context, { filename: "popup.bundle.js" });

  return {
    shoppingTab,
    aiTab,
    shoppingPanel,
    aiPanel,
    document,
    localValues,
    localStorageWrites,
    chromeStorageWrites,
    openedTabs
  };
}

test("popup HTML declares Shopping as the visible default and keeps AI controls in the second panel", () => {
  assert.equal((popupHtml.match(/role="tab"/g) || []).length, 2);
  assert.match(popupHtml, /id="shoppingTab"[^>]*aria-selected="true"/s);
  assert.match(popupHtml, /id="aiFootprintsTab"[^>]*aria-selected="false"/s);
  assert.match(popupHtml, /id="shoppingPanel"[^>]*aria-hidden="false"/s);
  assert.match(popupHtml, /id="aiFootprintsPanel"[^>]*aria-hidden="true"[^>]*hidden/s);
  assert.match(popupHtml, /id="shoppingPanel"[\s\S]*id="aonOfferForm"/);
  assert.match(popupHtml, /id="aiFootprintsPanel"[\s\S]*id="currentSiteCard"[\s\S]*id="historyPanel"/);
});

test("popup tabs default to Shopping, switch with click and keyboard, and keep AON consent separate", async () => {
  const popup = createPopup();

  assert.equal(popup.shoppingTab.getAttribute("aria-selected"), "true");
  assert.equal(popup.shoppingTab.getAttribute("tabindex"), "0");
  assert.equal(popup.aiTab.getAttribute("aria-selected"), "false");
  assert.equal(popup.aiTab.getAttribute("tabindex"), "-1");
  assert.equal(popup.shoppingPanel.hidden, false);
  assert.equal(popup.aiPanel.hidden, true);

  popup.aiTab.click();
  assert.equal(popup.shoppingTab.getAttribute("aria-selected"), "false");
  assert.equal(popup.aiTab.getAttribute("aria-selected"), "true");
  assert.equal(popup.shoppingPanel.hidden, true);
  assert.equal(popup.aiPanel.hidden, false);
  assert.equal(popup.localValues["aquatrace.popup.selectedTab"], undefined);
  assert.deepEqual(popup.chromeStorageWrites, [], "tab selection must not write Chrome storage or AON consent");

  let prevented = false;
  popup.shoppingTab.dispatch("keydown", {
    key: "Enter",
    preventDefault: () => { prevented = true; }
  });
  assert.equal(prevented, true);
  assert.equal(popup.shoppingTab.getAttribute("aria-selected"), "true");
  assert.equal(popup.aiTab.getAttribute("aria-selected"), "false");
  assert.equal(popup.shoppingPanel.hidden, false);
  assert.equal(popup.aiPanel.hidden, true);

  popup.shoppingTab.dispatch("keydown", { key: "ArrowRight", preventDefault() {} });
  assert.equal(popup.aiTab.getAttribute("aria-selected"), "true");
  assert.equal(popup.aiTab.focused, true);

  await new Promise(resolve => setImmediate(resolve));
});

test("a new popup instance always starts on Shopping without changing consent", async () => {
  const popup = createPopup();

  assert.equal(popup.aiTab.getAttribute("aria-selected"), "false");
  assert.equal(popup.shoppingTab.getAttribute("aria-selected"), "true");
  assert.equal(popup.aiPanel.hidden, true);
  assert.equal(popup.shoppingPanel.hidden, false);
  assert.equal(popup.localStorageWrites.length, 0);
  assert.equal(popup.chromeStorageWrites.length, 0);

  await new Promise(resolve => setImmediate(resolve));
});
