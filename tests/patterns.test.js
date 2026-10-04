import assert from "node:assert/strict";
import { test } from "node:test";
import "../extension/settings.js";
import "../extension/patterns.js";

const patterns = globalThis.AbsoluteScrollingPatterns;

test("page shortcuts discard query strings, fragments, and credentials", () => {
  assert.equal(patterns.pagePattern("https://person:secret@example.com/docs/page?token=123#section"), "https://example.com/docs/page");
  assert.equal(patterns.sitePattern("https://example.com/docs/page?token=123"), "*://example.com/*");
  assert.equal(patterns.pagePattern("about:debugging"), null);
  assert.equal(patterns.sitePattern("file:///tmp/page.html"), null);
});

test("exact page rules include query/fragment variations but no other path", () => {
  const matches = patterns.compile(["https://example.com/docs/page"]);
  assert.ok(matches("https://example.com/docs/page?view=2#section"));
  assert.equal(matches("https://example.com/docs/page/child"), false);
  assert.equal(matches("https://example.com/docs/other"), false);
  assert.equal(matches("http://example.com/docs/page"), false);
});

test("path wildcards and subdomain wildcards are confined to their URL components", () => {
  const matches = patterns.compile(["*://*.example.com/docs/*"]);
  for (const value of ["https://example.com/docs/one", "http://a.b.example.com/docs/a/b"]) assert.ok(matches(value));
  for (const value of [
    "https://example.com.evil.test/docs/one", "https://notexample.com/docs/one",
    "https://evil.test/path/.example.com/docs/one", "https://example.com/other",
    "file:///docs/one",
  ]) assert.equal(matches(value), false, value);
});

test("regex punctuation is literal and a current page's literal star is not a wildcard", () => {
  const matches = patterns.compile(["https://example.com/a+b.(c)/*"]);
  assert.ok(matches("https://example.com/a+b.(c)/page"));
  assert.equal(matches("https://example.com/abXc/page"), false);
  const exactStar = patterns.compile([patterns.pagePattern("https://example.com/a*b")]);
  assert.ok(exactStar("https://example.com/a*b"));
  assert.equal(exactStar("https://example.com/axyzb"), false);
});

test("rules support local files, ports, and host-only shorthand", () => {
  assert.equal(patterns.normalize("EXAMPLE.com/docs/*"), "*://example.com/docs/*");
  assert.ok(patterns.compile(["file:///tmp/docs/*"])("file:///tmp/docs/a.html"));
  assert.ok(patterns.compile(["http://localhost:4173/*"])("http://localhost:4173/page"));
  assert.equal(patterns.compile(["http://localhost:4173/*"])("http://localhost:5000/page"), false);
  const httpsPort = patterns.compile(["*://example.com:443/*"]);
  assert.ok(httpsPort("https://example.com/page"));
  assert.ok(httpsPort("http://example.com:443/page"));
  assert.equal(httpsPort("http://example.com/page"), false);
});

test("invalid rules cannot accidentally disable unrelated pages", () => {
  for (const value of ["", "https://", "https://foo*bar.com/*", "javascript:alert(1)", "https://example.com?query", "https://example.com/a?q=1", "https://person:secret@example.com/*", "file://example.com/*"]) {
    assert.throws(() => patterns.normalize(value), undefined, value);
  }
  assert.equal(patterns.compile(["bad rule", "https://"])("https://example.com/"), false);
});

test("existing settings migrate without losing enabled state or sensitivity", () => {
  assert.deepEqual(globalThis.AbsoluteScrollingSettings.normalize({ enabled: false, sensitivity: 0.5 }), {
    enabled: false, sensitivity: 0.5, disabledPatterns: [],
  });
});
