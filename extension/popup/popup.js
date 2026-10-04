"use strict";

const { defaults, normalize } = globalThis.AbsoluteScrollingSettings;
const enabled = document.querySelector("#enabled");
const sensitivity = document.querySelector("#sensitivity");
const sensitivityValue = document.querySelector("#sensitivity-value");
const mappedValue = document.querySelector("#mapped-value");
const status = document.querySelector("#status");

function render() {
  sensitivityValue.textContent = `${Number(sensitivity.value)}×`;
  mappedValue.replaceChildren(document.createTextNode(String(20 * Number(sensitivity.value))));
  const percent = document.createElement("span");
  percent.textContent = "%";
  mappedValue.append(percent);
  sensitivity.disabled = !enabled.checked;
}

async function save() {
  render();
  try {
    await browser.storage.local.set(normalize({
      enabled: enabled.checked,
      sensitivity: Number(sensitivity.value),
    }));
    status.textContent = enabled.checked ? "Ready on supported pages" : "Scrolling paused";
  } catch (error) {
    status.textContent = "Couldn't save. Reopen this panel to try again.";
    console.warn("Absolute Scrolling: unable to save settings", error);
  }
}

browser.storage.local.get(defaults).then((saved) => {
  const settings = normalize(saved);
  enabled.checked = settings.enabled;
  enabled.disabled = false;
  sensitivity.value = settings.sensitivity;
  render();
  status.textContent = settings.enabled ? "Ready on supported pages" : "Scrolling paused";
}).catch(() => {
  status.textContent = "Couldn't load settings. Reopen this panel to try again.";
});

enabled.addEventListener("change", save);
sensitivity.addEventListener("input", render);
sensitivity.addEventListener("change", save);
