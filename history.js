export const HISTORY_LIMIT = 100;

/**
 * Adds a command to the history, oldest first. Repeating the most recent command
 * doesn't add it again, and only the newest `limit` entries are kept. Returns the
 * new list, or the same one if nothing changed.
 */
export function addToHistory(history, command, limit = HISTORY_LIMIT) {
  const entry = command.trim();
  if (!entry || history.at(-1) === entry) return history;
  return [...history, entry].slice(-limit);
}

/**
 * Steps through the history like a shell's `↑` (`direction` -1) and `↓` (+1).
 * `state` is null when not browsing, or the `state` from the previous step. The first
 * step keeps `currentText` as a draft, which comes back when stepping past the newest
 * entry. Returns `{ state, text }`, or null when there's nowhere further to go.
 */
export function browseHistory(history, state, direction, currentText) {
  const { position, draft } = state ?? { position: history.length, draft: currentText };
  const next = position + direction;
  if (next < 0 || next > history.length) return null;
  if (next === history.length) return { state: null, text: draft };
  return { state: { position: next, draft }, text: history[next] };
}
