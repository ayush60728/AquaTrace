"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const backgroundSource = fs.readFileSync(
  path.join(__dirname, "..", "dist", "background.bundle.js"),
  "utf8"
);

function createBackground({ config, response }) {
  const messages = [];
  const fetchCalls = [];
  const context = {
    AON_CONFIG: config,
    AbortController,
    URL,
    clearTimeout,
    console,
    fetch: async (url, options) => {
      fetchCalls.push({ url, options });
      return response;
    },
    importScripts: () => {},
    setTimeout,
    chrome: {
      action: {
        setBadgeText: () => {},
        setBadgeBackgroundColor: () => {}
      },
      runtime: {
        onMessage: { addListener: listener => messages.push(listener) },
        onInstalled: { addListener: () => {} },
        onStartup: { addListener: () => {} }
      },
      storage: {
        local: {
          get: async () => ({ aonAutoMatchesEnabled: true, waterTrackerState: { bySite: {}, history: [] } }),
          set: async () => {}
        }
      }
    }
  };
  vm.runInNewContext(backgroundSource, context, { filename: "background.bundle.js" });
  return { listener: messages[0], fetchCalls };
}

function aonResponse({ isTest = false, offers = [] } = {}) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => "" },
    json: async () => ({
      code: "SUCCESS",
      ...(isTest ? { extra: { is_test: true } } : {}),
      data: {
        protocol_version: "1.0",
        request_id: "019dd200-1234-7890-abcd-ef0123456789",
        offers
      }
    })
  };
}

const sampleOffer = {
  offer_id: "019fc211-c6cd-7e62-9c4d-699c243e6c96",
  offer_instance_id: "019dd208-27d2-7673-b16f-6897fa120303",
  offer_info: {
    title: "FocusFlow",
    description: "A productivity tool.",
    commercial: { price: { amount: "9.99", currency: "USD" } }
  },
  entity: { name: "Example Merchant" },
  action: {
    type: "open_url",
    payload: { url: "https://example.test/focusflow" },
    name: "Try it"
  }
};

async function query(listener, product) {
  return new Promise(resolve => {
    const returned = listener({ type: "AON_QUERY_PRODUCT", product }, {}, result => {
      resolve(JSON.parse(JSON.stringify(result)));
    });
    assert.equal(returned, true, "AON query must keep the message channel open");
  });
}

async function run() {
  {
    const { listener, fetchCalls } = createBackground({
      config: { placementId: "plc_public_test_sandbox", apiOrigin: "https://api.aon.pro", apiKey: "mock-test-key" },
      response: aonResponse({ isTest: true, offers: [sampleOffer] })
    });
    const result = await query(listener, {
      title: "Productivity tools",
      category: "software",
      price: "20",
      currency: "USD"
    });
    assert.equal(result.ok, true);
    assert.equal(result.isTest, true);
    assert.equal(result.offers[0].actionUrl, "https://example.test/focusflow");
    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].options.headers["AON-Protocol-Version"], "1.0");
    assert.equal(fetchCalls[0].options.headers["X-AON-Placement-Id"], "plc_public_test_sandbox");
    assert.equal(fetchCalls[0].options.headers.Authorization, "Bearer mock-test-key");
    const body = JSON.parse(fetchCalls[0].options.body);
    assert.equal(body.context && Object.keys(body.context).length, 0);
    assert.equal(body.intent.provenance, "user_expressed");
    assert.ok(body.intent.content[0].text.length <= 200);
  }

  {
    const { listener, fetchCalls } = createBackground({
      config: { placementId: "plc_JzfXkYlJazVljtml", apiOrigin: "https://api.aon.pro" },
      response: aonResponse()
    });
    const result = await query(listener, { title: "Noise cancelling headphones" });
    assert.equal(result.ok, true);
    assert.deepEqual(result.offers, []);
    assert.equal("Authorization" in fetchCalls[0].options.headers, false);
    assert.equal(fetchCalls[0].options.headers["X-AON-Placement-Id"], "plc_JzfXkYlJazVljtml");
  }

  {
    const { listener, fetchCalls } = createBackground({
      config: { placementId: "plc_JzfXkYlJazVljtml", apiOrigin: "https://api.aon.pro" },
      response: { ok: false, status: 503, headers: { get: () => "" }, json: async () => ({}) }
    });
    const result = await query(listener, { title: "A product" });
    assert.equal(result.ok, false);
    assert.equal(result.code, "AON_UNAVAILABLE");
    assert.equal(fetchCalls.length, 1);
  }

  console.log("AON integration tests passed");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
