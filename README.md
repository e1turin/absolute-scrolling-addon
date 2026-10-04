# Absolute Scrolling

Licensed under the [MIT License](LICENSE).

A Firefox extension for proportional middle-mouse scrolling in both directions. Hold the middle mouse button: moving **20% of the viewport height moves 20% of the vertical scroll range**, and moving **20% of the viewport width moves 20% of the horizontal range** at the default sensitivity. Diagonal movement scrolls both axes. Stop moving and the page stays still.

## Try it in Firefox

Requires desktop Firefox 140 or later and a mouse with a middle button. No build step is needed to load the extension.

1. Open `about:debugging#/runtime/this-firefox` in Firefox.
2. Click **Load Temporary Add-on…**.
3. Select `extension/manifest.json` from this project.
4. Open or reload a normal webpage. Hold the middle button over page content and move in any direction.

Use the extension's toolbar panel to pause scrolling or adjust sensitivity from 0.25× to 2×. Preferences are saved locally and apply to already-open pages.

When updating a temporary installation, click **Reload** next to Absolute Scrolling in `about:debugging`, then reload your webpages. Version 0.2 adds the `tabs` permission so the popup can read the active URL and page exclusions can also cover cross-origin frames.

Temporary add-ons are removed when Firefox restarts. For permanent installation in standard Firefox, the extension must be signed by Mozilla; the build command below produces an **unsigned** archive suitable for submission. See Mozilla's [temporary installation guide](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/) and [signing and distribution guide](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/).

## How it feels

- Press to anchor at your current cursor and scroll positions. There is no jump on press.
- Drag down/up to move vertically and right/left to move horizontally. Each available axis maps independently; one-axis containers only move along that axis.
- Hold your hand still and scrolling stops immediately, even far from the anchor.
- Return to the original cursor position to return to the original scroll position.
- Release, press Escape, leave the page, or change focus to end the gesture.
- Release and start another drag if you run out of physical cursor space.

At 1× sensitivity:

```text
verticalRange   = scrollHeight - clientHeight
horizontalRange = scrollWidth - clientWidth
scrollTop  = clamp(startScrollTop  + (cursorY - startY) / viewportHeight * verticalRange)
scrollLeft = clamp(startScrollLeft + (cursorX - startX) / viewportWidth  * horizontalRange)
```

The calculation uses viewport coordinates (`clientX`/`clientY`), so scrolling the document does not move the anchor. It always calculates from the original press, avoiding accumulated error and drift. Scroll ranges and viewport dimensions are captured at the start of each gesture so infinite-scroll content cannot suddenly change the scale. Start another gesture to use a newly expanded range.

## Disable on specific pages

Open the toolbar popup and scroll to **Disabled pages**:

- **Disable this page** saves the current URL's scheme, hostname, and path.
- **Disable this site** saves `*://hostname/*`, covering HTTP and HTTPS on that hostname.
- Edit the prefilled **URL pattern** and press **Add** to exclude a group of pages.
- Click **Remove** beside a saved pattern to enable matching pages again, unless another rule still matches.

Patterns are saved locally. Adding or removing a rule takes effect on open pages immediately. If a top-level page matches, its embedded frames are disabled too, including frames from other origins. Single-page app navigation updates the match without needing a reload.

| Pattern | Matches |
| --- | --- |
| `https://example.com/docs/page` | That exact path over HTTPS |
| `https://example.com/docs/*` | Any path beginning with `/docs/` |
| `*://example.com/*` | All paths on that hostname, over HTTP or HTTPS |
| `*://*.example.com/*` | The hostname and all its subdomains |
| `file:///path/to/documents/*` | Local files beneath that path |

Query strings and `#fragments` are ignored, and the shortcuts never save them. Paths are case-sensitive. A bare hostname/path such as `example.com/docs/*` is shorthand for `*://example.com/docs/*`. Host wildcards must be `*` or a leading `*.`; path wildcards can appear anywhere. A rule for `example.com` does not match `example.com.evil.test`. This is URL pattern matching, not regular expressions.

## Page compatibility

- The nearest scrollable panel is selected under the cursor, including panels in accessible shadow DOM. Otherwise, the document scrolls. The scale uses viewport dimensions, even in a nested panel. Right-to-left horizontal scroll ranges are supported.
- A gesture stays with its original scroll container. It does not chain to the outer page when it reaches an edge.
- Matching frames get their own content script and use their own viewport height. Leaving a frame ends its gesture.
- CSS smooth scrolling is bypassed. Scroll snapping and scroll anchoring are suspended during the gesture, and original styles are restored afterward. A page with mandatory snap points may snap again when released.
- Middle-clicking links, form controls, editable content, media, canvas, and draggable elements keeps their usual behavior. Hold **Alt** before pressing to bypass the extension anywhere. Ctrl, Shift, and Meta also bypass it.
- Developers can add `data-absolute-scrolling-ignore` to an element to exclude its subtree.
- Horizontal, vertical, and diagonal gestures are supported. Normal wheel scrolling and left/right clicks continue to work.

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

After `npm start`, open the demo URL in that Firefox window. The demo includes a long document, independent vertical and horizontal scrolling panels, a link, and a text field. It relies on the installed extension; it does not embed or imitate the extension logic.

The integration tests install the actual extension into a fresh Firefox profile using Selenium. They cover proportional mapping on both axes, diagonal movement, right-to-left scrolling, stationary holds, release, edge clamping, nonzero starting positions, nested containers, smooth CSS scrolling, Escape, middle-click links, input fields, modifiers, changing document height, shadow DOM, frames, saved settings, current-page shortcuts, rule removal, and cross-origin frame exclusions during single-page app navigation. Unit tests also check URL pattern matching and settings migration. Selenium Manager downloads geckodriver on the first test run. Test screenshots are written to `test-results/`. Set `FIREFOX_BINARY` if Firefox is not in a standard installation location.

The development launcher and tests isolate Firefox application data as well as the browser profile, avoiding the macOS 27 [command-line startup issue](https://bugzilla.mozilla.org/show_bug.cgi?id=2060476). Tests use geckodriver's `--allow-system-access` only in their disposable profile to open the extension's popup page for UI verification.

```text
extension/           Loadable extension; only this folder is packaged
  manifest.json      Firefox Manifest V3, permissions, and script registration
  content.js         Gesture lifecycle and absolute scroll mapping
  content.css        Cursor feedback while a gesture is active
  settings.js        Shared defaults and validation
  patterns.js        Shared URL pattern parsing and matching
  background.js      Top-level URL updates for cross-origin frames
  popup/             Toolbar controls
demo/                Manual test page
tests/               Actual Firefox extension integration tests
scripts/             Local demo server
```

## Privacy and permissions

The extension makes no network requests and transmits no data. It uses `storage` for the enabled state, sensitivity, and URL patterns you choose to disable. The `tabs` permission reads the active page URL for the popup and tracks a tab's current URL so exclusions also apply inside frames and after in-page navigation. Its content script matches all URLs so the gesture can work on supported pages; Firefox may describe this as access to website data. No browsing history, page content, or mouse positions are stored. URL patterns stay in local extension storage. The manifest declares no data collection using Firefox's [built-in data consent format](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/).

The included development ID is `absolute-scrolling@extensions.local`. Choose your own permanent extension ID before the first Mozilla submission.
