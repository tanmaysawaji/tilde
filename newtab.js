"use strict";

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

// Shortcuts
const sites = document.getElementById("sites");
(typeof LINKS !== "undefined" ? LINKS : []).forEach((link, i) => {
  const a = document.createElement("a");
  a.className = "site";
  a.href = link.url;

  const icon = document.createElement("span");
  icon.className = "icon";

  const src = link.icon
    ? link.icon
    : hasExtensionApi
      ? chrome.runtime.getURL("/_favicon/?pageUrl=" + encodeURIComponent(link.url) + "&size=64")
      : null;

  if (src) {
    const img = document.createElement("img");
    img.src = src;
    img.alt = "";
    img.onerror = () => img.replaceWith(letterFor(link.name, i));
    icon.append(img);
  } else {
    icon.append(letterFor(link.name, i));
  }

  const name = document.createElement("span");
  name.className = "name";
  name.textContent = link.name;

  a.append(icon, name);
  sites.append(a);
});

function letterFor(name, i) {
  const s = document.createElement("span");
  s.className = "letter";
  s.textContent = name.trim().charAt(0).toUpperCase();
  s.style.color = LETTER_COLORS[i % LETTER_COLORS.length];
  return s;
}

// Search: URLs open directly, everything else goes to your default search engine
const form = document.getElementById("search");
const q = document.getElementById("q");

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = q.value.trim();
  if (!text) return;

  const url = toUrl(text);
  if (url) {
    location.href = url;
  } else if (typeof chrome !== "undefined" && chrome.search && chrome.search.query) {
    chrome.search.query({ text, disposition: "CURRENT_TAB" });
  } else {
    location.href = "https://search.brave.com/search?q=" + encodeURIComponent(text);
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
  }
});
