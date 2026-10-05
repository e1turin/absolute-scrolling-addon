"use strict";

const extensionApi = globalThis.browser ?? globalThis.chrome;
const { defaults, storageDefaults, normalize } = globalThis.AbsoluteScrollingSettings;
const patterns = globalThis.AbsoluteScrollingPatterns;
const enabled = document.querySelector("#enabled");
const verticalSensitivity = document.querySelector("#vertical-sensitivity");
const horizontalSensitivity = document.querySelector("#horizontal-sensitivity");
const verticalMappedValue = document.querySelector("#vertical-mapped-value");
const horizontalMappedValue = document.querySelector("#horizontal-mapped-value");
const status = document.querySelector("#status");
const patternInput = document.querySelector("#pattern");
const patternError = document.querySelector("#pattern-error");
const patternList = document.querySelector("#patterns");
const disablePage = document.querySelector("#disable-page");
const disableSite = document.querySelector("#disable-site");
let settings = { ...defaults };
let currentUrl = null;
let pagePattern = null;
let sitePattern = null;
let savingPatterns = false;

function sensitivityValue(input, fallback) {
  return input.validity.valid && Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : fallback;
}

function setPercent(output, value) {
  output.replaceChildren(document.createTextNode(String(20 * value)));
  const percent = document.createElement("span");
  percent.textContent = "%";
  output.append(percent);
}

function renderSensitivities() {
  setPercent(verticalMappedValue, sensitivityValue(verticalSensitivity, settings.verticalSensitivity));
  setPercent(horizontalMappedValue, sensitivityValue(horizontalSensitivity, settings.horizontalSensitivity));
  verticalSensitivity.disabled = !enabled.checked;
  horizontalSensitivity.disabled = !enabled.checked;
}

function renderPatterns() {
  const list = settings.disabledPatterns;
  document.querySelector("#pattern-count").textContent = list.length;
  document.querySelector("#empty-patterns").hidden = list.length > 0;
  document.querySelector("#page-state").textContent = !pagePattern
    ? "Open a webpage to add its URL here."
    : patterns.compile(list)(currentUrl) ? "Disabled on this page" : settings.enabled ? "Active on this page" : "Scrolling is paused everywhere";
  disablePage.disabled = savingPatterns || !pagePattern || list.includes(pagePattern);
  disableSite.disabled = savingPatterns || !sitePattern || list.includes(sitePattern);
  document.querySelector("#add-pattern").disabled = savingPatterns;
  patternList.replaceChildren();
  for (const pattern of list) {
    const item = document.createElement("li");
    const label = document.createElement("code");
    label.textContent = pattern;
    label.title = pattern;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove";
    remove.setAttribute("aria-label", `Remove ${pattern}`);
    remove.disabled = savingPatterns;
    remove.addEventListener("click", () => savePatterns(settings.disabledPatterns.filter((value) => value !== pattern), "Pattern removed"));
    item.append(label, remove);
    patternList.append(item);
  }
}

function showPatternError(message = "") {
  patternError.textContent = message;
  patternError.hidden = !message;
  patternInput.setAttribute("aria-invalid", String(Boolean(message)));
}

async function savePreferences() {
  if (!verticalSensitivity.validity.valid || !horizontalSensitivity.validity.valid) {
    status.textContent = "Use a value from 0.25× to 20× in 0.25× steps.";
    return;
  }
  const patch = {
    enabled: enabled.checked,
    verticalSensitivity: verticalSensitivity.valueAsNumber,
    horizontalSensitivity: horizontalSensitivity.valueAsNumber,
  };
  try {
    // Update only these fields so a preference edit can never erase exclusions.
    await extensionApi.storage.local.set(patch);
    settings = normalize({ ...settings, ...patch });
    verticalSensitivity.value = settings.verticalSensitivity;
    horizontalSensitivity.value = settings.horizontalSensitivity;
    renderSensitivities();
    renderPatterns();
    status.textContent = settings.enabled ? "Ready on supported pages" : "Scrolling paused";
  } catch (error) {
    status.textContent = "Couldn't save. Reopen this panel to try again.";
    console.warn("Absolute Scrolling: unable to save settings", error);
  }
}

async function savePatterns(nextPatterns, message) {
  if (savingPatterns) return;
  savingPatterns = true;
  showPatternError();
  renderPatterns();
  try {
    await extensionApi.storage.local.set({ disabledPatterns: nextPatterns });
    settings.disabledPatterns = nextPatterns;
    status.textContent = message;
  } catch (error) {
    showPatternError("Couldn't save the list. Please try again.");
    console.warn("Absolute Scrolling: unable to save exclusions", error);
  } finally {
    savingPatterns = false;
    renderPatterns();
  }
}

async function addPattern(value) {
  let pattern;
  try { pattern = patterns.normalize(value); }
  catch (error) { showPatternError(error.message); return; }
  if (settings.disabledPatterns.includes(pattern)) {
    showPatternError("This pattern is already in the list.");
    return;
  }
  await savePatterns([...settings.disabledPatterns, pattern], "Pattern saved — matching pages are disabled");
}

async function initialize() {
  const saved = await extensionApi.storage.local.get(storageDefaults);
  settings = normalize(saved);
  try {
    const [tab] = await extensionApi.tabs.query({ active: true, currentWindow: true });
    currentUrl = tab?.url || null;
    if (currentUrl) {
      pagePattern = patterns.pagePattern(currentUrl);
      sitePattern = patterns.sitePattern(currentUrl);
    }
  } catch { /* Custom patterns remain available on inaccessible pages. */ }
  enabled.checked = settings.enabled;
  enabled.disabled = false;
  verticalSensitivity.value = settings.verticalSensitivity;
  horizontalSensitivity.value = settings.horizontalSensitivity;
  patternInput.disabled = false;
  patternInput.value = pagePattern || "";
  renderSensitivities();
  renderPatterns();
  status.textContent = settings.enabled ? "Ready on supported pages" : "Scrolling paused";
}

initialize().catch(() => {
  status.textContent = "Couldn't load settings. Reopen this panel to try again.";
});

enabled.addEventListener("change", savePreferences);
verticalSensitivity.addEventListener("input", renderSensitivities);
horizontalSensitivity.addEventListener("input", renderSensitivities);
verticalSensitivity.addEventListener("change", savePreferences);
horizontalSensitivity.addEventListener("change", savePreferences);
patternInput.addEventListener("input", () => showPatternError());
document.querySelector("#pattern-form").addEventListener("submit", (event) => {
  event.preventDefault();
  addPattern(patternInput.value);
});
disablePage.addEventListener("click", () => addPattern(pagePattern));
disableSite.addEventListener("click", () => addPattern(sitePattern));
