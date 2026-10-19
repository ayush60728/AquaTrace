// AON deployment configuration. Placement IDs are public; API keys are not.
// The live placement is intentionally configured here so the extension never
// falls back to the public sandbox in a production build.
globalThis.AON_CONFIG = Object.freeze({
  placementId: "plc_JzfXkYlJazVljtml",
  apiOrigin: "https://api.aon.pro"
});
