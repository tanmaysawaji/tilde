import { addSite, findSiteByName, moveSite, removeSite } from "./sites.js";

/**
 * Splits prompt text into a command. Returns null unless the text starts with `/`;
 * otherwise `{ name, args }`, with `name` lowercased and `args` the trimmed rest.
 */
export function parseCommand(text) {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) return null;
  const [, name, args = ""] = trimmed.match(/^\/(\S*)\s*(.*)$/s);
  return { name: name.toLowerCase(), args: args.trim() };
}

// Listed in the order /help shows them and autocomplete prefers them. A command's
// `suggest(previous)` lists the words autocomplete may offer after the `previous` ones.
const COMMANDS = {
  add: {
    usage: "/add <url> [name]",
    summary: "save a site, optionally as [name]",
    run(sites, args) {
      if (!args) return { error: `usage: ${this.usage}` };
      const [url, ...nameWords] = args.split(/\s+/);
      const result = addSite(sites, { url, name: nameWords.join(" ") });
      if (result.error) return result;
      return { sites: result.sites, site: result.site, message: `added ${result.site.name} → ${result.site.url}` };
    },
  },

  rm: {
    usage: "/rm <name>",
    summary: "remove a site",
    takesSiteName: true,
    run(sites, args) {
      if (!args) return { error: `usage: ${this.usage}` };
      const result = removeSite(sites, args);
      if (result.error) return result;
      return { sites: result.sites, message: `removed ${result.site.name}` };
    },
  },

  mv: {
    usage: "/mv <name> <position>",
    summary: "move a site to a position (1 is first)",
    takesSiteName: true,
    run(sites, args) {
      const match = args.match(/^(.+?)\s+(\S+)$/s);
      if (!match) return { error: `usage: ${this.usage}` };
      const [, name, positionText] = match;
      if (!/^\d+$/.test(positionText) || Number(positionText) < 1) {
        return { error: `not a position: ${positionText} (1 is first)` };
      }
      const site = findSiteByName(sites, name);
      if (!site) return { error: `no site named ${name}` };
      const moved = moveSite(sites, site.id, Number(positionText) - 1);
      return { sites: moved, site, message: `moved ${site.name} to ${moved.indexOf(site) + 1}` };
    },
  },

  edit: {
    usage: "/edit <name>",
    summary: "edit a site's name or URL",
    takesSiteName: true,
    run(sites, args) {
      if (!args) return { error: `usage: ${this.usage}` };
      const site = findSiteByName(sites, args);
      if (!site) return { error: `no site named ${args}` };
      return { action: "edit", id: site.id };
    },
  },

  page: {
    usage: "/page <n>",
    summary: "switch to a page",
    run(sites, args) {
      if (!/^\d+$/.test(args) || Number(args) < 1) return { error: `usage: ${this.usage}` };
      return { action: "page", page: Number(args) };
    },
  },

  set: {
    usage: "/set <setting> [value]",
    summary: "change a setting: icon-lookup on|off, perpage <n>|auto",
    suggest(previous) {
      if (previous.length === 0) return Object.keys(SETTINGS);
      return previous.length === 1 ? SETTINGS[previous[0]]?.words ?? [] : [];
    },
    run(sites, args) {
      const [key, value, ...extra] = args.toLowerCase().split(/\s+/).filter(Boolean);
      if (!key) return { error: `usage: ${this.usage}` };
      if (!Object.hasOwn(SETTINGS, key)) return { error: `unknown setting: ${key}` };
      const setting = SETTINGS[key];
      if (extra.length) return { error: `usage: ${setting.usage}` };
      if (value === undefined) return { action: "setting", key };
      const parsed = setting.parse(value);
      if (parsed === undefined) return { error: `usage: ${setting.usage}` };
      return { action: "setting", key, value: parsed };
    },
  },

  export: {
    usage: "/export",
    summary: "download your sites as a backup file",
    run(sites, args) {
      if (args) return { error: `usage: ${this.usage}` };
      return { action: "export" };
    },
  },

  import: {
    usage: "/import [--merge|--replace]",
    summary: "load sites from a backup file (merges by default)",
    suggest(previous) {
      return previous.some((w) => w.startsWith("--")) ? [] : ["--merge", "--replace"];
    },
    run(sites, args) {
      const parsed = parseOptions(args, ["merge", "replace"], this.usage);
      if (parsed.error) return parsed;
      if (parsed.options.has("merge") && parsed.options.has("replace")) {
        return { error: "use --merge or --replace, not both" };
      }
      return { action: "import", mode: parsed.options.has("replace") ? "replace" : "merge" };
    },
  },

  help: {
    usage: "/help",
    summary: "list the commands",
    run() {
      const width = Math.max(...Object.values(COMMANDS).map((c) => c.usage.length));
      const lines = Object.values(COMMANDS).map((c) => `${c.usage.padEnd(width)}  ${c.summary}`);
      return { info: lines.join("\n") };
    },
  },
};

