import { addSite, migrate, moveSite, updateSite } from "./sites.js";
import { complete, parseCommand, runCommand } from "./commands.js";
import { addToHistory, browseHistory } from "./history.js";
import { backupFileName, createBackup, importSites, readBackup } from "./backup.js";
import { applyIcon, duckduckgoIconUrl, sitesNeedingIcons } from "./icons.js";
import { balancedShape, endOfPage, fitGrid, flipDirection, pageCount, pageOf, tilesPerPage } from "./pages.js";
import { DEFAULT_SETTINGS, readSettings } from "./settings.js";

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
const SETTINGS_KEY = "settings";
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
  const { data, changed } = migrate(await read(SITES_KEY));
  if (changed) await write(SITES_KEY, data);
  return data;
}

let siteQueue = Promise.resolve();

// Every read-change-write of the sites runs through here, one at a time, on freshly read
// data, so two changes (a move and a background icon lookup, say) can't overwrite each other
function withSites(task) {
  const run = siteQueue.then(async () => task(await loadData()));
  siteQueue = run.catch(() => {});
  return run;
}

async function saveSites(data, sites, { findIcons = true } = {}) {
  await write(SITES_KEY, { ...data, sites });
  renderSites(sites);
  if (findIcons) lookUpIcons();
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
const pagerEl = document.getElementById("pager");
let currentSites = [];
let settings = DEFAULT_SETTINGS;

const MIN_TILE_WIDTH = 112; // matches the .sites column minimum in tilde.css
const GAP = 10; // matches the .sites gap in tilde.css
const BOTTOM_SPACE = 16;
let tileHeight = 140;
let currentPage = 0;
let layout = { cols: 1, fit: 1, perPage: 1, tileWidth: MIN_TILE_WIDTH };

function renderSites(sites) {
  currentSites = sites;
  renderPage();
  updateGhost();
}

function computeLayout() {
  const width = sitesEl.clientWidth;
  const style = (el) => getComputedStyle(el);
  // From the output line's minimum height, so a long /help doesn't reshuffle the pages
  const top = output.getBoundingClientRect().top + parseFloat(style(output).minHeight) + parseFloat(style(sitesEl).marginTop);
  // The page list's space counts even while it's hidden, so it appearing never reshuffles either
  const pagerSpace = parseFloat(style(document.documentElement).getPropertyValue("--pager-space"));
  const height = window.innerHeight - top - pagerSpace - BOTTOM_SPACE;
  const { cols, rows } = fitGrid({ width, height, minTileWidth: MIN_TILE_WIDTH, tileHeight, gap: GAP });
  const fit = cols * rows;
  layout = { cols, fit, perPage: tilesPerPage(settings.perPage, fit), tileWidth: (width - GAP * (cols - 1)) / cols };
}

// The + tile takes a slot after the sites, so it's on the last page
function pagesTotal() {
  return pageCount(currentSites.length + 1, layout.perPage);
}

function renderPage() {
  computeLayout();
  const total = currentSites.length + 1;
  currentPage = Math.min(currentPage, pagesTotal() - 1);
  const start = currentPage * layout.perPage;
  const end = Math.min(start + layout.perPage, total);
  const tiles = [];
  for (let i = start; i < end; i++) tiles.push(i < currentSites.length ? siteTile(currentSites[i], i) : addTile());

  const { cols } = balancedShape(tiles.length, layout.cols);
  sitesEl.style.gridTemplateColumns = `repeat(${cols}, ${layout.tileWidth}px)`;
  // Every page is as tall as a full one, so the page list below stays put when the last page is shorter
  const fullRows = balancedShape(layout.perPage, layout.cols).rows;
  sitesEl.style.minHeight = pagesTotal() > 1 ? `${fullRows * tileHeight + (fullRows - 1) * GAP}px` : "";
  // The dragged tile has to stay in the document or the drag breaks, even when its page is gone
  if (dragSource && sitesEl.contains(dragSource)) dragHolder.append(dragSource);
  sitesEl.replaceChildren(...tiles);
  renderPager();
  if (draggedId) updateFlipZones();

  const measured = sitesEl.firstElementChild?.offsetHeight;
  if (measured && measured !== tileHeight) {
    tileHeight = measured;
    renderPage();
  }
}

function renderPager() {
  const pages = pagesTotal();
  pagerEl.hidden = pages < 2;
  pagerEl.replaceChildren(...Array.from({ length: pages }, (_, page) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.page = page;
    button.setAttribute("aria-label", `Page ${page + 1}`);
    if (page === currentPage) {
      button.setAttribute("aria-current", "page");
      button.textContent = `[${page + 1}]`;
    } else {
      button.textContent = String(page + 1);
    }
    button.addEventListener("click", () => goToPage(page));
    return button;
  }));
}

