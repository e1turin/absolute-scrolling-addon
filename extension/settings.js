/* Shared by the content script and the toolbar popup; no build step needed. */
globalThis.AbsoluteScrollingSettings = Object.freeze({
  defaults: Object.freeze({ enabled: true, sensitivity: 1 }),
  normalize(values = {}) {
    return {
      enabled: typeof values.enabled === "boolean" ? values.enabled : true,
      sensitivity: typeof values.sensitivity === "number" && Number.isFinite(values.sensitivity)
        ? Math.min(2, Math.max(0.25, values.sensitivity))
        : 1,
    };
  },
});
