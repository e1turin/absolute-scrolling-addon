(() => {
  "use strict";

  const { defaults, storageDefaults, normalize } = globalThis.AbsoluteScrollingSettings;
  const { compile } = globalThis.AbsoluteScrollingPatterns;
  const ignoredSelector = [
    "a[href]", "area[href]", "input", "textarea", "select", "button",
    "video", "audio", "canvas", '[draggable="true"]',
    '[role="slider"]', "[data-absolute-scrolling-ignore]",
  ].join(",");
  let settings = { ...defaults };
  let ready = false;
  let gesture = null;
  let suppressAuxClick = false;
  let pageUrl = window.location.href;
  let isExcluded = compile([]);

  Promise.all([
    browser.storage.local.get(storageDefaults),
    window === window.top ? pageUrl : browser.runtime.sendMessage({ type: "absolute-scrolling:get-page-url" }),
  ]).then(([saved, topUrl]) => {
    settings = normalize(saved);
    pageUrl = topUrl || pageUrl;
    isExcluded = compile(settings.disabledPatterns);
    ready = true;
  }).catch((error) => console.warn("Absolute Scrolling: unable to load settings", error));

  browser.runtime.onMessage.addListener((message) => {
    if (message?.type === "absolute-scrolling:page-url") {
      pageUrl = message.url;
      if (excluded()) finish();
    }
  });

  function excluded() {
    return isExcluded(window === window.top ? window.location.href : pageUrl) || isExcluded(window.location.href);
  }

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    for (const key of Object.keys(defaults)) {
      if (key in changes) settings[key] = changes[key].newValue ?? defaults[key];
    }
    settings = normalize(settings);
    isExcluded = compile(settings.disabledPatterns);
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
      const axes = scrollAxes(element, style);
      if (axes.x || axes.y) return { scroller: element, axes };
      // Respect an explicitly isolated scroll area, even when it has no overflow.
      if (["X", "Y"].some((axis) => style[`overscrollBehavior${axis}`] !== "auto" && /^(auto|scroll)$/.test(style[`overflow${axis}`]))) {
        return null;
      }
    }
    if (!root) return null;
    const axes = scrollAxes(root, getComputedStyle(root));
    return axes.x || axes.y ? { scroller: root, axes } : null;
  }

  function scrollAxes(element, style) {
    const isRoot = element === document.scrollingElement;
    const allowed = (axis) => {
      let overflow = style[`overflow${axis}`];
      // Body overflow propagates to the viewport when html's overflow is visible.
      if (isRoot && overflow === "visible" && document.body) overflow = getComputedStyle(document.body)[`overflow${axis}`];
      return isRoot ? !/^(hidden|clip)$/.test(overflow) : /^(auto|scroll|overlay)$/.test(overflow);
    };
    return {
      x: allowed("X") && element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 1,
      y: allowed("Y") && element.clientHeight > 0 && element.scrollHeight > element.clientHeight + 1,
    };
  }

  function bounds(element, axis) {
    const range = Math.max(0, axis === "x" ? element.scrollWidth - element.clientWidth : element.scrollHeight - element.clientHeight);
    const style = getComputedStyle(element);
    const flex = style.display.includes("flex");
    const reversed = axis === "x"
      ? (style.direction === "rtl") !== (flex && style.flexDirection === "row-reverse")
      : flex && style.flexDirection === "column-reverse";
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
    if (!ready || !settings.enabled || excluded() || event.button !== 1 || event.buttons !== 4 ||
        event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.defaultPrevented) return;

    const path = event.composedPath();
    if (path.some((element) => element instanceof Element &&
        (element.matches(ignoredSelector) || element.isContentEditable)) ||
        document.designMode === "on") return;

    const target = findScroller(path);
    if (!target || !window.innerHeight || !window.innerWidth) return;
    const { scroller, axes } = target;

    cancel(event); // Prevent Firefox's velocity-based autoscroll (and middle paste).
    suppressAuxClick = true;
    gesture = {
      scroller,
      axes,
      startX: event.clientX,
      lastX: event.clientX,
      startY: event.clientY,
      lastY: event.clientY,
      startScrollTop: scroller.scrollTop,
      startScrollLeft: scroller.scrollLeft,
      // Freeze the scale until release so lazy-loaded content cannot change it mid-drag.
      scaleX: axes.x ? bounds(scroller, "x").range / window.innerWidth * settings.horizontalSensitivity : 0,
      scaleY: axes.y ? bounds(scroller, "y").range / window.innerHeight * settings.verticalSensitivity : 0,
      restore: overrideStyles(scroller),
    };
    document.documentElement.setAttribute("data-absolute-scrolling-active", axes.x && axes.y ? "xy" : axes.x ? "x" : "y");
    // Also cancel any smooth scrolling that was already in progress.
    scroller.scrollTo({ top: gesture.startScrollTop, left: scroller.scrollLeft, behavior: "instant" });
  }

  function move(event) {
    if (!gesture || !event.isTrusted) return;
    if (!(event.buttons & 4) || !gesture.scroller.isConnected || excluded()) {
      finish();
      return;
    }
    cancel(event);
    if (event.clientX === gesture.lastX && event.clientY === gesture.lastY) return;
    gesture.lastX = event.clientX;
    gesture.lastY = event.clientY;
    const { scroller, axes, startScrollTop, startScrollLeft, startX, startY, scaleX, scaleY } = gesture;
    const x = bounds(scroller, "x");
    const y = bounds(scroller, "y");
    // Absolute from the original press, never accumulated deltas or a velocity loop.
    scroller.scrollTo({
      top: axes.y ? Math.min(y.max, Math.max(y.min, startScrollTop + (event.clientY - startY) * scaleY)) : scroller.scrollTop,
      left: axes.x ? Math.min(x.max, Math.max(x.min, startScrollLeft + (event.clientX - startX) * scaleX)) : scroller.scrollLeft,
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
