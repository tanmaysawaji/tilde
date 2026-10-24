import { addSite, removeSite } from "./sites.js";

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

// Listed in the order /help shows them and autocomplete prefers them
const COMMANDS = {
  add: {
    usage: "/add <url> [name]",
    summary: "save a site, optionally as [name]",
    run(sites, args) {
      if (!args) return { error: `usage: ${this.usage}` };
      const [url, ...nameWords] = args.split(/\s+/);
      const result = addSite(sites, { url, name: nameWords.join(" ") });
      if (result.error) return result;
      return { sites: result.sites, message: `added ${result.site.name} → ${result.site.url}` };
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

function findCommand(name) {
  return Object.hasOwn(COMMANDS, name) ? COMMANDS[name] : null;
}

/**
 * Runs a parsed command against the saved sites. Returns one of:
 * `{ sites, message }` when the sites changed, `{ info }` for output that changes
 * nothing (like /help), or `{ error }`.
 */
export function runCommand(sites, { name, args }) {
  const command = findCommand(name);
  if (!command) return { error: `unknown command: /${name}` };
  return command.run(sites, args);
}

/**
 * Suggests a completion for what's typed in the prompt: a command name (`/a` → `/add `)
 * or, for commands that take one, a site name (`/rm gi` → `/rm Github`). Returns the
 * full completed text, which always extends `text` apart from letter case, or null.
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

  if (!arg || !findCommand(name)?.takesSiteName) return null;
  const wanted = arg.toLowerCase();
  const site = sites.find((s) => s.name.length > arg.length && s.name.toLowerCase().startsWith(wanted));
  return site ? text.slice(0, text.length - arg.length) + site.name : null;
}
