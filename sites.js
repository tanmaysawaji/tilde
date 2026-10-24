export const SCHEMA_VERSION = 2;

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
 * `icon` is an image (`data:image/…` or a relative path) and `iconSource` where it came
 * from, `"custom"` if not given; without an icon, it's looked up later (IC7).
 * Returns `{ sites, site }` with a new array, or `{ error }` if the URL is invalid or
 * the URL or name is already saved.
 */
export function addSite(sites, { url, name, icon, iconSource }, makeId = () => crypto.randomUUID()) {
  const checked = checkSite(sites, url, name);
  if (checked.error) return checked;
  const image = usableIcon(icon);
  const site = {
    id: makeId(),
    name: checked.name,
    url: checked.url,
    ...(image ? { icon: image, iconSource: ICON_SOURCES.has(iconSource) ? iconSource : "custom" } : NO_ICON),
    iconCheckedAt: null,
  };
  return { sites: [...sites, site], site };
}

/**
 * Changes the name and URL of the site with this `id`, with the same checks as
 * `addSite` (other than against the site itself). `customIcon` sets a custom icon (an
 * image), resets to the looked-up one (null), or is left as is (undefined). A new URL
 * drops a looked-up icon so it's found again. Returns `{ sites, site }` with a new
 * array, or `{ error }`.
 */
export function updateSite(sites, id, { url, name, customIcon }) {
  const index = sites.findIndex((s) => s.id === id);
  if (index === -1) return { error: "that site no longer exists" };
  const checked = checkSite(sites.filter((s) => s.id !== id), url, name);
  if (checked.error) return checked;

  const old = sites[index];
  let iconFields = {};
  if (customIcon === null) iconFields = NO_ICON;
  else if (customIcon !== undefined) {
    const image = usableIcon(customIcon);
    if (!image) return { error: "that icon isn't an image" };
    iconFields = { icon: image, iconSource: "custom" };
  } else if (checked.url !== old.url && old.iconSource !== "custom") iconFields = NO_ICON;

  const site = { ...old, name: checked.name, url: checked.url, ...iconFields };
  return { sites: sites.with(index, site), site };
}

const NO_ICON = { icon: null, iconSource: null, iconCheckedAt: null };
const ICON_SOURCES = new Set(["favicon", "duckduckgo", "custom"]);

// Icons end up as an <img> src, so a backup file can only bring images, not remote URLs
function usableIcon(icon) {
  if (typeof icon !== "string") return null;
  if (/^data:image\//i.test(icon)) return icon;
  return /^[a-z][a-z0-9+.-]*:|^\/\//i.test(icon) || !icon.trim() ? null : icon;
}

function checkSite(others, url, name) {
  if (!url?.trim()) return { error: "a URL is required" };
  const href = normalizeUrl(url);
  if (!href) return { error: `not a web address: ${url}` };

  const sameUrl = others.find((s) => s.url === href);
  if (sameUrl) return { error: `already saved as ${sameUrl.name}` };

  const finalName = name?.trim() || defaultName(href);
  if (findSiteByName(others, finalName)) return { error: `a site named ${finalName} already exists` };
  return { url: href, name: finalName };
}

/**
 * Removes the site with this name (case-insensitive).
 * Returns `{ sites, site }` with a new array, or `{ error }` if no site has that name.
 */
export function removeSite(sites, name) {
  const site = findSiteByName(sites, name);
  if (!site) return { error: `no site named ${name.trim()}` };
  return { sites: sites.filter((s) => s !== site), site };
}

/**
 * Moves the site with this `id` to `toIndex` (0-based, clamped to the list), shifting
 * the sites in between over. Returns a new array, or the same one if nothing moved.
 */
export function moveSite(sites, id, toIndex) {
  const from = sites.findIndex((s) => s.id === id);
  if (from === -1) return sites;
  const to = Math.min(Math.max(toIndex, 0), sites.length - 1);
  if (from === to) return sites;
  return sites.toSpliced(from, 1).toSpliced(to, 0, sites[from]);
}

/** The site with this name (case-insensitive), or undefined. */
export function findSiteByName(sites, name) {
  const wanted = name.trim().toLowerCase();
  return sites.find((s) => s.name.toLowerCase() === wanted);
}

/**
 * Brings stored data up to the current schema; with nothing stored, it starts empty.
 * Returns `{ data, changed }`, where `changed` means the result should be saved. Throws
 * on data it can't read, such as data from a newer version of tilde, so the caller
 * doesn't overwrite it.
 */
export function migrate(stored) {
  if (stored == null) return { data: { version: SCHEMA_VERSION, sites: [] }, changed: true };
  if (stored.version > SCHEMA_VERSION) {
    throw new Error("saved sites are from a newer version of tilde");
  }

  let data = stored;
  while (data.version !== SCHEMA_VERSION) {
    const upgrade = UPGRADES[data.version];
    if (!upgrade || !Array.isArray(data.sites)) break;
    data = upgrade(data);
  }
  if (data.version !== SCHEMA_VERSION || !Array.isArray(data.sites)) {
    throw new Error("saved sites are in a format tilde doesn't recognize");
  }
  return { data, changed: data !== stored };
}

// Each one turns data of that version into the next
const UPGRADES = {
  // 2 stores looked-up icons with each site; a v1 icon could only have been set by hand
  1: (data) => ({
    version: 2,
    sites: data.sites.map((s) => ({
      ...s,
      ...(s.icon ? { iconSource: "custom" } : NO_ICON),
      iconCheckedAt: null,
    })),
  }),
};
