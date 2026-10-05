# Developing Absolute Scrolling

## Requirements

- Node.js 22 or later
- Desktop Firefox
- Chrome, Chromium, Edge, or Brave for Chromium testing
- npm

Runtime extension code has no dependencies. The npm packages are development and packaging tools.

## Local setup

```sh
npm ci
npm run demo       # Test page at http://127.0.0.1:4173
npm start          # Isolated Firefox profile with the extension loaded
npm run check      # Add-on lint plus integration and unit tests
npm run build      # Unsigned extension ZIP in dist/
npm run build:chromium # Unpacked Chromium extension in dist/chromium/
```

After `npm start`, open the demo URL in that Firefox window. The demo has a long document, independent vertical and horizontal panels, a link, and a text field. It uses the installed extension and does not copy its behavior into the page.

`npm run build:chromium` copies the shared extension files into `dist/chromium/` and replaces the Firefox manifest with the Chromium MV3 manifest. Load that directory through **Load unpacked** on a Chromium browser's extensions page.

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

## GitHub builds

The browser pipelines are independent:

| Workflow | Runs on | Output |
| --- | --- | --- |
| **Build Firefox** (`build-firefox.yml`) | Branch pushes, `v*` tags, pull requests, or manual runs | `firefox-bundle` artifact containing an unsigned Firefox ZIP |
| **Build Chromium** (`build-chromium.yml`) | Branch pushes, `v*` tags, pull requests, or manual runs | `chromium-bundle` artifact containing the loadable extension files |
| **Release Firefox** (`release-firefox.yml`) | Manual run with an existing version tag | AMO-signed `.xpi`, saved as an artifact and GitHub release asset |
| **Release Chromium** (`release-chromium.yml`) | Manual run with an existing version tag | Project-signed `.crx` and development `.zip`, saved as artifacts and GitHub release assets |

For a Chromium development install, run **Actions → Build Chromium → Run workflow**, select the branch, and leave **tag** empty. Download **chromium-bundle** from the completed run, extract it, and select the folder containing `manifest.json` through **Load unpacked**. The artifact ZIP has the manifest at its root, so there is no inner archive to extract. Builds require no signing secrets and do not publish a release.

Both build workflows also accept an optional existing version tag. Tags must match `v` plus the package version; each browser manifest and the lockfile must match `package.json`. Build Chromium runs the shared unit tests; Build Firefox also runs Mozilla's add-on lint. Run `npm run check` locally for the full Firefox integration suite.

The manual **Run workflow** button becomes available after these workflow files are on the repository's default branch. Branch pushes produce build artifacts before then.

## Signing setup

### Firefox

`npm run build` creates an unsigned ZIP in `dist/`. Standard and Beta Firefox require Mozilla signing before permanent installation. **Release Firefox** builds the requested tag, extracts that run's archive, submits it to AMO's **unlisted** channel, and attaches the signed `.xpi` returned by Mozilla to the GitHub release.

Before the first signing, create AMO API credentials in the [AMO Developer Hub](https://addons.mozilla.org/developers/addon/api/key/) and add them as repository secrets:

| Secret | AMO value |
| --- | --- |
| `AMO_JWT_ISSUER` | JWT issuer/API key |
| `AMO_JWT_SECRET` | JWT secret/API secret |

The manifest ID, `absolute-scrolling@extensions.local`, becomes the add-on's permanent ID once AMO signs it. Change it before the first signing only if you want a different permanent ID.

### Chromium

Add a repository secret named `CHROMIUM_PRIVATE_KEY` containing the complete PKCS#8 PEM private key used to sign this extension (`-----BEGIN PRIVATE KEY-----`). Use Chrome's **Pack extension** once to create a key, or generate an RSA key outside the repository:

```sh
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out /secure/path/absolute-scrolling-chromium.pem
gh secret set CHROMIUM_PRIVATE_KEY < /secure/path/absolute-scrolling-chromium.pem
```

Keep a secure backup and reuse the same key for every release so the extension ID stays stable. Never commit the PEM file. The workflow writes the key to a temporary directory, removes it after packing, and uploads only `.crx` and `.zip` files.

**Release Chromium** uses Chrome on the GitHub runner to sign the built Chromium files. This creates a project-signed CRX, not a Chrome Web Store signature or listing. Standard Chrome on Windows and macOS restricts self-hosted CRX installation to managed environments; use the ZIP with **Load unpacked** for development. See [Chrome's distribution guide](https://developer.chrome.com/docs/extensions/how-to/distribute) and [packaging documentation](https://developer.chrome.com/docs/extensions/how-to/distribute/host-on-linux).

## GitHub releases

1. Update the version in `package.json`, `package-lock.json` (including its root package entry), `extension/manifest.json`, and `chromium/manifest.json`.
2. Commit the release and create a matching tag such as `v0.3.0`.
3. Push the tag. Both browser build workflows validate and upload unsigned bundles automatically.
4. When a signed release is wanted, open **Actions → Release Firefox** or **Release Chromium → Run workflow**, use the default branch for the workflow, and enter the version tag.
5. Each release calls its browser's build workflow and signs the artifact produced within that same run. It then creates the GitHub release or adds its browser's assets to the existing release. Reruns replace assets with the same names; assets for the other browser are preserved.

Signing and release publication happen only on demand. Either browser can be released independently, in either order; release runs for the same tag are serialized to avoid racing to create the shared release. No lookup of an earlier build run is needed, and expired artifacts can be rebuilt. Use a new version for a new Firefox submission to AMO. Chromium releases require a tag that contains Chromium support (`v0.3.0` predates it).

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
chromium/             Chromium-specific MV3 manifest
demo/                Manual test page
tests/               Firefox integration and unit tests
scripts/             Demo server, development launcher, and Chromium builder
.github/workflows/   Build and manual release automation
```

## References

- [Temporary installation in Firefox](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/)
- [Signing and distribution](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/)
- [Content script restrictions](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts#restricted_domains)
