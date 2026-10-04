# Absolute Scrolling

A Firefox extension that turns middle-button dragging into direct page positioning. Cursor displacement maps to the page's full scroll range, so scrolling stops as soon as the cursor stops.

## Quick usage

1. Hold the middle mouse button over a page or scrollable panel.
2. Move up or down to scroll vertically, left or right to scroll horizontally, or move diagonally for both.
3. Stop moving to stop scrolling. Release the button to finish.

The position where you press is the anchor. Returning the cursor to that point returns the page to its starting position. Press **Escape** to cancel a gesture, or hold **Alt** before pressing the middle button to let the page handle the click normally.

Vertical movement defaults to 1×: moving through 20% of the viewport moves through about 20% of the vertical scroll range. Horizontal movement defaults to 4×, so the same movement covers about 80% of the horizontal range.

Open the toolbar popup to:

- Turn middle-button scrolling on or off.
- Set separate vertical and horizontal multipliers from 0.25× to 20× in 0.25× steps.
- Disable the extension on the current page, an entire site, or a custom URL pattern.

## Install

Absolute Scrolling requires desktop Firefox 140 or later and a mouse with a middle button.

### Try a GitHub build

Download the ZIP from a GitHub release, then:

1. Open `about:debugging#/runtime/this-firefox` in Firefox.
2. Click **Load Temporary Add-on…**.
3. Select the downloaded ZIP.
4. Open or reload a normal webpage.

The temporary installation is removed when Firefox restarts.

### Try it from source

Use the same `about:debugging` page, click **Load Temporary Add-on…**, and select `extension/manifest.json` from this repository. After changing the code, click **Reload** beside Absolute Scrolling and reload any open webpages.

### Install permanently

Standard Firefox requires extensions to be signed by Mozilla. The GitHub build is unsigned and intended for testing or submission. After obtaining a signed `.xpi`, open `about:addons`, choose **Install Add-on From File** from the settings menu, select the `.xpi`, and confirm **Add**.

See Mozilla's guides for [temporary installation](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/) and [signing and distribution](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/).

## Disable on selected pages

Open the toolbar popup and scroll to **Disabled pages**:

- **Disable this page** excludes the current URL path.
- **Disable this site** excludes every HTTP and HTTPS page on the current hostname.
- **URL pattern** lets you exclude a custom group of pages.
- **Remove** enables matching pages again, unless another saved pattern still matches.

Rules take effect on open pages immediately and stay on your device. Query strings and `#fragments` are ignored.

| Pattern | Matches |
| --- | --- |
| `https://example.com/docs/page` | That exact HTTPS path |
| `https://example.com/docs/*` | Paths beginning with `/docs/` |
| `*://example.com/*` | Every HTTP and HTTPS path on that hostname |
| `*://*.example.com/*` | The hostname and all its subdomains |
| `file:///path/to/documents/*` | Local files beneath that path |

A bare value such as `example.com/docs/*` is shorthand for `*://example.com/docs/*`. Paths are case-sensitive. These are URL patterns, not regular expressions.

## Compatibility

- The nearest scrollable panel under the cursor is used; otherwise the document scrolls.
- Vertical, horizontal, diagonal, nested-panel, frame, shadow-DOM, and right-to-left scrolling are supported.
- A gesture stays in its original scroll container instead of spilling into the outer page at an edge.
- Links, form controls, editable content, media, canvas, and draggable elements keep their normal middle-click behavior.
- Normal wheel scrolling and left/right clicks are unchanged.

Firefox does not allow extensions on protected pages such as `about:` pages, its built-in PDF viewer, and some Mozilla sites. A site with custom mouse or scrolling behavior may also conflict with the gesture. If a page does not respond, check that Firefox granted the extension access to that site.

## Privacy

The extension makes no network requests and transmits no data. It stores only the enabled state, movement multipliers, and disabled URL patterns on your device. Page content, browsing history, and mouse positions are not stored.

The `tabs` permission lets the popup read the current URL and keeps page exclusions working in frames and after in-page navigation. The content script runs on supported webpages so it can handle the gesture.

## Development

Build instructions, tests, release steps, implementation details, and the project layout are in [DEVELOPMENT.md](DEVELOPMENT.md).

## License

[MIT](LICENSE)