// Each setting's `parse` turns the typed value into the stored one, or undefined if invalid
const SETTINGS = {
  "icon-lookup": {
    usage: "/set icon-lookup [on|off]",
    words: ["on", "off"],
    parse: (value) => (value === "on" ? true : value === "off" ? false : undefined),
  },
  perpage: {
    usage: "/set perpage [<n>|auto]",
    words: ["auto"],
    parse: (value) => (value === "auto" ? "auto" : /^\d+$/.test(value) && Number(value) >= 1 ? Number(value) : undefined),
  },
};

function parseOptions(args, allowed, usage) {
  const options = new Set();
  for (const word of args.split(/\s+/).filter(Boolean)) {
    if (!word.startsWith("--")) return { error: `usage: ${usage}` };
    if (!allowed.includes(word.slice(2))) return { error: `unknown option: ${word}` };
    options.add(word.slice(2));
  }
  return { options };
}

function findCommand(name) {
  return Object.hasOwn(COMMANDS, name) ? COMMANDS[name] : null;
}

/**
 * Runs a parsed command against the saved sites. Returns one of:
 * `{ sites, message }` when the sites changed (with the `site` added or moved, if any), `{ info }` for output that changes
 * nothing (like /help), `{ action }` for work the page has to do itself (`"export"`,
 * `"import"` with a `mode` of `"merge"` or `"replace"`, `"edit"` with the site's
 * `id`, `"page"` with its 1-based `page`, or `"setting"` with a `key` and, to change
 * it, a `value`), or `{ error }`.
 */
export function runCommand(sites, { name, args }) {
  const command = findCommand(name);
  if (!command) return { error: `unknown command: /${name}` };
  return command.run(sites, args);
}

/**
 * Suggests a completion for what's typed in the prompt: a command name (`/a` → `/add `),
 * a site name for commands that take one (`/rm gi` → `/rm Github`), or a word the
 * command accepts (`/import --r` → `/import --replace`). Returns the full completed
 * text, which always extends `text` apart from letter case, or null.
 */
export function complete(text, sites) {
  const match = text.match(/^\/(\S*)(\s+(.*))?$/s);
  if (!match) return null;
  const [, typedName, afterName, arg] = match;
  const name = typedName.toLowerCase();

  if (afterName === undefined) {
    const found = Object.keys(COMMANDS).find((c) => c.startsWith(name) && c !== name);
    if (!found) return null;
    const takesArgs = COMMANDS[found].usage.includes(" ");
    return "/" + found + (takesArgs ? " " : "");
  }

  const command = findCommand(name);
  if (!arg || !command) return null;
  if (command.takesSiteName) {
    const wanted = arg.toLowerCase();
    const site = sites.find((s) => s.name.length > arg.length && s.name.toLowerCase().startsWith(wanted));
    return site ? text.slice(0, text.length - arg.length) + site.name : null;
  }
  if (!command.suggest) return null;

  const words = arg.split(/\s+/);
  const last = words.pop();
  if (!last) return null;
  const typed = last.toLowerCase();
  const found = command.suggest(words.map((w) => w.toLowerCase())).find((w) => w.startsWith(typed) && w !== typed);
  return found ? text.slice(0, text.length - last.length) + found : null;
}
