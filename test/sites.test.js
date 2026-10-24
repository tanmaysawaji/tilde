import { test } from "node:test";
import assert from "node:assert/strict";
import { SCHEMA_VERSION, addSite, defaultName, findSiteByName, migrate, normalizeUrl, removeSite, updateSite } from "../sites.js";

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
  assert.deepEqual(result.site, { id: "id1", name: "Github", url: "https://github.com/", icon: null });
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

test("migrate imports legacy links on first run", () => {
  const legacy = [
    { name: "Gmail", url: "https://mail.google.com/" },
    { name: "GitHub", url: "https://github.com/", icon: "icons/gh.png" },
  ];
  const { data, changed } = migrate(undefined, legacy, ids());
  assert.equal(changed, true);
  assert.deepEqual(data, {
    version: SCHEMA_VERSION,
    sites: [
      { id: "id1", name: "Gmail", url: "https://mail.google.com/", icon: null },
      { id: "id2", name: "GitHub", url: "https://github.com/", icon: "icons/gh.png" },
    ],
  });
});

test("migrate starts empty without legacy links", () => {
  assert.deepEqual(migrate(undefined, undefined).data, { version: SCHEMA_VERSION, sites: [] });
});

test("migrate leaves current data alone, even if it's empty", () => {
  const stored = { version: SCHEMA_VERSION, sites: [] };
  const { data, changed } = migrate(stored, [{ name: "Gmail", url: "https://mail.google.com/" }]);
  assert.equal(data, stored);
  assert.equal(changed, false);
});

test("migrate refuses data it can't read", () => {
  assert.throws(() => migrate({ version: SCHEMA_VERSION + 1, sites: [] }), /newer version/);
  assert.throws(() => migrate({ sites: "?" }), /doesn't recognize/);
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
  assert.deepEqual(result.site, { id: "gh", name: "Code", url: "https://gitlab.com/", icon: null });
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
