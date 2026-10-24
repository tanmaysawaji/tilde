import { addSite, migrate, moveSite, updateSite } from "./sites.js";
import { complete, parseCommand, runCommand } from "./commands.js";
import { addToHistory, browseHistory } from "./history.js";
import { backupFileName, createBackup, importSites, readBackup } from "./backup.js";

const LETTER_COLORS = ["#74c7ec", "#cba6f7", "#fab387", "#a6e3a1", "#f5c2e7", "#89b4fa", "#f9e2af", "#94e2d5"];
const hasExtensionApi = typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL;

// Prompt fill line, like Starship's $fill
document.getElementById("fill").textContent = "─".repeat(400);

// Clock
const dateEl = document.getElementById("date");
const timeEl = document.getElementById("time");
function tick() {
  const now = new Date();
  dateEl.textContent = now.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  timeEl.textContent = now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  timeEl.dateTime = now.toISOString();
}
tick();
setInterval(tick, 1000);

const SITES_KEY = "tilde";
const HISTORY_KEY = "history";
const storage = hasExtensionApi && chrome.storage ? chrome.storage.local : null;
// Outside the extension there's no chrome.storage, so changes last until the tab closes
const unsaved = {};

async function read(key) {
  return storage ? (await storage.get(key))[key] : unsaved[key];
}

async function write(key, value) {
  if (storage) await storage.set({ [key]: value });
  else unsaved[key] = value;
}

async function loadData() {
  const { data, changed } = migrate(await read(SITES_KEY), typeof LINKS !== "undefined" ? LINKS : []);
  if (changed) await write(SITES_KEY, data);
  return data;
}

let commandHistory = [];
let historyState = null;

async function loadHistory() {
  const stored = await read(HISTORY_KEY);
  return Array.isArray(stored) ? stored : [];
}

async function recordCommand(text) {
  commandHistory = addToHistory(await loadHistory(), text);
  await write(HISTORY_KEY, commandHistory);
}

const sitesEl = document.getElementById("sites");
let currentSites = [];

function renderSites(sites) {
  currentSites = sites;
  sitesEl.replaceChildren(...sites.map(siteTile), addTile());
  updateGhost();
}

function siteTile(site, i) {
  const a = document.createElement("a");
  a.className = "site";
  a.href = site.url;

  const name = document.createElement("span");
  name.className = "name";
  name.textContent = site.name;
  a.append(siteIcon(site, i), name);

  // A sibling of the link, not inside it: a button can't be nested in a link
  const edit = document.createElement("button");
  edit.type = "button";
  edit.className = "edit";
  edit.textContent = "\uf040";
  edit.title = `Edit ${site.name}`;
  edit.setAttribute("aria-label", `Edit ${site.name}`);
  edit.addEventListener("click", () => openEditor(site));

  const tile = document.createElement("div");
  tile.className = "tile";
  tile.dataset.id = site.id;
  tile.append(a, edit);
  return tile;
}

function addTile() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "site add-tile";

  const icon = document.createElement("span");
  icon.className = "icon";
  icon.textContent = "+";

  const name = document.createElement("span");
  name.className = "name";
  name.textContent = "Add";

  button.append(icon, name);
  button.addEventListener("click", () => openEditor(null));
  return button;
}

const DRAG_TYPE = "application/x-tilde-site";
let dropTarget = null;
let reorderQueue = Promise.resolve();

// Moves run one after another, each on freshly read sites, so quick repeats (holding
// Alt+→) don't work from a stale order
function reorder(change) {
  reorderQueue = reorderQueue.then(async () => {
    try {
      const data = await loadData();
      const sites = change(data.sites);
      if (sites !== data.sites) await saveSites(data, sites);
    } catch (err) {
      showOutput(err.message, "error");
    }
  });
  return reorderQueue;
}

function setDropTarget(el) {
  dropTarget?.classList.remove("drop-target");
  dropTarget = el?.classList.contains("dragging") ? null : el;
  dropTarget?.classList.add("drop-target");
}

sitesEl.addEventListener("dragstart", (e) => {
  const tile = e.target.closest(".tile");
  if (!tile) return;
  e.dataTransfer.setData(DRAG_TYPE, tile.dataset.id);
  tile.classList.add("dragging");
});

