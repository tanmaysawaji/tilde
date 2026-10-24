import { test } from "node:test";
import assert from "node:assert/strict";
import { SCHEMA_VERSION, addSite, defaultName, findSiteByName, migrate, moveSite, normalizeUrl, removeSite, updateSite } from "../sites.js";

const ids = () => {
  let n = 0;
  return () => `id${++n}`;
};

test("normalizeUrl adds https and a trailing slash", () => {
  assert.equal(normalizeUrl("github.com"), "https://github.com/");
  assert.equal(normalizeUrl("  github.com/foo  "), "https://github.com/foo");
  assert.equal(normalizeUrl("http://example.com"), "http://example.com/");
  assert.equal(normalizeUrl("localhost:3000"), "https://localhost:3000/");
});

test("normalizeUrl rejects things that aren't web addresses", () => {
  assert.equal(normalizeUrl(""), null);
  assert.equal(normalizeUrl("github"), null);
  assert.equal(normalizeUrl("git hub.com"), null);
  assert.equal(normalizeUrl("ftp://example.com"), null);
  assert.equal(normalizeUrl("javascript://alert(1)"), null);
});

test("defaultName uses the main part of the domain", () => {
  assert.equal(defaultName("https://github.com/"), "Github");
  assert.equal(defaultName("https://www.youtube.com/"), "Youtube");
  assert.equal(defaultName("https://mail.google.com/"), "Google");
  assert.equal(defaultName("https://www.amazon.co.uk/"), "Amazon");
  assert.equal(defaultName("https://bbc.co/"), "Bbc");
  assert.equal(defaultName("http://localhost:3000/"), "localhost");
  assert.equal(defaultName("http://192.168.1.1/"), "192.168.1.1");
});

test("addSite appends a normalized site with a default name", () => {
  const result = addSite([], { url: "github.com" }, ids());
  assert.deepEqual(result.site, {
    id: "id1", name: "Github", url: "https://github.com/", icon: null, iconSource: null, iconCheckedAt: null,
  });
  assert.deepEqual(result.sites, [result.site]);
});

test("addSite keeps a given name and icon", () => {
  const { site } = addSite([], { url: "github.com", name: " My Code ", icon: "icons/gh.png" }, ids());
  assert.equal(site.name, "My Code");
  assert.equal(site.icon, "icons/gh.png");
});

test("addSite does not change the original list", () => {
  const sites = [];
  addSite(sites, { url: "github.com" }, ids());
  assert.deepEqual(sites, []);
});

test("addSite refuses bad URLs and duplicates", () => {
  const { sites } = addSite([], { url: "github.com" }, ids());
  assert.match(addSite(sites, { url: "nope" }).error, /not a web address/);
  assert.match(addSite(sites, { url: "https://github.com" }).error, /already saved as Github/);
  assert.match(addSite(sites, { url: "gitlab.com", name: "github" }).error, /named github already exists/);
});

test("removeSite matches the name case-insensitively", () => {
  const { sites } = addSite([], { url: "github.com" }, ids());
  const result = removeSite(sites, " GITHUB ");
  assert.equal(result.site.name, "Github");
  assert.deepEqual(result.sites, []);
});

test("removeSite reports a missing name", () => {
  assert.match(removeSite([], "Github").error, /no site named Github/);
});

test("migrate starts empty when nothing is stored", () => {
  assert.deepEqual(migrate(undefined), { data: { version: SCHEMA_VERSION, sites: [] }, changed: true });
  assert.deepEqual(migrate(null).data, { version: SCHEMA_VERSION, sites: [] });
});

test("migrate leaves current data alone, even if it's empty", () => {
  const stored = { version: SCHEMA_VERSION, sites: [] };
  const { data, changed } = migrate(stored);
  assert.equal(data, stored);
  assert.equal(changed, false);
});

test("migrate upgrades version 1, marking hand-set icons as custom", () => {
  const v1 = {
    version: 1,
    sites: [
      { id: "a", name: "Gmail", url: "https://mail.google.com/", icon: null },
      { id: "b", name: "GitHub", url: "https://github.com/", icon: "icons/gh.png" },
    ],
  };
  const { data, changed } = migrate(v1);
  assert.equal(changed, true);
  assert.deepEqual(data, {
    version: 2,
    sites: [
      { id: "a", name: "Gmail", url: "https://mail.google.com/", icon: null, iconSource: null, iconCheckedAt: null },
      { id: "b", name: "GitHub", url: "https://github.com/", icon: "icons/gh.png", iconSource: "custom", iconCheckedAt: null },
    ],
  });
});

