(() => {
  "use strict";

  const { defaults, normalize } = globalThis.AbsoluteScrollingSettings;
  const ignoredSelector = [
    "a[href]", "area[href]", "input", "textarea", "select", "button",
    "video", "audio", "canvas", '[draggable="true"]',
    '[role="slider"]', "[data-absolute-scrolling-ignore]",
  ].join(",");
  let settings = { ...defaults };
  let ready = false;
  let gesture = null;
  let suppressAuxClick = false;

  browser.storage.local.get(defaults).then((saved) => {
    settings = normalize(saved);
    ready = true;
  }).catch((error) => console.warn("Absolute Scrolling: unable to load settings", error));

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    for (const key of Object.keys(defaults)) {
      if (key in changes) settings[key] = changes[key].newValue ?? defaults[key];
    }
    settings = normalize(settings);
    finish();
  });

  function cancel(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function findScroller(path) {
    const root = document.scrollingElement;
    for (const element of path) {
      if (!(element instanceof Element) || element === root) continue;
      const style = getComputedStyle(element);
      if (/^(auto|scroll|overlay)$/.test(style.overflowY) &&
          element.scrollHeight > element.clientHeight + 1 && element.clientHeight > 0) {
        return element;
      }
      // Respect an explicitly isolated scroll area, even when it has no overflow.
      if (style.overscrollBehaviorY !== "auto" && /^(auto|scroll)$/.test(style.overflowY)) {
        return null;
      }
    }
    if (!root || root.scrollHeight <= root.clientHeight + 1) return null;
    if (/^(hidden|clip)$/.test(getComputedStyle(root).overflowY)) return null;
    // Body overflow can propagate to the viewport when html's overflow is visible.
    if (document.body && getComputedStyle(root).overflowY === "visible" &&
        /^(hidden|clip)$/.test(getComputedStyle(document.body).overflowY)) return null;
    return root;
  }

  function bounds(element) {
    const range = Math.max(0, element.scrollHeight - element.clientHeight);
    const style = getComputedStyle(element);
    const reversed = style.display.includes("flex") && style.flexDirection === "column-reverse";
    return { min: reversed ? -range : 0, max: reversed ? 0 : range, range };
  }

  function overrideStyles(element) {
    const properties = { "scroll-behavior": "auto", "scroll-snap-type": "none", "overflow-anchor": "none" };
    const previous = Object.entries(properties).map(([property, value]) => {
      const oldValue = element.style.getPropertyValue(property);
      const oldPriority = element.style.getPropertyPriority(property);
      element.style.setProperty(property, value, "important");
      return { property, value, oldValue, oldPriority };
    });
    return () => {
      for (const { property, value, oldValue, oldPriority } of previous) {
        // Don't overwrite a style the page itself changed during the gesture.
        if (element.style.getPropertyValue(property) !== value ||
            element.style.getPropertyPriority(property) !== "important") continue;
        if (oldValue) element.style.setProperty(property, oldValue, oldPriority);
        else element.style.removeProperty(property);
      }
    };
  }

  function start(event) {
    if (!event.isTrusted) return;
    // A fresh press must never inherit suppression from a release outside the page.
    suppressAuxClick = false;
    finish();
    if (!ready || !settings.enabled || event.button !== 1 || event.buttons !== 4 ||
        event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.defaultPrevented) return;

    const path = event.composedPath();
    if (path.some((element) => element instanceof Element &&
        (element.matches(ignoredSelector) || element.isContentEditable)) ||
        document.designMode === "on") return;

    const scroller = findScroller(path);
    if (!scroller) return;
    const { range } = bounds(scroller);
    const viewportHeight = window.innerHeight;
    if (!range || !viewportHeight) return;

    cancel(event); // Prevent Firefox's velocity-based autoscroll (and middle paste).
    suppressAuxClick = true;
    gesture = {
      scroller,
      startY: event.clientY,
      lastY: event.clientY,
      startScrollTop: scroller.scrollTop,
      // Freeze the scale until release so lazy-loaded content cannot change it mid-drag.
      scale: range / viewportHeight * settings.sensitivity,
      restore: overrideStyles(scroller),
    };
    document.documentElement.setAttribute("data-absolute-scrolling-active", "");
    // Also cancel any smooth scrolling that was already in progress.
    scroller.scrollTo({ top: gesture.startScrollTop, left: scroller.scrollLeft, behavior: "instant" });
  }

  function move(event) {
    if (!gesture || !event.isTrusted) return;
    if (!(event.buttons & 4) || !gesture.scroller.isConnected) {
      finish();
      return;
    }
    cancel(event);
    if (event.clientY === gesture.lastY) return;
    gesture.lastY = event.clientY;
    const { scroller, startScrollTop, startY, scale } = gesture;
    const { min, max } = bounds(scroller);
    const position = startScrollTop + (event.clientY - startY) * scale;
    // Absolute from the original press, never accumulated deltas or a velocity loop.
    scroller.scrollTo({
      top: Math.min(max, Math.max(min, position)),
      left: scroller.scrollLeft,
      behavior: "instant",
    });
  }

  function finish() {
    if (!gesture) return;
    const { restore } = gesture;
    gesture = null;
    restore();
    document.documentElement.removeAttribute("data-absolute-scrolling-active");
  }

  window.addEventListener("mousedown", start, { capture: true, passive: false });
  window.addEventListener("mousemove", move, { capture: true, passive: false });
  window.addEventListener("mouseup", (event) => {
    if (event.button !== 1 || !event.isTrusted) return;
    if (gesture) cancel(event);
    finish();
  }, { capture: true, passive: false });
  window.addEventListener("auxclick", (event) => {
    if (event.button !== 1 || !event.isTrusted || !suppressAuxClick) return;
    cancel(event);
    suppressAuxClick = false;
  }, { capture: true, passive: false });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && gesture) {
      cancel(event);
      finish();
    }
  }, true);
  window.addEventListener("blur", finish);
  window.addEventListener("pagehide", finish);
  window.addEventListener("resize", finish);
  window.addEventListener("mouseout", (event) => {
    if (event.relatedTarget === null) finish();
  }, true);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) finish();
  });
})();
