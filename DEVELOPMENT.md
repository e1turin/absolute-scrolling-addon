# Developing Absolute Scrolling

## Requirements

- Node.js 22 or later
- Desktop Firefox
- npm

Runtime extension code has no dependencies. The npm packages are development and packaging tools.

## Local setup

```sh
npm ci
npm run demo       # Test page at http://127.0.0.1:4173
npm start          # Isolated Firefox profile with the extension loaded
npm run check      # Add-on lint plus integration and unit tests
npm run build      # Unsigned extension ZIP in dist/
```

After `npm start`, open the demo URL in that Firefox window. The demo has a long document, independent vertical and horizontal panels, a link, and a text field. It uses the installed extension and does not copy its behavior into the page.

## Scrolling model

The gesture records the cursor, scroll positions, viewport dimensions, and available scroll ranges when the middle button is pressed. Every pointer movement is calculated from that original anchor, which avoids accumulated error and drift.

At the default 1× vertical and 4× horizontal multipliers:

```text
verticalRange   = scrollHeight - clientHeight
horizontalRange = scrollWidth - clientWidth

scrollTop  = clamp(startScrollTop  + (cursorY - startY) / viewportHeight * verticalRange)
scrollLeft = clamp(startScrollLeft + (cursorX - startX) / viewportWidth  * horizontalRange * 4)
```

Viewport coordinates (`clientX` and `clientY`) keep the anchor fixed while the page moves. Capturing the range at gesture start also prevents lazy-loaded content from changing the scale halfway through a drag. A new gesture picks up the new range.

The nearest scrollable ancestor under the cursor is selected, including elements in accessible shadow DOM. CSS smooth scrolling is bypassed, while scroll snapping and anchoring are suspended for the gesture and restored afterward. Developers can add `data-absolute-scrolling-ignore` to an element to preserve native behavior for its subtree.

## Tests

`npm run check` runs Mozilla add-on lint, unit tests for URL patterns and settings migration, and integration tests that install the real extension in a fresh headless Firefox profile.

The browser suite covers both axes, diagonal and right-to-left movement, stationary holds, release and Escape behavior, edge clamping, nonzero starting positions, nested containers, smooth scrolling, links and inputs, modifiers, changing document size, shadow DOM, frames, saved settings, page shortcuts, rule removal, and cross-origin exclusions during single-page navigation.

Selenium Manager downloads geckodriver on the first run. Screenshots are written to `test-results/`. Set `FIREFOX_BINARY` when Firefox is installed in a nonstandard location.

The launcher and tests isolate Firefox application data and its browser profile. Tests pass geckodriver's `--allow-system-access` flag only to that disposable profile so they can verify the extension popup.

## Build and signing

`npm run build` creates an unsigned ZIP in `dist/`. Standard and Beta Firefox require Mozilla signing before permanent installation. The Release workflow submits the tagged source to AMO's **unlisted** channel and attaches the signed `.xpi` returned by Mozilla to the GitHub release.

Before the first signing, create AMO API credentials in the [AMO Developer Hub](https://addons.mozilla.org/developers/addon/api/key/) and add them as repository secrets:

| Secret | AMO value |
| --- | --- |
| `AMO_JWT_ISSUER` | JWT issuer/API key |
| `AMO_JWT_SECRET` | JWT secret/API secret |

The manifest ID, `absolute-scrolling@extensions.local`, becomes the add-on's permanent ID once AMO signs it. Change it before the first signing only if you want a different permanent ID.

## GitHub releases

The repository has separate **Build** and **Release** workflows:

1. Update the version in `package.json`, `package-lock.json`, and `extension/manifest.json`.
2. Commit the release and create a matching tag such as `v0.3.0`.
3. Push the tag. The **Build** workflow validates the tag and extension, builds the unsigned ZIP, and uploads it as an artifact.
4. After Build succeeds, open **Actions → Release → Run workflow** and enter the same tag.
5. The Release workflow finds the successful build for that exact commit, signs the checked-out tag with AMO, and creates a GitHub release containing the signed `.xpi`.

The **Build** workflow can also be started manually for an existing tag.

## Project layout

```text
extension/           Loadable extension; only this folder is packaged
  manifest.json      Firefox Manifest V3 configuration
  content.js         Gesture lifecycle and absolute scroll mapping
  content.css        Cursor feedback during a gesture
  settings.js        Shared defaults and validation
  patterns.js        URL pattern parsing and matching
  background.js      Top-level URL updates for cross-origin frames
  popup/             Toolbar controls
demo/                Manual test page
tests/               Firefox integration and unit tests
scripts/             Demo server and development launcher
.github/workflows/   Build and manual release automation
```

## References

- [Temporary installation in Firefox](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/)
- [Signing and distribution](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/)
- [Content script restrictions](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts#restricted_domains)
