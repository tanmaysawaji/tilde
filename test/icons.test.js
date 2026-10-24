import { test } from "node:test";
import assert from "node:assert/strict";
import { RECHECK_MS, applyIcon, duckduckgoIconUrl, sitesNeedingIcons } from "../icons.js";

const site = (id, iconSource, iconCheckedAt = null) => ({
  id, name: id, url: `https://${id}.com/`, icon: null, iconSource, iconCheckedAt,
});

test("duckduckgoIconUrl uses the host only", () => {
  assert.equal(duckduckgoIconUrl("https://mail.google.com/u/0/?x=1"), "https://icons.duckduckgo.com/ip3/mail.google.com.ico");
});

test("sitesNeedingIcons picks new sites and globe sites due a recheck", () => {
  const now = 10 * RECHECK_MS;
  const sites = [
    site("new", null),
    site("fav", "favicon", now),
    site("ddg", "duckduckgo", now),
    site("mine", "custom"),
    site("globe-old", "globe", now - RECHECK_MS),
    site("globe-fresh", "globe", now - 1),
    site("globe-never", "globe"),
  ];
  assert.deepEqual(sitesNeedingIcons(sites, now).map((s) => s.id), ["new", "globe-old", "globe-never"]);
  assert.deepEqual(sitesNeedingIcons(sites, now, { recheckGlobe: true }).map((s) => s.id),
    ["new", "globe-old", "globe-fresh", "globe-never"]);
});

test("applyIcon stores the icon and when it was checked", () => {
  const result = applyIcon([site("a", null)], "a", "https://a.com/", { icon: "data:image/png;base64,A", iconSource: "favicon" }, 42);
  assert.deepEqual(result[0], {
    id: "a", name: "a", url: "https://a.com/", icon: "data:image/png;base64,A", iconSource: "favicon", iconCheckedAt: 42,
  });
});

test("applyIcon skips sites that changed while the lookup ran", () => {
  const found = { icon: null, iconSource: "globe" };
  const moved = [site("a", null)];
  assert.equal(applyIcon(moved, "a", "https://old.com/", found, 1), moved);
  const custom = [site("a", "custom")];
  assert.equal(applyIcon(custom, "a", "https://a.com/", found, 1), custom);
  const gone = [site("a", null)];
  assert.equal(applyIcon(gone, "zz", "https://a.com/", found, 1), gone);
});
