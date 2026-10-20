(() => {
  "use strict";

  // Run in the page's MAIN world: an isolated-world history wrapper cannot see
  // pushState/replaceState calls made by a site's SPA. This bridge emits only a
  // notification; product/search data is read in the isolated content script.
  const eventName = "aquatrace-history-change";
  const notify = () => window.dispatchEvent(new Event(eventName));
  for (const method of ["pushState", "replaceState"]) {
    const original = history[method];
    if (typeof original !== "function") continue;
    history[method] = function (...args) {
      const result = Reflect.apply(original, this, args);
      notify();
      return result;
    };
  }
})();
