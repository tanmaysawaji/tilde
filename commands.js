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

const COMMANDS = {
  add(sites, args) {
    if (!args) return { error: "usage: /add <url> [name]" };
    const [url, ...nameWords] = args.split(/\s+/);
    const result = addSite(sites, { url, name: nameWords.join(" ") });
    if (result.error) return result;
    return { sites: result.sites, message: `added ${result.site.name} → ${result.site.url}` };
  },

  rm(sites, args) {
    if (!args) return { error: "usage: /rm <name>" };
    const result = removeSite(sites, args);
    if (result.error) return result;
    return { sites: result.sites, message: `removed ${result.site.name}` };
  },
};

/**
 * Runs a parsed command against the saved sites.
 * Returns `{ sites, message }` when the sites changed, or `{ error }`.
 */
export function runCommand(sites, { name, args }) {
  const command = Object.hasOwn(COMMANDS, name) ? COMMANDS[name] : null;
  if (!command) return { error: `unknown command: /${name}` };
  return command(sites, args);
}
