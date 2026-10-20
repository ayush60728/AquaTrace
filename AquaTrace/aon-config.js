// AON deployment configuration. Placement IDs are public; API keys are not.
// Keep the live placement in release builds. For sandbox-only verification,
// temporarily replace this value with the public sandbox placement and add its
// public test key as apiKey locally; never ship a sandbox key as live config.
globalThis.AON_PLACEMENT_ID = "plc_JzfXkYlJazVljtml";
globalThis.AON_CONFIG = Object.freeze({
  placementId: globalThis.AON_PLACEMENT_ID,
  apiOrigin: "https://api.aon.pro"
});
