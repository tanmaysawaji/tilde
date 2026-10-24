import { migrate } from "./sites.js";
import { parseCommand, runCommand } from "./commands.js";

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

const STORAGE_KEY = "tilde";
const storage = hasExtensionApi && chrome.storage ? chrome.storage.local : null;
// Outside the extension there's no chrome.storage, so changes last until the tab closes
let unsavedData = null;

async function loadData() {
  const stored = storage ? (await storage.get(STORAGE_KEY))[STORAGE_KEY] : unsavedData;
  const { data, changed } = migrate(stored, typeof LINKS !== "undefined" ? LINKS : []);
  if (changed) await saveData(data);
  return data;
}

async function saveData(data) {
  if (storage) await storage.set({ [STORAGE_KEY]: data });
  else unsavedData = data;
}

const sitesEl = document.getElementById("sites");

function renderSites(sites) {
  sitesEl.replaceChildren(...sites.map(siteTile));
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

// Keeps other open tabs in step when one of them changes the sites
storage?.onChanged.addListener((changes) => {
  const data = changes[STORAGE_KEY]?.newValue;
  if (data) renderSites(data.sites);
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
    runPromptCommand(command);
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

async function runPromptCommand(command) {
  try {
    // Read fresh rather than reuse what's rendered, in case another tab changed the sites
    const data = await loadData();
    const result = runCommand(data.sites, command);
    if (result.error) {
      showOutput(result.error, "error");
      return;
    }
    await saveData({ ...data, sites: result.sites });
    renderSites(result.sites);
    q.value = "";
    showOutput(result.message, "ok");
  } catch (err) {
    showOutput(err.message, "error");
  }
}

q.addEventListener("input", clearOutput);

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
    clearOutput();
  }
});