function goToPage(page) {
  if (page < 0 || page >= pagesTotal() || page === currentPage) return;
  currentPage = page;
  renderPage();
}

function showSite(id) {
  const index = currentSites.findIndex((s) => s.id === id);
  if (index !== -1) goToPage(pageOf(index, layout.perPage));
}

let resizeFrame = 0;
window.addEventListener("resize", () => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(renderPage);
});

let wheelTimer = null;
window.addEventListener("wheel", (e) => {
  // A trackpad flick fires a stream of wheel events; only the first of a stream turns the page
  const startsGesture = wheelTimer === null;
  clearTimeout(wheelTimer);
  wheelTimer = setTimeout(() => (wheelTimer = null), 200);
  if (!startsGesture || panelOpen() || e.ctrlKey || e.deltaY === 0) return;
  goToPage(currentPage + Math.sign(e.deltaY));
}, { passive: true });

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
  if (site.id === draggedId) tile.classList.add("dragging");
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
// Brave's drag image for a link is a URL label that hides what's under the cursor, such as
// the page numbers, so tiles drag with a blank one; the dimmed tile and outlines show the rest
const BLANK_DRAG_IMAGE = new Image();
BLANK_DRAG_IMAGE.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
const FIRST_FLIP_MS = 600;
const REPEAT_FLIP_MS = 1000;
const FLIP_ZONE_MIN = 48;
const dragHolder = document.getElementById("drag-holder");
const flipZones = { [-1]: document.getElementById("flip-left"), 1: document.getElementById("flip-right") };
let draggedId = null;
let dragSource = null;
let flipDir = 0;
let flipTimer = null;

function reorder(change) {
  return withSites(async (data) => {
    const sites = change(data.sites);
    if (sites !== data.sites) await saveSites(data, sites);
  }).catch((err) => showOutput(err.message, "error"));
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
  e.dataTransfer.setDragImage(BLANK_DRAG_IMAGE, 0, 0);
  tile.classList.add("dragging");
  draggedId = tile.dataset.id;
  dragSource = tile;
  updateFlipZones();
});

function tileEdges() {
  const rects = [...sitesEl.children].map((el) => el.getBoundingClientRect());
  return { left: Math.min(...rects.map((r) => r.left)), right: Math.max(...rects.map((r) => r.right)) };
}

function canFlip(dir) {
  const page = currentPage + dir;
  return dir !== 0 && page >= 0 && page < pagesTotal();
}

function updateFlipZones() {
  const { left, right } = tileEdges();
  flipZones[-1].style.width = `${Math.max(left, FLIP_ZONE_MIN)}px`;
  flipZones[1].style.width = `${window.innerWidth - Math.min(right, window.innerWidth - FLIP_ZONE_MIN)}px`;
  for (const dir of [-1, 1]) {
    flipZones[dir].classList.toggle("shown", Boolean(draggedId) && canFlip(dir));
    flipZones[dir].classList.toggle("armed", dir === flipDir);
  }
}

function setFlip(dir) {
  const next = canFlip(dir) ? dir : 0;
  if (next === flipDir) return;
  flipDir = next;
  clearTimeout(flipTimer);
  if (flipDir) flipTimer = setTimeout(flip, FIRST_FLIP_MS);
  updateFlipZones();
}

function flip() {
  goToPage(currentPage + flipDir);
  if (canFlip(flipDir)) flipTimer = setTimeout(flip, REPEAT_FLIP_MS);
  else setFlip(0);
}

// The side zones are outside the grid, so they're watched from the whole document
document.addEventListener("dragover", (e) => {
  if (!draggedId) return;
  const edges = { ...tileEdges(), windowWidth: window.innerWidth, minWidth: FLIP_ZONE_MIN };
  setFlip(flipDirection(e.clientX, edges));
});