test("migrate refuses data it can't read", () => {
  assert.throws(() => migrate({ version: SCHEMA_VERSION + 1, sites: [] }), /newer version/);
  assert.throws(() => migrate({ sites: "?" }), /doesn't recognize/);
  assert.throws(() => migrate({ version: 1, sites: "?" }), /doesn't recognize/);
  assert.throws(() => migrate({ version: 0, sites: [] }), /doesn't recognize/);
});

test("addSite needs a URL", () => {
  assert.equal(addSite([], { url: "  " }).error, "a URL is required");
  assert.equal(addSite([], {}).error, "a URL is required");
});

const twoSites = () => {
  let sites = addSite([], { url: "github.com" }, () => "gh").sites;
  sites = addSite(sites, { url: "mail.google.com", name: "Gmail" }, () => "gm").sites;
  return sites;
};

test("updateSite changes the name and URL in place", () => {
  const result = updateSite(twoSites(), "gh", { url: "gitlab.com", name: " Code " });
  assert.deepEqual(result.site, {
    id: "gh", name: "Code", url: "https://gitlab.com/", icon: null, iconSource: null, iconCheckedAt: null,
  });
  assert.deepEqual(result.sites.map((s) => s.id), ["gh", "gm"]);
});

test("updateSite allows keeping its own URL and name", () => {
  const result = updateSite(twoSites(), "gh", { url: "https://github.com/", name: "github" });
  assert.equal(result.site.name, "github");
});

test("updateSite falls back to the default name", () => {
  assert.equal(updateSite(twoSites(), "gh", { url: "gitlab.com", name: "" }).site.name, "Gitlab");
});

test("updateSite refuses clashes with other sites and missing sites", () => {
  const sites = twoSites();
  assert.match(updateSite(sites, "gh", { url: "mail.google.com", name: "x" }).error, /already saved as Gmail/);
  assert.match(updateSite(sites, "gh", { url: "github.com", name: "GMAIL" }).error, /named GMAIL already exists/);
  assert.match(updateSite(sites, "gh", { url: "nope", name: "x" }).error, /not a web address/);
  assert.equal(updateSite(sites, "zz", { url: "x.com" }).error, "that site no longer exists");
});

test("findSiteByName ignores case and surrounding spaces", () => {
  assert.equal(findSiteByName(twoSites(), " gmail ").id, "gm");
  assert.equal(findSiteByName(twoSites(), "nope"), undefined);
});

const abcd = () => ["a", "b", "c", "d"].map((id) => ({ id, name: id, url: `https://${id}.com/`, icon: null }));
const order = (sites) => sites.map((s) => s.id).join("");

test("moveSite takes the target's place, shifting the rest over", () => {
  assert.equal(order(moveSite(abcd(), "a", 2)), "bcad");
  assert.equal(order(moveSite(abcd(), "d", 1)), "adbc");
});

test("moveSite clamps to the ends", () => {
  assert.equal(order(moveSite(abcd(), "b", -1)), "bacd");
  assert.equal(order(moveSite(abcd(), "b", Infinity)), "acdb");
});

test("moveSite returns the same list when nothing moves", () => {
  const sites = abcd();
  assert.equal(moveSite(sites, "b", 1), sites);
  assert.equal(moveSite(sites, "a", -5), sites);
  assert.equal(moveSite(sites, "zz", 0), sites);
});

const png = "data:image/png;base64,AAAA";

test("addSite keeps an icon's source, defaulting to custom", () => {
  assert.equal(addSite([], { url: "a.com", icon: png }).site.iconSource, "custom");
  assert.equal(addSite([], { url: "a.com", icon: png, iconSource: "favicon" }).site.iconSource, "favicon");
  assert.equal(addSite([], { url: "a.com", icon: png, iconSource: "weird" }).site.iconSource, "custom");
});

test("addSite only accepts images and relative paths as icons", () => {
  assert.equal(addSite([], { url: "a.com", icon: "icons/a.png" }).site.icon, "icons/a.png");
  for (const icon of ["https://evil.example/pixel.gif", "//evil.example/p.gif", "javascript:alert(1)", " ", 7]) {
    const { site } = addSite([], { url: "a.com", icon });
    assert.equal(site.icon, null, String(icon));
    assert.equal(site.iconSource, null);
  }
});

const iconSite = (iconSource) => ({
  id: "x", name: "X", url: "https://x.com/", icon: iconSource ? png : null, iconSource, iconCheckedAt: 5,
});

test("updateSite drops a looked-up icon when the URL changes", () => {
  const { site } = updateSite([iconSite("favicon")], "x", { url: "y.com", name: "X" });
  assert.deepEqual([site.icon, site.iconSource, site.iconCheckedAt], [null, null, null]);
});

test("updateSite keeps the icon when only the name changes, and a custom one always", () => {
  assert.equal(updateSite([iconSite("favicon")], "x", { url: "x.com", name: "Y" }).site.icon, png);
  assert.equal(updateSite([iconSite("custom")], "x", { url: "y.com", name: "X" }).site.icon, png);
});

test("updateSite sets and resets a custom icon", () => {
  const set = updateSite([iconSite("favicon")], "x", { url: "x.com", name: "X", customIcon: "data:image/png;base64,BBBB" });
  assert.deepEqual([set.site.icon, set.site.iconSource], ["data:image/png;base64,BBBB", "custom"]);
  const reset = updateSite([iconSite("custom")], "x", { url: "x.com", name: "X", customIcon: null });
  assert.deepEqual([reset.site.icon, reset.site.iconSource], [null, null]);
  assert.equal(updateSite([iconSite(null)], "x", { url: "x.com", customIcon: "https://a.com/i.png" }).error, "that icon isn't an image");
});