sitesEl.addEventListener("dragover", (e) => {
  const target = e.target.closest(".tile, .add-tile");
  if (!target || !e.dataTransfer.types.includes(DRAG_TYPE)) {
    setDropTarget(null);
    return;
  }
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  setDropTarget(target);
});

sitesEl.addEventListener("dragleave", (e) => {
  if (!sitesEl.contains(e.relatedTarget)) setDropTarget(null);
});

sitesEl.addEventListener("drop", (e) => {
  const target = e.target.closest(".tile, .add-tile");
  const id = e.dataTransfer.getData(DRAG_TYPE);
  if (!target || !id) return;
  e.preventDefault();
  const targetId = target.dataset.id;
  reorder((sites) => {
    if (!targetId) return moveSite(sites, id, Infinity);
    const to = sites.findIndex((s) => s.id === targetId);
    return to === -1 ? sites : moveSite(sites, id, to);
  });
});

sitesEl.addEventListener("dragend", () => {
  setDropTarget(null);
  sitesEl.querySelector(".dragging")?.classList.remove("dragging");
});

sitesEl.addEventListener("keydown", async (e) => {
  if (!e.altKey || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
  const tile = e.target.closest(".tile");
  if (!tile) return;
  // Alt+← is also the browser's Back
  e.preventDefault();
  const id = tile.dataset.id;
  const delta = e.key === "ArrowLeft" ? -1 : 1;
  const focused = e.target.classList.contains("edit") ? ".edit" : ".site";
  await reorder((sites) => moveSite(sites, id, sites.findIndex((s) => s.id === id) + delta));
  sitesEl.querySelector(`.tile[data-id="${CSS.escape(id)}"] ${focused}`)?.focus();
});

function siteIcon(site, i) {
  const icon = document.createElement("span");
  icon.className = "icon";

  const src = site.icon
    ? site.icon
    : hasExtensionApi
      ? chrome.runtime.getURL("/_favicon/?pageUrl=" + encodeURIComponent(site.url) + "&size=64")
      : null;

  if (src) {
    const img = document.createElement("img");
    img.src = src;
    img.alt = "";
    img.onerror = () => img.replaceWith(letterFor(site.name, i));
    icon.append(img);
  } else {
    icon.append(letterFor(site.name, i));
  }
  return icon;
}

function letterFor(name, i) {
  const s = document.createElement("span");
  s.className = "letter";
  s.textContent = name.trim().charAt(0).toUpperCase();
  s.style.color = LETTER_COLORS[i % LETTER_COLORS.length];
  return s;
}

loadData().then((data) => renderSites(data.sites), (err) => showOutput(err.message, "error"));
loadHistory().then((stored) => (commandHistory = stored));

// Keeps other open tabs in step when one of them changes the sites or history
storage?.onChanged.addListener((changes) => {
  const data = changes[SITES_KEY]?.newValue;
  if (data) renderSites(data.sites);
  if (changes[HISTORY_KEY]) commandHistory = changes[HISTORY_KEY].newValue ?? [];
});

const output = document.getElementById("output");
const FADE_DELAY_MS = 3000;
const FADE_MS = 400; // matches the .output.fading transition in tilde.css
let fadeTimers = [];

function showOutput(text, kind) {
  clearOutput();
  output.textContent = text;
  output.dataset.kind = kind;
  if (kind === "ok") {
    fadeTimers = [
      setTimeout(() => output.classList.add("fading"), FADE_DELAY_MS),
      setTimeout(clearOutput, FADE_DELAY_MS + FADE_MS),
    ];
  }
}

function clearOutput() {
  fadeTimers.forEach(clearTimeout);
  fadeTimers = [];
  output.textContent = "";
  output.classList.remove("fading");
  pending = null;
  clearDropReady();
}

// Search: URLs open directly, everything else goes to your default search engine
const form = document.getElementById("search");
const q = document.getElementById("q");

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = q.value.trim();
  if (!text) return;

  const command = parseCommand(text);
  if (command) {
    runPromptCommand(text, command);
    return;
  }

  const url = toUrl(text);
  if (url) {
    location.href = url;
  } else if (typeof chrome !== "undefined" && chrome.search && chrome.search.query) {
    chrome.search.query({ text, disposition: "CURRENT_TAB" });
  } else {
    location.href = "https://search.brave.com/search?q=" + encodeURIComponent(text);
  }
});

