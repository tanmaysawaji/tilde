/** How long a site stuck on the globe waits before its icon is looked up again. */
export const RECHECK_MS = 24 * 60 * 60 * 1000;

/** The address of DuckDuckGo's icon for a site, which answers 404 when it has none. */
export function duckduckgoIconUrl(siteUrl) {
  return `https://icons.duckduckgo.com/ip3/${new URL(siteUrl).hostname}.ico`;
}

/**
 * The sites whose icon should be looked up now: ones never looked up, and ones on the
 * globe that haven't been checked for `RECHECK_MS` (or at all, with `recheckGlobe`).
 */
export function sitesNeedingIcons(sites, now, { recheckGlobe = false } = {}) {
  return sites.filter((s) => {
    if (s.iconSource == null) return true;
    if (s.iconSource !== "globe") return false;
    return recheckGlobe || s.iconCheckedAt == null || now - s.iconCheckedAt >= RECHECK_MS;
  });
}

/**
 * Stores a looked-up icon (`{ icon, iconSource }`) on the site with this `id`, unless
 * its URL is no longer `url` or it got a custom icon while the lookup ran. Returns a
 * new array, or the same one if nothing changed.
 */
export function applyIcon(sites, id, url, { icon, iconSource }, now) {
  const index = sites.findIndex((s) => s.id === id);
  if (index === -1 || sites[index].url !== url || sites[index].iconSource === "custom") return sites;
  return sites.with(index, { ...sites[index], icon, iconSource, iconCheckedAt: now });
}