document.addEventListener("dragleave", (e) => {
  if (draggedId && !e.relatedTarget) setFlip(0);
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

pagerEl.addEventListener("dragover", (e) => {
  const button = e.target.closest("button");
  if (!button || !e.dataTransfer.types.includes(DRAG_TYPE)) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  setDropTarget(button);
});

pagerEl.addEventListener("dragleave", (e) => {
  if (!pagerEl.contains(e.relatedTarget)) setDropTarget(null);
});

pagerEl.addEventListener("drop", (e) => {
  const button = e.target.closest("button");
  const id = e.dataTransfer.getData(DRAG_TYPE);
  if (!button || !id) return;
  e.preventDefault();
  const page = Number(button.dataset.page);
  reorder((sites) => moveSite(sites, id, endOfPage(page, layout.perPage, sites.length)));
});

// On the document, since the dragged tile may be parked outside the grid by then
document.addEventListener("dragend", () => {
  if (!draggedId) return;
  draggedId = null;
  dragSource = null;
  dragHolder.replaceChildren();
  setFlip(0);
  setDropTarget(null);
  sitesEl.querySelector(".dragging")?.classList.remove("dragging");
  updateFlipZones();
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
  showSite(id);
  sitesEl.querySelector(`.tile[data-id="${CSS.escape(id)}"] ${focused}`)?.focus();
});

function siteIcon(site, i) {
  const icon = document.createElement("span");
  icon.className = "icon";

  const src = site.icon ?? (hasExtensionApi ? faviconUrl(site.url) : null);

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

const ICON_SIZE = 64;
// The favicon cache can't know this address, so it answers with its generic globe
const UNKNOWN_SITE = "https://tilde.invalid/";
const DUCKDUCKGO = { origins: ["https://icons.duckduckgo.com/*"] };
const hasPermissionsApi = hasExtensionApi && chrome.permissions;
let lookingUp = false;
let lookUpAgain = null;

function faviconUrl(pageUrl) {
  return chrome.runtime.getURL("/_favicon/?pageUrl=" + encodeURIComponent(pageUrl) + "&size=" + ICON_SIZE);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("that file isn't an image Brave can read"));
    img.src = src;
  });
}

// Draws into a fixed square, so icons compare pixel for pixel and uploads stay small
function toPng(img) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = ICON_SIZE;
  const width = img.naturalWidth || ICON_SIZE;
  const height = img.naturalHeight || ICON_SIZE;
  const scale = Math.min(ICON_SIZE / width, ICON_SIZE / height);
  const [w, h] = [width * scale, height * scale];
  canvas.getContext("2d").drawImage(img, (ICON_SIZE - w) / 2, (ICON_SIZE - h) / 2, w, h);
  return canvas.toDataURL("image/png");
}