async function runPromptCommand(text, command) {
  historyState = null;
  try {
    await recordCommand(text);
    // Read fresh rather than reuse what's rendered, in case another tab changed the sites
    const data = await loadData();
    const result = runCommand(data.sites, command);
    if (result.action) {
      q.value = "";
      updateGhost();
      if (result.action === "export") awaitExport();
      else if (result.action === "import") awaitImportFile(result.mode);
      else {
        clearOutput();
        openEditor(data.sites.find((s) => s.id === result.id));
      }
      return;
    }
    if (result.error) {
      showOutput(result.error, "error");
      return;
    }
    if (result.sites) {
      await write(SITES_KEY, { ...data, sites: result.sites });
      renderSites(result.sites);
    }
    q.value = "";
    updateGhost();
    if (result.info) showOutput(result.info, "info");
    else showOutput(result.message, "ok");
  } catch (err) {
    showOutput(err.message, "error");
  }
}

function download(fileName, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// Opening a file dialog straight from Enter leaves the pointer hidden in it (Windows
// hides it while typing), so /import and /export wait for a click instead.
let pending = null;

function awaitClick(text, label, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "action";
  button.textContent = label;
  button.addEventListener("click", onClick);
  showOutput(text, "info");
  output.append(button, " (Esc to cancel)");
}

function awaitExport() {
  awaitClick(`${backupFileName()} is ready: `, "save…", exportSites);
  pending = { action: "export" };
}

async function exportSites() {
  try {
    const backup = createBackup(await loadData());
    download(backup.fileName, backup.json);
    showOutput(backup.message, "ok");
  } catch (err) {
    showOutput(err.message, "error");
  }
}

function awaitImportFile(mode) {
  awaitClick("drop a backup file on the page, or ", "browse…", async () => {
    const file = await pickFile();
    if (file) importFile(file, mode);
  });
  pending = { action: "import", mode };
}

async function importFile(file, mode) {
  try {
    const backup = readBackup(await file.text());
    const data = await loadData();
    const result = backup.error ? backup : importSites(data.sites, backup.sites, mode);
    if (result.error) {
      showOutput(result.error, "error");
      return;
    }
    await write(SITES_KEY, { ...data, sites: result.sites });
    renderSites(result.sites);
    showOutput(result.message, "ok");
  } catch (err) {
    showOutput(err.message, "error");
  }
}

document.addEventListener("dragover", (e) => {
  if (pending?.action !== "import" || !e.dataTransfer.types.includes("Files")) return;
  e.preventDefault();
  document.documentElement.classList.add("drop-ready");
});

document.addEventListener("dragleave", (e) => {
  if (!e.relatedTarget) clearDropReady();
});

document.addEventListener("drop", (e) => {
  if (pending?.action !== "import") return;
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (file) importFile(file, pending.mode);
  else clearDropReady();
});

function clearDropReady() {
  document.documentElement.classList.remove("drop-ready");
}

function pickFile() {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.addEventListener("change", () => resolve(input.files[0] ?? null));
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}

const editor = document.getElementById("editor");
const editorForm = document.getElementById("editor-form");
const editorTitle = document.getElementById("editor-title");
const editorUrl = document.getElementById("editor-url");
const editorName = document.getElementById("editor-name");
const editorError = document.getElementById("editor-error");
const editorDelete = document.getElementById("editor-delete");
let editing = null;
let returnFocus = null;

/** Opens the panel to edit `site`, or to add a new site when `site` is null. */
function openEditor(site) {
  editing = site;
  returnFocus = document.activeElement;
  const index = site ? currentSites.findIndex((s) => s.id === site.id) : -1;
  editorTitle.replaceChildren(...(site ? [siteIcon(site, Math.max(index, 0)), `Edit ${site.name}`] : ["Add a site"]));
  editorUrl.value = site?.url ?? "";
  editorName.value = site?.name ?? "";
  editorError.textContent = "";
  editorDelete.hidden = !site;
  resetDelete();
  editor.showModal();
  (site ? editorName : editorUrl).focus();
}

function resetDelete() {
  editorDelete.classList.remove("confirming");
  editorDelete.textContent = "Delete";
}

async function saveSites(data, sites) {
  await write(SITES_KEY, { ...data, sites });
  renderSites(sites);
}

editorForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const data = await loadData();
    const fields = { url: editorUrl.value, name: editorName.value };
    const result = editing ? updateSite(data.sites, editing.id, fields) : addSite(data.sites, fields);
    if (result.error) {
      editorError.textContent = result.error;
      return;
    }
    const message = editing ? `saved ${result.site.name}` : `added ${result.site.name} → ${result.site.url}`;
    await saveSites(data, result.sites);
    editor.close();
    showOutput(message, "ok");
  } catch (err) {
    editorError.textContent = err.message;
  }
});

