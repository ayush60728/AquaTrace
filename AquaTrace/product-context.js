(() => {
  "use strict";

  const LIMITS = Object.freeze({
    title: 200,
    category: 120,
    price: 32,
    currency: 3
  });

  const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F]/g;
  const SUPPORTED_CURRENCIES = new Set(["INR", "USD"]);

  const AMAZON_TITLE_SELECTORS = [
    "#productTitle",
    "#title h1",
    "h1#title",
    "[data-feature-name=\"title\"] h1"
  ];

  const FLIPKART_TITLE_SELECTORS = [
    "h1.B_NuCI",
    "h1._6EBuv",
    "h1[data-testid=\"product-name\"]",
    "[data-testid=\"product-name\"]",
    "[class*=\"productName\"]"
  ];

  const FLIPKART_STRONG_TITLE_SELECTORS = [
    "h1.B_NuCI",
    "h1._6EBuv",
    "h1[data-testid=\"product-name\"]",
    "[data-testid=\"product-name\"]"
  ];

  const COMMON_TITLE_SELECTORS = [
    "[itemprop=\"name\"]",
    "h1"
  ];

  const AMAZON_PRICE_SELECTORS = [
    "#corePriceDisplay_desktop_feature_div .a-price .a-offscreen",
    "#corePrice_feature_div .a-price .a-offscreen",
    "#apex_desktop .a-price .a-offscreen",
    "#buybox .a-price .a-offscreen",
    "#priceblock_ourprice",
    "#priceblock_dealprice",
    "#priceblock_saleprice",
    "#priceblock_pospprice",
    "#price_inside_buybox",
    "[data-a-color=\"price\"] .a-offscreen"
  ];

  const FLIPKART_PRICE_SELECTORS = [
    "[data-testid=\"price\"]",
    "[data-test=\"price\"]",
    "._30jeq3",
    "._1_WHN1",
    "._25b18c",
    "._16Jk6d",
    "._3I9_wc",
    "[class*=\"price\"]"
  ];

  const COMMON_PRICE_SELECTORS = [
    "[itemprop=\"price\"]",
    "meta[property=\"product:price:amount\"]",
    "meta[property=\"product:price\"]",
    "meta[property=\"og:price:amount\"]",
    "meta[name=\"price\"]",
    "[data-price]"
  ];

  const CATEGORY_SELECTORS = [
    "[itemprop=\"category\"]",
    "[data-category]"
  ];

  const CATEGORY_META_SELECTORS = [
    "meta[property=\"product:category\"]",
    "meta[name=\"category\"]",
    "meta[itemprop=\"category\"]"
  ];

  const CURRENCY_SELECTORS = [
    "[itemprop=\"priceCurrency\"]",
    "[data-price-currency]",
    "[data-currency]"
  ];

  const CURRENCY_META_SELECTORS = [
    "meta[property=\"product:price:currency\"]",
    "meta[property=\"og:price:currency\"]",
    "meta[name=\"priceCurrency\"]",
    "meta[name=\"currency\"]",
    "meta[itemprop=\"priceCurrency\"]"
  ];

  const BREADCRUMB_SELECTORS = [
    "#wayfinding-breadcrumbs_feature_div a",
    "#wayfinding-breadcrumbs_container a",
    "#breadcrumb a",
    "nav[aria-label*=\"breadcrumb\"] a",
    "[class*=\"breadcrumb\"] a"
  ];

  const STRONG_PRODUCT_SELECTORS = [
    "#productTitle",
    "#dp-container",
    "#buybox",
    "#corePrice_feature_div",
    "#corePriceDisplay_desktop_feature_div",
    "[data-testid=\"product-detail\"]"
  ];

  function getDocument() {
    return typeof document !== "undefined" ? document : null;
  }

  function getHost() {
    if (typeof location === "undefined" || typeof location.hostname !== "string") return "";
    return location.hostname.toLowerCase().replace(/\.$/, "");
  }

  function getPathname() {
    if (typeof location === "undefined" || typeof location.pathname !== "string") return "";
    return location.pathname;
  }

  function isSupportedHost(host) {
    return host === "amazon.in" || host.endsWith(".amazon.in")
      || host === "amazon.com" || host.endsWith(".amazon.com")
      || host === "flipkart.com" || host.endsWith(".flipkart.com");
  }

  function isAmazonHost(host) {
    return host === "amazon.in" || host.endsWith(".amazon.in")
      || host === "amazon.com" || host.endsWith(".amazon.com");
  }

  function isFlipkartHost(host) {
    return host === "flipkart.com" || host.endsWith(".flipkart.com");
  }

  function cleanText(value, limit) {
    if (typeof value !== "string" && typeof value !== "number") return "";

    const normalized = String(value)
      .replace(/(?:\b[a-z][a-z\d+.-]*:\/\/|\bwww\.|\/\/)\S+/gi, "")
      .replace(CONTROL_CHARACTERS, " ")
      .replace(/\s+/g, " ")
      .trim();

    return Array.from(normalized).slice(0, limit).join("").trim();
  }

  function query(selector) {
    const page = getDocument();
    if (!page || typeof page.querySelector !== "function") return null;

    try {
      return page.querySelector(selector);
    } catch {
      return null;
    }
  }

  function queryAll(selector) {
    const page = getDocument();
    if (!page || typeof page.querySelectorAll !== "function") return [];

    try {
      return Array.from(page.querySelectorAll(selector));
    } catch {
      return [];
    }
  }

  function hasAny(selectors) {
    return selectors.some(selector => Boolean(query(selector)));
  }

  function readAttribute(node, name) {
    if (!node) return "";

    if (typeof node.getAttribute === "function") {
      try {
        const value = node.getAttribute(name);
        if (typeof value === "string" && value) return value;
      } catch {
        // Ignore malformed page nodes.
      }
    }

    const property = node[name];
    return typeof property === "string" || typeof property === "number" ? String(property) : "";
  }

  function readNodeValue(node) {
    if (!node) return "";

    const content = readAttribute(node, "content");
    if (content) return content;

    const value = readAttribute(node, "value");
    if (value) return value;

    const dataValue = readAttribute(node, "data-value");
    if (dataValue) return dataValue;

    const dataPrice = readAttribute(node, "data-price");
    if (dataPrice) return dataPrice;

    const dataCurrency = readAttribute(node, "data-currency");
    if (dataCurrency) return dataCurrency;

    const dataPriceCurrency = readAttribute(node, "data-price-currency");
    if (dataPriceCurrency) return dataPriceCurrency;

    return typeof node.textContent === "string" ? node.textContent : "";
  }

  function firstNodeValue(selectors) {
    for (const selector of selectors) {
      const node = query(selector);
      const value = cleanText(readNodeValue(node), 256);
      if (value) return value;
    }
    return "";
  }

  function firstMetaValue(selectors) {
    return firstNodeValue(selectors);
  }

  function firstItemValue(selectors, limit) {
    for (const selector of selectors) {
      for (const node of queryAll(selector)) {
        const value = cleanText(readNodeValue(node), limit);
        if (value) return value;
      }
    }
    return "";
  }

  function isProductType(value) {
    const types = Array.isArray(value) ? value : [value];
    return types.some(type => {
      if (typeof type !== "string") return false;
      const name = type.toLowerCase().split("/").pop();
      return name === "product";
    });
  }

  function directProductFromJson(value) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const product = directProductFromJson(item);
        if (product) return product;
      }
      return null;
    }

    if (!value || typeof value !== "object") return null;

    if (isProductType(value["@type"])) return value;

    if (Array.isArray(value["@graph"])) {
      const graphProduct = value["@graph"].find(item => item && typeof item === "object"
        && isProductType(item["@type"]));
      if (graphProduct) return graphProduct;
    }

    return null;
  }

  function getJsonLdProduct() {
    for (const script of queryAll('script[type="application/ld+json"]')) {
      const source = script && typeof script.textContent === "string" ? script.textContent : "";
      if (!source) continue;

      try {
        const product = directProductFromJson(JSON.parse(source));
        if (product) return product;
      } catch {
        // Ignore invalid or non-JSON-LD scripts.
      }
    }
    return null;
  }

  function firstText(value, limit) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const text = firstText(item, limit);
        if (text) return text;
      }
      return "";
    }

    if (value && typeof value === "object") {
      return firstText(value.name, limit);
    }

    return cleanText(value, limit);
  }

  function offerEntries(value) {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  }

  function getOfferPrice(product) {
    for (const offer of offerEntries(product && product.offers)) {
      if (!offer || typeof offer !== "object") continue;

      const specifications = offerEntries(offer.priceSpecification);
      const candidates = [offer, ...specifications];
      for (const candidate of candidates) {
        if (!candidate || typeof candidate !== "object") continue;

        const rawPrice = candidate.price != null
          ? candidate.price
          : candidate.lowPrice != null ? candidate.lowPrice : "";
        const price = normalizePrice(rawPrice);
        if (price) {
          return {
            rawPrice: cleanText(rawPrice, 128),
            price,
            currency: normalizeCurrency(candidate.priceCurrency)
          };
        }
      }
    }

    return null;
  }

  function normalizePrice(value) {
    const text = cleanText(value, 128).replace(/[\u00A0\u202F]/g, " ");
    const match = text.match(/\d[\d\s,.'\u00A0\u202F]*\d|\d/);
    if (!match) return "";

    const token = match[0].replace(/[\s']/g, "");
    const commaIndex = token.lastIndexOf(",");
    const dotIndex = token.lastIndexOf(".");
    let integerPart = token;
    let fractionPart = "";

    if (commaIndex >= 0 && dotIndex >= 0) {
      const decimalIndex = Math.max(commaIndex, dotIndex);
      const possibleFraction = token.slice(decimalIndex + 1);
      if (possibleFraction.length >= 1) {
        integerPart = token.slice(0, decimalIndex).replace(/[.,]/g, "");
        fractionPart = possibleFraction;
      } else {
        integerPart = token.replace(/[.,]/g, "");
      }
    } else if (commaIndex >= 0) {
      const possibleFraction = token.slice(commaIndex + 1);
      if (possibleFraction.length >= 1 && possibleFraction.length <= 2) {
        integerPart = token.slice(0, commaIndex).replace(/,/g, "");
        fractionPart = possibleFraction;
      } else {
        integerPart = token.replace(/,/g, "");
      }
    } else if (dotIndex >= 0) {
      const possibleFraction = token.slice(dotIndex + 1);
      const dotCount = (token.match(/\./g) || []).length;
      if (dotCount === 1) {
        integerPart = token.slice(0, dotIndex);
        fractionPart = possibleFraction;
      } else if (possibleFraction.length >= 1 && possibleFraction.length <= 2) {
        integerPart = token.slice(0, dotIndex).replace(/\./g, "");
        fractionPart = possibleFraction;
      } else {
        integerPart = token.replace(/\./g, "");
      }
    }

    integerPart = integerPart.replace(/\D/g, "");
    fractionPart = fractionPart.replace(/\D/g, "");
    if (!integerPart) return "";

    const normalized = fractionPart ? `${integerPart}.${fractionPart}` : integerPart;
    return normalized.length <= LIMITS.price ? normalized : "";
  }

  function normalizeCurrency(value) {
    const text = cleanText(value, 32).toUpperCase();
    if (!text) return "";

    if (/\bINR\b|₹|\bRS\.?\b|RUPEE/.test(text)) return "INR";
    if (/\bUSD\b|US\$|\$/.test(text)) return "USD";

    const code = text.match(/\b[A-Z]{3}\b/);
    return code && SUPPORTED_CURRENCIES.has(code[0]) ? code[0] : "";
  }

  function currencyFromHost(host) {
    if (host === "www.flipkart.com" || host === "flipkart.com" || host.endsWith(".flipkart.com")
      || host === "amazon.in" || host.endsWith(".amazon.in")) return "INR";
    if (host === "amazon.com" || host.endsWith(".amazon.com")) return "USD";
    return "";
  }

  function productPath(host, pathname) {
    if (isAmazonHost(host)) {
      return /\/(?:dp|gp\/product|gp\/aw\/d|product)\/[A-Z0-9]{5,}/i.test(pathname);
    }
    if (isFlipkartHost(host)) return /\/p\/[A-Za-z0-9_-]+/i.test(pathname);
    return false;
  }

  function likelyListingPath(host, pathname) {
    if (isAmazonHost(host)) {
      return pathname === "/"
        || /\/(?:s|gp\/bestsellers|stores|b|hz)(?:\/|$)/i.test(pathname);
    }
    if (isFlipkartHost(host)) {
      return pathname === "/" || /\/(?:search|viewcart|account)(?:\/|$)/i.test(pathname);
    }
    return true;
  }

  function hasProductMetadata() {
    const type = firstMetaValue([
      'meta[property="og:type"]',
      'meta[name="og:type"]'
    ]).toLowerCase();
    return type === "product";
  }

  function hasProductDomSignal(host) {
    if (hasAny(STRONG_PRODUCT_SELECTORS)) return true;

    if (isAmazonHost(host)) {
      return hasAny([
        "#productTitle",
        "#title h1",
        "#priceblock_ourprice",
        "#priceblock_dealprice"
      ]);
    }
    if (isFlipkartHost(host)) return hasAny(FLIPKART_STRONG_TITLE_SELECTORS);
    return false;
  }

  function getTitle(host, product) {
    const jsonTitle = firstText(product && product.name, LIMITS.title);
    if (jsonTitle) return jsonTitle;

    const hostSelectors = isAmazonHost(host)
      ? AMAZON_TITLE_SELECTORS
      : isFlipkartHost(host) ? FLIPKART_TITLE_SELECTORS : [];
    const domTitle = firstNodeValue(hostSelectors);
    if (domTitle) return cleanText(domTitle, LIMITS.title);

    const genericTitle = firstNodeValue(COMMON_TITLE_SELECTORS);
    if (genericTitle) return cleanText(genericTitle, LIMITS.title);

    return cleanText(firstMetaValue([
      'meta[property="og:title"]',
      'meta[property="product:name"]',
      'meta[name="title"]'
    ]), LIMITS.title);
  }

  function isPlausibleCategory(value) {
    // Navigation menus and mega-menus often expose long run-together text
    // through generic attributes; real category names are short.
    return Boolean(value) && value.length <= 60;
  }

  function getBreadcrumbCategory(host, title) {
    const selectors = isAmazonHost(host)
      ? BREADCRUMB_SELECTORS.slice(0, 2)
      : isFlipkartHost(host) ? BREADCRUMB_SELECTORS.slice(2) : BREADCRUMB_SELECTORS;

    for (const selector of selectors) {
      const values = queryAll(selector)
        .map(node => cleanText(readNodeValue(node), LIMITS.category))
        .filter(value => isPlausibleCategory(value) && value !== title && !/^(home|all|categories?)$/i.test(value));
      if (values.length) return values[values.length - 1];
    }
    return "";
  }

  function getCategory(host, product, title) {
    // The page breadcrumb is the most reliable source on Amazon and Flipkart.
    const breadcrumbCategory = getBreadcrumbCategory(host, title);
    if (isPlausibleCategory(breadcrumbCategory)) return breadcrumbCategory;

    const jsonCategory = firstText(product && product.category, LIMITS.category);
    if (isPlausibleCategory(jsonCategory)) return jsonCategory;

    const itemCategory = firstItemValue(CATEGORY_SELECTORS, LIMITS.category);
    if (isPlausibleCategory(itemCategory)) return itemCategory;

    const metaCategory = cleanText(firstMetaValue(CATEGORY_META_SELECTORS), LIMITS.category);
    if (isPlausibleCategory(metaCategory)) return metaCategory;

    return "";
  }

  function getPrice(product) {
    const jsonOffer = getOfferPrice(product);
    if (jsonOffer) return jsonOffer;

    const domPrice = firstNodeValue(COMMON_PRICE_SELECTORS);
    if (domPrice) {
      const price = normalizePrice(domPrice);
      if (price) return { rawPrice: domPrice, price, currency: "" };
    }

    const host = getHost();
    const hostSelectors = isAmazonHost(host)
      ? AMAZON_PRICE_SELECTORS
      : isFlipkartHost(host) ? FLIPKART_PRICE_SELECTORS : [];
    const hostPrice = firstNodeValue(hostSelectors);
    const price = normalizePrice(hostPrice);
    return price ? { rawPrice: hostPrice, price, currency: "" } : null;
  }

  function getCurrency(priceInfo) {
    const explicit = normalizeCurrency(firstMetaValue(CURRENCY_META_SELECTORS));
    if (explicit) return explicit;

    const nodeCurrency = normalizeCurrency(firstNodeValue(CURRENCY_SELECTORS));
    if (nodeCurrency) return nodeCurrency;

    if (priceInfo && priceInfo.currency) return priceInfo.currency;

    const symbolCurrency = normalizeCurrency(priceInfo && priceInfo.rawPrice);
    if (symbolCurrency) return symbolCurrency;

    return currencyFromHost(getHost());
  }

  function extractProductData() {
    const host = getHost();
    const pathname = getPathname();
    if (!isSupportedHost(host)) return null;

    const product = getJsonLdProduct();
    const isListing = likelyListingPath(host, pathname);
    const title = getTitle(host, product);
    const priceInfo = getPrice(product);
    const hasValuePair = Boolean(title && priceInfo && priceInfo.price);
    const productRoute = productPath(host, pathname);
    const strongEvidence = hasProductDomSignal(host) || hasProductMetadata() || product;
    const hasProductSignal = productRoute
      ? strongEvidence || hasValuePair
      : !isListing && strongEvidence;
    if (!hasProductSignal) return null;

    const price = priceInfo ? priceInfo.price : "";
    const category = getCategory(host, product, title);
    if (!title && !price && !category) return null;

    return {
      title: cleanText(title, LIMITS.title),
      category: cleanText(category, LIMITS.category),
      price: cleanText(price, LIMITS.price),
      currency: cleanText(getCurrency(priceInfo), LIMITS.currency)
    };
  }

  // The shopping-offers content script runs beside this reusable extractor in
  // the same extension isolated world. Keeping the extractor here means the
  // popup and the in-page offer bar share exactly the same product context.
  if (typeof globalThis !== "undefined") {
    globalThis.AquaTraceProductContext = Object.freeze({
      extractProductData,
      isSupportedHost
    });
  }

  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage
    && typeof chrome.runtime.onMessage.addListener === "function") {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || message.type !== "GET_PRODUCT_DATA") return undefined;

      let result = null;
      try {
        result = extractProductData();
      } catch {
        result = null;
      }

      if (typeof sendResponse === "function") sendResponse(result);
      return false;
    });
  }
})();
