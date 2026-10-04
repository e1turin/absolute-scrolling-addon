# Absolute Scrolling

A Firefox extension for proportional middle-mouse scrolling. Hold the middle mouse button and move vertically: moving **20% of the viewport height moves 20% of the full scroll range** at the default sensitivity. Stop moving and the page stays still.

## Try it in Firefox

Requires desktop Firefox 140 or later and a mouse with a middle button. No build step is needed to load the extension.

1. Open `about:debugging#/runtime/this-firefox` in Firefox.
2. Click **Load Temporary Add-on…**.
3. Select `extension/manifest.json` from this project.
4. Open or reload a normal webpage. Hold the middle button over page content and move up or down.

Use the extension's toolbar panel to pause scrolling or adjust sensitivity from 0.25× to 2×. Preferences are saved locally and apply to already-open pages.

Temporary add-ons are removed when Firefox restarts. For permanent installation in standard Firefox, the extension must be signed by Mozilla; the build command below produces an **unsigned** archive suitable for submission. See Mozilla's [temporary installation guide](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/) and [signing and distribution guide](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/).

## How it feels

- Press to anchor at your current cursor and scroll positions. There is no jump on press.
- Drag down to move toward the bottom; drag up to move toward the top.
- Hold your hand still and scrolling stops immediately, even far from the anchor.
- Return to the original cursor position to return to the original scroll position.
- Release, press Escape, leave the page, or change focus to end the gesture.
- Release and start another drag if you run out of physical cursor space.

At 1× sensitivity:

```text
scrollRange = scrollHeight - clientHeight
scrollTop   = clamp(startScrollTop + (cursorY - startY) / viewportHeight * scrollRange)
```

The calculation uses viewport coordinates (`clientY`), so scrolling the document does not move the anchor. It always calculates from the original press, avoiding accumulated error and drift. The scroll range and viewport height are captured at the start of each gesture so infinite-scroll content cannot suddenly change the scale. Start another gesture to use a newly expanded range.

## Page compatibility

- The nearest vertically scrollable panel is selected under the cursor, including panels in accessible shadow DOM. Otherwise, the document scrolls. The scale still uses the viewport height, even in a nested panel.
- A gesture stays with its original scroll container. It does not chain to the outer page when it reaches an edge.
- Matching frames get their own content script and use their own viewport height. Leaving a frame ends its gesture.
- CSS smooth scrolling is bypassed. Scroll snapping and scroll anchoring are suspended during the gesture, and original styles are restored afterward. A page with mandatory snap points may snap again when released.
- Middle-clicking links, form controls, editable content, media, canvas, and draggable elements keeps their usual behavior. Hold **Alt** before pressing to bypass the extension anywhere. Ctrl, Shift, and Meta also bypass it.
- Developers can add `data-absolute-scrolling-ignore` to an element to exclude its subtree.
- Only vertical scrolling is handled. Normal wheel scrolling and left/right clicks continue to work.

Firefox prevents extensions from running on protected pages such as `about:` pages, the built-in PDF viewer, and certain Mozilla domains, including the add-ons store. Other sites may implement custom scrolling or mouse handling that conflicts with this interaction. If a website does not respond, check that Firefox has granted the extension access to that site. See Mozilla's [content script restrictions](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts#restricted_domains).

## Local demo and development

Requires Node.js 22+ and an installed Firefox. Runtime extension code has no dependencies; npm packages are development tools only.

```sh
npm ci
npm run demo       # Test page at http://127.0.0.1:4173
npm start          # Isolated Firefox profile with extension loaded
npm run check      # Mozilla add-on lint + integration tests in headless Firefox
npm run build      # Unsigned extension ZIP in dist/
```

After `npm start`, open the demo URL in that Firefox window. The demo includes a long document, an independent scrolling panel, a link, and a text field. It relies on the installed extension; it does not embed or imitate the extension logic.

The integration tests install the actual extension into a fresh Firefox profile using Selenium. They cover proportional mapping, stationary holds, release, edge clamping, nonzero starting positions, nested containers, smooth CSS scrolling, Escape, middle-click links, input fields, modifiers, changing document height, shadow DOM, frames, and saved popup settings. Selenium Manager downloads geckodriver on the first test run. Test screenshots are written to `test-results/`. Set `FIREFOX_BINARY` if Firefox is not in a standard installation location.

The development launcher and tests isolate Firefox application data as well as the browser profile, avoiding the macOS 27 [command-line startup issue](https://bugzilla.mozilla.org/show_bug.cgi?id=2060476). Tests use geckodriver's `--allow-system-access` only in their disposable profile to open the extension's popup page for UI verification.

```text
extension/           Loadable extension; only this folder is packaged
  manifest.json      Firefox Manifest V3, permissions, and script registration
  content.js         Gesture lifecycle and absolute scroll mapping
  content.css        Cursor feedback while a gesture is active
  settings.js        Shared defaults and validation
  popup/             Toolbar controls
demo/                Manual test page
tests/               Actual Firefox extension integration tests
scripts/             Local demo server
```

## Privacy and permissions

The extension makes no network requests and collects or transmits no data. It uses `storage` only for the enabled state and sensitivity. Its content script matches all URLs so the gesture can work on supported pages; Firefox may describe this as access to website data. No browsing history, page content, or mouse positions are stored. The manifest declares no data collection using Firefox's [built-in data consent format](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/).

The included development ID is `absolute-scrolling@extensions.local`. Choose your own permanent extension ID before the first Mozilla submission.
