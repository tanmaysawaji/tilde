import { migrate } from "./sites.js";
import { complete, parseCommand, runCommand } from "./commands.js";
import { addToHistory, browseHistory } from "./history.js";

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
  sitesEl.replaceChildren(...sites.map(siteTile));
  updateGhost();
}

function siteTile(site, i) {
  const a = document.createElement("a");
  a.className = "site";
  a.href = site.url;

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

  const name = document.createElement("span");
  name.className = "name";
  name.textContent = site.name;

  a.append(icon, name);
  return a;
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
  if (e.key === "/" && document.activeElement !== q) {
    e.preventDefault();
    q.focus();
  } else if (e.key === "Escape" && document.activeElement === q) {
    q.value = "";
    historyState = null;
    clearOutput();
    updateGhost();
  }
});