editorDelete.addEventListener("click", async () => {
  if (!editorDelete.classList.contains("confirming")) {
    editorDelete.classList.add("confirming");
    editorDelete.textContent = "Really delete?";
    return;
  }
  try {
    const data = await loadData();
    const name = editing.name;
    await saveSites(data, data.sites.filter((s) => s.id !== editing.id));
    editor.close();
    showOutput(`removed ${name}`, "ok");
  } catch (err) {
    editorError.textContent = err.message;
  }
});

editorDelete.addEventListener("blur", resetDelete);
document.getElementById("editor-cancel").addEventListener("click", () => editor.close());
for (const field of [editorUrl, editorName]) {
  field.addEventListener("input", () => (editorError.textContent = ""));
}

// The form fills the dialog, so a click landing on the dialog itself is on the backdrop
editor.addEventListener("click", (e) => {
  if (e.target === editor) editor.close();
});

editor.addEventListener("close", () => {
  editing = null;
  // Tiles are rebuilt on save, so the button that opened the panel may be gone
  (returnFocus?.isConnected ? returnFocus : q).focus();
});

const ghostTyped = document.getElementById("ghost-typed");
const ghostRest = document.getElementById("ghost-rest");

function suggestion() {
  const caretAtEnd = q.selectionStart === q.value.length && q.selectionEnd === q.value.length;
  if (document.activeElement !== q || !caretAtEnd) return null;
  return complete(q.value, currentSites);
}

function updateGhost() {
  const completion = suggestion();
  // The overlay can't follow the input when it scrolls, so it only shows while the text fits
  const fits = q.scrollWidth <= q.clientWidth;
  ghostTyped.textContent = q.value;
  ghostRest.textContent = completion && fits ? completion.slice(q.value.length) : "";
}

// Help is reference for the command being typed, so typing leaves it up
function promptEdited() {
  if (output.dataset.kind !== "info") clearOutput();
  updateGhost();
}

function replacePrompt(text) {
  q.value = text;
  promptEdited();
}

q.addEventListener("input", promptEdited);
for (const type of ["keyup", "click", "focus", "blur"]) q.addEventListener(type, updateGhost);

q.addEventListener("keydown", (e) => {
  if (e.key === "Tab" && !e.shiftKey) {
    const completion = suggestion();
    if (!completion) return;
    e.preventDefault();
    replacePrompt(completion);
  } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
    e.preventDefault();
    const step = browseHistory(commandHistory, historyState, e.key === "ArrowUp" ? -1 : 1, q.value);
    if (!step) return;
    historyState = step.state;
    replacePrompt(step.text);
  }
});

function toUrl(text) {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return text;
  if (/\s/.test(text)) return null;
  if (/^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?(\/.*)?$/i.test(text)) return "http://" + text;
  const host = text.split(/[/:]/)[0].toLowerCase();
  const tld = host.includes(".") ? host.split(".").pop() : "";
  if (COMMON_TLDS.has(tld)) return "https://" + text;
  return null;
}

// Only these count as web addresses, so searches like "node.js" still search
const COMMON_TLDS = new Set(["com", "org", "net", "io", "dev", "app", "ai", "co", "me", "gg", "tv", "sh",
  "edu", "gov", "us", "uk", "ca", "de", "in", "info", "xyz", "so", "ly", "fm", "to"]);

// "/" jumps to the search bar, Esc clears it
document.addEventListener("keydown", (e) => {
  if (editor.open) return;
  if (e.key === "/" && document.activeElement !== q) {
    e.preventDefault();
    q.focus();
  } else if (e.key === "Escape" && document.activeElement === q) {
    q.value = "";
    historyState = null;
    clearOutput();
    updateGhost();
  } else if (e.key === "Escape" && pending) {
    clearOutput();
    q.focus();
  }
});
