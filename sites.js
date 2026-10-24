export const SCHEMA_VERSION = 1;

// Second-level labels that sit under a country code, as in amazon.co.uk
const COUNTRY_SECOND_LEVELS = new Set(["co", "com", "org", "net", "gov", "ac", "edu"]);

/**
 * Turns user input like `github.com` into a full http(s) URL.
 * Returns null when the input isn't a web address: it has spaces, a non-http(s) scheme,
 * or a host with no dot that isn't `localhost`.
 */
export function normalizeUrl(input) {
  const text = input.trim();
  if (!text || /\s/.test(text)) return null;

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : "https://" + text;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!url.hostname.includes(".") && url.hostname !== "localhost") return null;
  return url.href;
}

/**
 * The name a site gets when none is given: the main part of its domain, capitalized
 * (`https://mail.google.com/` → "Google"). IP addresses and `localhost` are kept whole.
 */
export function defaultName(url) {
  const host = new URL(url).hostname;
  if (host === "localhost" || /^[\d.]+$/.test(host) || host.startsWith("[")) return host;

  const labels = host.split(".");
  const n = labels.length;
  const underCountry = n >= 3 && labels[n - 1].length === 2 && COUNTRY_SECOND_LEVELS.has(labels[n - 2]);
  const main = labels[underCountry ? n - 3 : n - 2];
  return main.charAt(0).toUpperCase() + main.slice(1);
}

/**
 * Adds a site to the list. `url` is normalized and `name` defaults to `defaultName`.
 * Returns `{ sites, site }` with a new array, or `{ error }` if the URL is invalid or
 * the URL or name is already saved.
 */
export function addSite(sites, { url, name, icon }, makeId = () => crypto.randomUUID()) {
  const href = normalizeUrl(url);
  if (!href) return { error: `not a web address: ${url}` };

  const sameUrl = sites.find((s) => s.url === href);
  if (sameUrl) return { error: `already saved as ${sameUrl.name}` };

  const finalName = name?.trim() || defaultName(href);
  if (findByName(sites, finalName)) return { error: `a site named ${finalName} already exists` };

  const site = { id: makeId(), name: finalName, url: href, icon: icon || null };
  return { sites: [...sites, site], site };
}

/**
 * Removes the site with this name (case-insensitive).
 * Returns `{ sites, site }` with a new array, or `{ error }` if no site has that name.
 */
export function removeSite(sites, name) {
  const site = findByName(sites, name);
  if (!site) return { error: `no site named ${name.trim()}` };
  return { sites: sites.filter((s) => s !== site), site };
}

function findByName(sites, name) {
  const wanted = name.trim().toLowerCase();
  return sites.find((s) => s.name.toLowerCase() === wanted);
}

/**
 * Brings stored data up to the current schema.
 * With nothing stored, the starting list is imported from `legacyLinks` (the old
 * `links.js` entries) if given, otherwise it is empty. Returns `{ data, changed }`,
 * where `changed` means the result should be saved. Throws on data it can't read, such
 * as data from a newer version of tilde, so the caller doesn't overwrite it.
 */
export function migrate(stored, legacyLinks, makeId = () => crypto.randomUUID()) {
  if (stored == null) {
    let sites = [];
    for (const link of legacyLinks ?? []) {
      const result = addSite(sites, link, makeId);
      if (result.sites) sites = result.sites;
    }
    return { data: { version: SCHEMA_VERSION, sites }, changed: true };
  }
  if (stored.version === SCHEMA_VERSION && Array.isArray(stored.sites)) {
    return { data: stored, changed: false };
  }
  if (stored.version > SCHEMA_VERSION) {
    throw new Error("saved sites are from a newer version of tilde");
  }
  throw new Error("saved sites are in a format tilde doesn't recognize");
}