async function blobToPng(blob) {
  const url = URL.createObjectURL(blob);
  try {
    return toPng(await loadImage(url));
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function duckduckgoOn() {
  return hasPermissionsApi ? chrome.permissions.contains(DUCKDUCKGO) : false;
}

async function lookUpIcon(siteUrl) {
  const images = await Promise.all([loadImage(faviconUrl(siteUrl)), loadImage(faviconUrl(UNKNOWN_SITE))]);
  const [favicon, globe] = images.map(toPng);
  if (favicon !== globe) return { icon: favicon, iconSource: "favicon" };
  if (await duckduckgoOn()) {
    const icon = await fetchDuckDuckGoIcon(siteUrl);
    if (icon) return { icon, iconSource: "duckduckgo" };
  }
  return { icon: null, iconSource: "globe" };
}

async function fetchDuckDuckGoIcon(siteUrl) {
  try {
    const response = await fetch(duckduckgoIconUrl(siteUrl));
    return response.ok ? await blobToPng(await response.blob()) : null;
  } catch {
    return null;
  }
}

function lookUpIcons(options = {}) {
  if (!hasExtensionApi) return;
  if (lookingUp) {
    lookUpAgain = { recheckGlobe: Boolean(lookUpAgain?.recheckGlobe || options.recheckGlobe) };
    return;
  }
  lookingUp = true;
  (async () => {
    try {
      const data = await loadData();
      for (const site of sitesNeedingIcons(data.sites, Date.now(), options)) {
        const found = await lookUpIcon(site.url).catch(() => ({ icon: null, iconSource: "globe" }));
        await withSites(async (fresh) => {
          const sites = applyIcon(fresh.sites, site.id, site.url, found, Date.now());
          if (sites !== fresh.sites) await saveSites(fresh, sites, { findIcons: false });
        });
      }
    } catch (err) {
      showOutput(err.message, "error");
    }
    lookingUp = false;
    if (lookUpAgain) {
      const again = lookUpAgain;
      lookUpAgain = null;
      lookUpIcons(again);
    }
  })();
}

loadData().then((data) => {
  renderSites(data.sites);
  lookUpIcons();
}, (err) => showOutput(err.message, "error"));
read(SETTINGS_KEY).then((stored) => {
  settings = readSettings(stored);
  renderPage();
});
loadHistory().then((stored) => (commandHistory = stored));

// Keeps other open tabs in step when one of them changes the sites or history
storage?.onChanged.addListener((changes) => {
  const data = changes[SITES_KEY]?.newValue;
  if (data) renderSites(data.sites);
  if (changes[HISTORY_KEY]) commandHistory = changes[HISTORY_KEY].newValue ?? [];
  if (changes[SETTINGS_KEY]) {
    settings = readSettings(changes[SETTINGS_KEY].newValue);
    renderPage();
  }
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
    const { result, sites } = await withSites(async (data) => {
      const result = runCommand(data.sites, command);
      if (result.sites) await saveSites(data, result.sites);
      return { result, sites: data.sites };
    });
    if (result.action === "page" && result.page > pagesTotal()) {
      const pages = pagesTotal();
      showOutput(pages === 1 ? "there's only 1 page" : `there are only ${pages} pages`, "error");
      return;
    }
    if (result.action) {
      q.value = "";
      updateGhost();
      if (result.action === "export") awaitExport();
      else if (result.action === "import") awaitImportFile(result.mode);
      else if (result.action === "setting") await changeSetting(result);
      else if (result.action === "settings") {
        clearOutput();
        openSettings();
      }
      else if (result.action === "page") {
        goToPage(result.page - 1);
        showOutput(`page ${result.page} of ${pagesTotal()}`, "ok");
      }
      else {
        clearOutput();
        openEditor(sites.find((s) => s.id === result.id));
      }
      return;
    }
    if (result.error) {
      showOutput(result.error, "error");
      return;
    }
    q.value = "";
    updateGhost();
    if (result.site) showSite(result.site.id);
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

async function exportBackup() {
  const backup = createBackup(await loadData(), settings);
  download(backup.fileName, backup.json);
  return backup.message;
}

async function exportSites() {
  try {
    showOutput(await exportBackup(), "ok");
  } catch (err) {
    showOutput(err.message, "error");
  }
}

function awaitImportFile(mode) {
  awaitClick("drop a backup file on the page, or ", "browse…", async () => {
    const file = await pickFile(".json,application/json");
    if (file) importFile(file, mode);
  });
  pending = { action: "import", mode };
}

/** Imports a backup file; resolves to `{ message }` or `{ error }`. */
async function importBackupFile(file, mode) {
  try {
    const backup = readBackup(await file.text());
    const result = await withSites(async (data) => {
      const result = backup.error ? backup : importSites(data.sites, backup.sites, mode);
      if (result.sites) await saveSites(data, result.sites);
      return result;
    });
    if (!result.error && mode === "replace" && backup.settings) await saveSettings(backup.settings);
    return result;
  } catch (err) {
    return { error: err.message };
  }
}

async function importFile(file, mode) {
  const result = await importBackupFile(file, mode);
  if (result.error) showOutput(result.error, "error");
  else showOutput(result.message, "ok");
}

async function saveSettings(next) {
  settings = next;
  await write(SETTINGS_KEY, settings);
  renderPage();
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

async function changeSetting({ key, value }) {
  if (key === "perpage") await changePerPage(value);
  else await changeIconLookup(value);
}

async function changePerPage(value) {
  if (value !== undefined) await saveSettings({ ...settings, perPage: value });
  const { perPage } = settings;
  const shown = perPage === "auto" ? `auto (${layout.fit} fit)` : String(perPage);
  const capped = perPage !== "auto" && perPage > layout.fit ? `, but only ${layout.fit} fit right now` : "";
  showOutput(`tiles per page: ${shown}${capped}`, "ok");
}

async function changeIconLookup(value) {
  if (!hasPermissionsApi) {
    showOutput("settings only work inside the extension", "error");
    return;
  }
  const on = await duckduckgoOn();
  if (value === undefined) {
    showOutput(`icon lookup is ${on ? "on" : "off"}`, "ok");
  } else if (value === on) {
    showOutput(`icon lookup is already ${on ? "on" : "off"}`, "ok");
  } else if (!value) {
    await chrome.permissions.remove(DUCKDUCKGO);
    showOutput("icon lookup is off", "ok");
  } else {
    awaitPermission();
  }
}

// The permission prompt comes from a click, like the file dialogs, so it isn't refused
// for lack of a user gesture after the command's own awaits
function awaitPermission() {
  awaitClick("tilde needs permission to fetch icons from icons.duckduckgo.com: ", "allow…", async () => {
    try {
      if (!(await chrome.permissions.request(DUCKDUCKGO))) {
        showOutput("permission not given, so icon lookup stays off", "error");
        return;
      }
      showOutput("icon lookup is on", "ok");
      lookUpIcons({ recheckGlobe: true });
    } catch (err) {
      showOutput(err.message, "error");
    }
  });
  pending = { action: "permission" };
}

function pickFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
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
const editorIcon = document.getElementById("editor-icon");
const editorReset = document.getElementById("editor-reset");
let editing = null;
let returnFocus = null;
// undefined leaves the icon as is, null goes back to the looked-up one, a string is a custom image
let newIcon;

/** Opens the panel to edit `site`, or to add a new site when `site` is null. */
function openEditor(site) {
  editing = site;
  newIcon = undefined;
  returnFocus = document.activeElement;
  editorTitle.textContent = site ? `Edit ${site.name}` : "Add a site";
  editorUrl.value = site?.url ?? "";
  editorName.value = site?.name ?? "";
  editorError.textContent = "";
  editorDelete.hidden = !site;
  resetDelete();
  renderEditorIcon();
  editor.showModal();
  (site ? editorName : editorUrl).focus();
}

function renderEditorIcon() {
  const index = Math.max(currentSites.findIndex((s) => s.id === editing?.id), 0);
  let preview = null;
  if (typeof newIcon === "string") preview = { name: editorName.value, ...editing, icon: newIcon };
  else if (editing && newIcon === null) preview = { ...editing, icon: editing.iconSource === "custom" ? null : editing.icon };
  else if (editing) preview = editing;

  if (preview) {
    editorIcon.replaceChildren(siteIcon(preview, index));
  } else {
    const auto = document.createElement("span");
    auto.className = "icon auto";
    auto.textContent = "auto";
    editorIcon.replaceChildren(auto);
  }
  editorReset.disabled = !(typeof newIcon === "string" || (newIcon === undefined && editing?.iconSource === "custom"));
}

document.getElementById("editor-upload").addEventListener("click", async () => {
  const file = await pickFile("image/*");
  if (!file) return;
  try {
    newIcon = await blobToPng(file);
    editorError.textContent = "";
    renderEditorIcon();
  } catch (err) {
    editorError.textContent = err.message;
  }
});

editorReset.addEventListener("click", () => {
  newIcon = null;
  renderEditorIcon();
});

function resetDelete() {
  editorDelete.classList.remove("confirming");
  editorDelete.textContent = "Delete";
}

editorForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const fields = { url: editorUrl.value, name: editorName.value };
    const result = await withSites(async (data) => {
      const result = editing
        ? updateSite(data.sites, editing.id, { ...fields, customIcon: newIcon })
        : addSite(data.sites, { ...fields, icon: newIcon ?? undefined });
      if (result.sites) await saveSites(data, result.sites);
      return result;
    });
    if (result.error) {
      editorError.textContent = result.error;
      return;
    }
    const message = editing ? `saved ${result.site.name}` : `added ${result.site.name} → ${result.site.url}`;
    editor.close();
    showSite(result.site.id);
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
    const { id, name } = editing;
    await withSites((data) => saveSites(data, data.sites.filter((s) => s.id !== id)));
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

const settingsPanel = document.getElementById("settings");
const settingsForm = document.getElementById("settings-form");
const perPageAuto = document.getElementById("perpage-auto");
const perPageFixed = document.getElementById("perpage-fixed");
const perPageNumber = document.getElementById("perpage-number");
const perPageFit = document.getElementById("perpage-fit");
const perPageNote = document.getElementById("perpage-note");
const iconLookupSwitch = document.getElementById("icon-lookup");
const settingsImport = document.getElementById("settings-import");
const settingsStatus = document.getElementById("settings-status");
let settingsReturnFocus = null;
let lookupWasOn = false;

function panelOpen() {
  return editor.open || settingsPanel.open;
}

async function openSettings() {
  settingsReturnFocus = document.activeElement;
  const auto = settings.perPage === "auto";
  perPageAuto.checked = auto;
  perPageFixed.checked = !auto;
  perPageNumber.value = auto ? "" : String(settings.perPage);
  perPageNumber.placeholder = String(layout.fit);
  lookupWasOn = await duckduckgoOn();
  iconLookupSwitch.checked = lookupWasOn;
  iconLookupSwitch.disabled = !hasPermissionsApi;
  showSettingsStatus("", "ok");
  resetReplace();
  updatePerPageHints();
  settingsPanel.showModal();
}

function showSettingsStatus(text, kind) {
  settingsStatus.textContent = text;
  settingsStatus.dataset.kind = kind;
}

function updatePerPageHints() {
  perPageFit.textContent = `(${layout.fit} fit right now)`;
  const n = Number(perPageNumber.value);
  perPageNote.textContent = perPageFixed.checked && n > layout.fit
    ? `Only ${layout.fit} fit right now, so you'll see ${layout.fit} until the window is bigger.`
    : "";
}

perPageNumber.addEventListener("input", () => {
  perPageFixed.checked = true;
  updatePerPageHints();
});
for (const radio of [perPageAuto, perPageFixed]) radio.addEventListener("change", updatePerPageHints);

settingsForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  let perPage = "auto";
  if (perPageFixed.checked) {
    perPage = Number(perPageNumber.value);
    if (!Number.isInteger(perPage) || perPage < 1) {
      showSettingsStatus("Tiles per page has to be a whole number from 1", "error");
      return;
    }
  }
  // Brave only shows its permission prompt in answer to a click, so ask before awaiting anything
  const wantLookup = iconLookupSwitch.checked;
  let lookupChange = Promise.resolve(wantLookup);
  if (hasPermissionsApi && wantLookup !== lookupWasOn) {
    lookupChange = wantLookup ? chrome.permissions.request(DUCKDUCKGO) : chrome.permissions.remove(DUCKDUCKGO).then(() => false);
  }
  try {
    const lookupOn = await lookupChange;
    await saveSettings({ ...settings, perPage });
    if (wantLookup && !lookupOn) {
      iconLookupSwitch.checked = false;
      lookupWasOn = false;
      showSettingsStatus("Permission not given, so icon lookup stays off. The rest was saved.", "error");
      return;
    }
    if (lookupOn && !lookupWasOn) lookUpIcons({ recheckGlobe: true });
    settingsPanel.close();
    showOutput("settings saved", "ok");
  } catch (err) {
    showSettingsStatus(err.message, "error");
  }
});

document.getElementById("settings-export").addEventListener("click", async () => {
  try {
    showSettingsStatus(capitalize(await exportBackup()), "ok");
  } catch (err) {
    showSettingsStatus(capitalize(err.message), "error");
  }
});

function importMode() {
  return settingsForm.elements["import-mode"].value;
}

function resetReplace() {
  settingsImport.classList.remove("confirming");
  settingsImport.textContent = "Import…";
}

settingsImport.addEventListener("click", async () => {
  if (importMode() === "replace" && !settingsImport.classList.contains("confirming")) {
    settingsImport.classList.add("confirming");
    settingsImport.textContent = "Really replace?";
    return;
  }
  resetReplace();
  const file = await pickFile(".json,application/json");
  if (!file) return;
  const result = await importBackupFile(file, importMode());
  if (result.error) showSettingsStatus(capitalize(result.error), "error");
  else showSettingsStatus(capitalize(result.message), "ok");
});

settingsImport.addEventListener("blur", resetReplace);
for (const radio of settingsForm.elements["import-mode"]) radio.addEventListener("change", resetReplace);

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

document.getElementById("settings-open").addEventListener("click", openSettings);
document.getElementById("settings-cancel").addEventListener("click", () => settingsPanel.close());

settingsPanel.addEventListener("click", (e) => {
  if (e.target === settingsPanel) settingsPanel.close();
});

settingsPanel.addEventListener("close", () => {
  (settingsReturnFocus?.isConnected ? settingsReturnFocus : q).focus();
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
  if (panelOpen()) return;
  const digit = /^Digit([1-9])$/.exec(e.code);
  const inTextField = document.activeElement?.matches("input, textarea, [contenteditable]");
  if (digit && !e.ctrlKey && !e.metaKey && !e.shiftKey && (e.altKey || !inTextField)) {
    e.preventDefault();
    goToPage(Number(digit[1]) - 1);
    return;
  }
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
