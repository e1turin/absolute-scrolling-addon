"use strict";

// A cross-origin frame cannot read top.location. Resolve the owning tab's URL
// here so excluding a page also excludes all of its embedded scroll areas.
browser.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === "absolute-scrolling:get-page-url" && sender.tab) {
    return browser.tabs.get(sender.tab.id).then((tab) => tab.url);
  }
  return undefined;
});

// Includes history.pushState navigation in single-page applications.
browser.tabs.onUpdated.addListener((tabId, changes) => {
  if (typeof changes.url !== "string") return;
  browser.tabs.sendMessage(tabId, {
    type: "absolute-scrolling:page-url",
    url: changes.url,
  }).catch(() => {}); // Some tabs have no accessible content script.
});
