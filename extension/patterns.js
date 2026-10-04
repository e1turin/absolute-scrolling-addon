/* URL patterns use an exact host or *.example.com, and * wildcards in the path.
 * Query strings and fragments are deliberately excluded from matching/storage.
 */
(() => {
  function parse(pattern) {
    if (typeof pattern !== "string") throw new Error("Enter a URL pattern.");
    let value = pattern.trim();
    if (!value.includes("://")) value = `*://${value}`;
    const parts = /^(https?|file|\*):\/\/([^/]*)(\/[^?#]*)?$/i.exec(value);
    if (!parts) throw new Error("Use a URL with a path, without a query string or #fragment.");
    const scheme = parts[1].toLowerCase();
    const authority = parts[2];
    if (scheme === "file" && authority) throw new Error("File patterns must start with file:///.");
    if (scheme !== "file" && !authority) throw new Error("Include a website hostname.");
    if (/[@?#\s\\]/.test(authority)) throw new Error("Enter a hostname without credentials, queries, or spaces.");
    const wildcardHost = authority.startsWith("*.");
    const bareHost = wildcardHost ? authority.slice(2) : authority;
    if (bareHost.includes("*") && authority !== "*") throw new Error("Use * or *.example.com for a wildcard hostname.");
    if (wildcardHost && !bareHost) throw new Error("Include a hostname after *.");
    let host = authority;
    let path;
    try {
      const parsed = new URL(`${scheme === "*" ? "https" : scheme}://${authority === "*" ? "pattern.invalid" : bareHost}${parts[3] || "/"}`);
      host = authority === "*" ? "*" : `${wildcardHost ? "*." : ""}${parsed.host}`;
      // URL removes a default port. A wildcard scheme must preserve an explicit
      // port so *://example.com:443/* cannot also match ordinary HTTP on port 80.
      const explicitPort = /:(\d+)$/.exec(authority)?.[1];
      if (scheme === "*" && explicitPort !== undefined) host = `${wildcardHost ? "*." : ""}${parsed.hostname}:${Number(explicitPort)}`;
      path = parsed.pathname;
    } catch {
      throw new Error("Enter a valid website URL or file:/// path.");
    }
    const source = path.split("*").map((piece) => piece.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*");
    return { scheme, host, path: new RegExp(`^${source}$`), value: `${scheme}://${host}${path}` };
  }

  function matches(rule, url) {
    if (rule.scheme === "*" ? !["http:", "https:"].includes(url.protocol) : `${rule.scheme}:` !== url.protocol) return false;
    const base = rule.host.startsWith("*.") ? rule.host.slice(2) : null;
    const host = rule.scheme === "*" && /:\d+$/.test(rule.host)
      ? `${url.hostname}:${url.port || (url.protocol === "https:" ? "443" : "80")}` : url.host;
    const hostMatches = rule.host === "*" || rule.host === host ||
      (base !== null && (host === base || host.endsWith(`.${base}`)));
    return hostMatches && rule.path.test(url.pathname);
  }

  globalThis.AbsoluteScrollingPatterns = Object.freeze({
    normalize(pattern) { return parse(pattern).value; },
    pagePattern(value) {
      const url = new URL(value);
      if (!["http:", "https:", "file:"].includes(url.protocol)) return null;
      // A literal * in a URL is encoded so a page shortcut cannot add a wildcard.
      return `${url.protocol}//${url.host}${url.pathname.replaceAll("*", "%2A")}`;
    },
    sitePattern(value) {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol) ? `*://${url.host}/*` : null;
    },
    compile(patterns) {
      const rules = patterns.flatMap((pattern) => {
        try { return [parse(pattern)]; } catch { return []; }
      });
      return (value) => {
        try {
          const url = new URL(value);
          url.pathname = url.pathname.replaceAll("*", "%2A");
          return rules.some((rule) => matches(rule, url));
        } catch { return false; }
      };
    },
  });
})();
