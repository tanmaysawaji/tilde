import { test } from "node:test";
import assert from "node:assert/strict";
import { backupFileName, createBackup, importSites, readBackup } from "../backup.js";
import { SCHEMA_VERSION } from "../sites.js";

const ids = () => {
  let n = 0;
  return () => `id${++n}`;
};

const github = { id: "a", name: "Github", url: "https://github.com/", icon: null };
const gmail = { id: "b", name: "Gmail", url: "https://mail.google.com/", icon: "icons/gmail.png" };

test("createBackup names the file by local date and reports the count", () => {
  const now = new Date(2026, 9, 4, 12, 0);
  const backup = createBackup({ version: SCHEMA_VERSION, sites: [github] }, { perPage: 12 }, now);
  assert.equal(backup.fileName, "tilde-2026-10-04.json");
  assert.equal(backup.message, "exported 1 site to tilde-2026-10-04.json");
  assert.deepEqual(JSON.parse(backup.json), {
    app: "tilde",
    exportedAt: now.toISOString(),
    version: SCHEMA_VERSION,
    sites: [github],
    settings: { perPage: 12 },
  });
});

test("backupFileName pads the local date", () => {
  assert.equal(backupFileName(new Date(2027, 0, 5, 23, 59)), "tilde-2027-01-05.json");
});

test("readBackup reads back what createBackup wrote", () => {
  const { json } = createBackup({ version: SCHEMA_VERSION, sites: [github, gmail] }, { perPage: 8 });
  assert.deepEqual(readBackup(json), { sites: [github, gmail], settings: { perPage: 8 } });
});

test("readBackup refuses files that aren't tilde backups it can read", () => {
  assert.match(readBackup("{oops").error, /isn't valid JSON/);
  assert.equal(readBackup('{"sites": []}').error, "not a tilde backup");
  assert.equal(readBackup("null").error, "not a tilde backup");
  assert.match(readBackup(JSON.stringify({ app: "tilde", version: SCHEMA_VERSION + 1, sites: [] })).error, /newer version/);
  assert.match(readBackup(JSON.stringify({ app: "tilde", version: SCHEMA_VERSION })).error, /doesn't recognize/);
});

test("importSites merges, skipping sites already saved", () => {
  const result = importSites([github], [github, gmail], "merge", ids());
  assert.deepEqual(result.sites.map((s) => s.name), ["Github", "Gmail"]);
  assert.equal(result.sites[1].icon, "icons/gmail.png");
  assert.equal(result.message, "imported 1 site, skipped 1 (already saved or invalid)");
});

test("importSites replaces the current sites", () => {
  const other = { id: "c", name: "Walmart", url: "https://www.walmart.com/", icon: null };
  const result = importSites([other], [github, gmail], "replace", ids());
  assert.deepEqual(result.sites.map((s) => s.name), ["Github", "Gmail"]);
  assert.equal(result.message, "replaced your sites with 2 sites");
});

test("importSites skips invalid entries", () => {
  const incoming = [null, { name: "No URL" }, { url: "not a url" }, { url: "github.com", name: 7 }];
  const result = importSites([], incoming, "merge", ids());
  assert.deepEqual(result.sites.map((s) => s.name), ["Github"]);
  assert.equal(result.message, "imported 1 site, skipped 3 (already saved or invalid)");
});

test("importSites won't replace everything with nothing", () => {
  assert.match(importSites([github], [], "replace").error, /nothing was replaced/);
  assert.match(importSites([github], [{ url: "bad" }], "replace").error, /nothing was replaced/);
  assert.equal(importSites([github], [], "merge").message, "imported 0 sites");
});

test("importSites carries icons and where they came from", () => {
  const withIcon = { id: "d", name: "Docs", url: "https://docs.example/", icon: "data:image/png;base64,A", iconSource: "duckduckgo" };
  const { sites } = importSites([], [withIcon], "merge", ids());
  assert.deepEqual([sites[0].icon, sites[0].iconSource], ["data:image/png;base64,A", "duckduckgo"]);
});

test("readBackup upgrades a version 1 backup", () => {
  const v1 = JSON.stringify({ app: "tilde", version: 1, sites: [{ id: "a", name: "A", url: "https://a.com/", icon: "icons/a.png" }] });
  assert.equal(readBackup(v1).sites[0].iconSource, "custom");
});

test("readBackup has no settings for backups made before settings existed", () => {
  const old = JSON.stringify({ app: "tilde", version: SCHEMA_VERSION, sites: [] });
  assert.equal(readBackup(old).settings, null);
  const odd = JSON.stringify({ app: "tilde", version: SCHEMA_VERSION, sites: [], settings: { perPage: -1 } });
  assert.deepEqual(readBackup(odd).settings, { perPage: "auto" });
});
