import { addSite, migrate } from "./sites.js";

/** The export file's name for a given moment, by local date: `tilde-2026-10-24.json`. */
export function backupFileName(now = new Date()) {
  const date = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map((n) => String(n).padStart(2, "0"))
    .join("-");
  return `tilde-${date}.json`;
}

/**
 * Builds the export file for the stored data (`{ version, sites }`).
 * Returns `{ fileName, json, message }`; the file name comes from `backupFileName`.
 */
export function createBackup(data, now = new Date()) {
  const fileName = backupFileName(now);
  const backup = { app: "tilde", exportedAt: now.toISOString(), version: data.version, sites: data.sites };
  return {
    fileName,
    json: JSON.stringify(backup, null, 2) + "\n",
    message: `exported ${count(data.sites.length, "site")} to ${fileName}`,
  };
}

/**
 * Reads an export file's text, upgrading it to the current schema.
 * Returns `{ sites }`, or `{ error }` if it isn't a tilde backup tilde can read.
 */
export function readBackup(text) {
  let backup;
  try {
    backup = JSON.parse(text);
  } catch {
    return { error: "not a tilde backup: the file isn't valid JSON" };
  }
  if (backup?.app !== "tilde") return { error: "not a tilde backup" };
  try {
    return { sites: migrate({ version: backup.version, sites: backup.sites }).data.sites };
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * Adds backed-up sites to `current` ("merge") or in place of it ("replace"). Each site
 * goes through the same checks as `/add`, and ones that fail are skipped. Returns
 * `{ sites, message }`, or `{ error }` when a replace would leave no sites at all.
 */
export function importSites(current, incoming, mode, makeId) {
  let sites = mode === "replace" ? [] : current;
  let skipped = 0;
  for (const site of incoming) {
    const result = typeof site?.url === "string"
      ? addSite(sites, { url: site.url, name: typeof site.name === "string" ? site.name : "", icon: site.icon }, makeId)
      : { error: "no url" };
    if (result.sites) sites = result.sites;
    else skipped++;
  }

  const imported = incoming.length - skipped;
  if (mode === "replace" && imported === 0) {
    return { error: "the backup has no usable sites, so nothing was replaced" };
  }
  const verb = mode === "replace" ? "replaced your sites with" : "imported";
  const skipNote = skipped ? `, skipped ${skipped} (already saved or invalid)` : "";
  return { sites, message: `${verb} ${count(imported, "site")}${skipNote}` };
}

function count(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}
