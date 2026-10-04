/* Shared by the content script and the toolbar popup; no build step needed. */
globalThis.AbsoluteScrollingSettings = Object.freeze({
  minimumSensitivity: 0.25,
  maximumSensitivity: 20,
  sensitivityStep: 0.25,
  defaults: Object.freeze({
    enabled: true,
    verticalSensitivity: 1,
    horizontalSensitivity: 4,
    disabledPatterns: Object.freeze([]),
  }),
  storageDefaults: Object.freeze({
    enabled: true,
    verticalSensitivity: 1,
    horizontalSensitivity: 4,
    disabledPatterns: Object.freeze([]),
    // Read-only migration value from versions 0.1–0.2. New writes omit it.
    sensitivity: null,
  }),
  normalize(values = {}) {
    const clampSensitivity = (value, fallback) => {
      const number = typeof value === "number" && Number.isFinite(value) ? value : fallback;
      return Math.round(Math.min(20, Math.max(0.25, number)) * 4) / 4;
    };
    const legacySensitivity = typeof values.sensitivity === "number" && Number.isFinite(values.sensitivity)
      ? values.sensitivity : null;
    return {
      enabled: typeof values.enabled === "boolean" ? values.enabled : true,
      // Preserve a previous vertical choice. Horizontal gets the faster 4×
      // default because it was previously capped at a too-slow 2×.
      verticalSensitivity: clampSensitivity(values.verticalSensitivity, legacySensitivity ?? 1),
      horizontalSensitivity: clampSensitivity(values.horizontalSensitivity, 4),
      disabledPatterns: Array.isArray(values.disabledPatterns)
        ? [...new Set(values.disabledPatterns.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()))]
        : [],
    };
  },
});
