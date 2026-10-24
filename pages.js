/**
 * How many tiles fit in a `width` × `height` area: the most columns of at least
 * `minTileWidth` and rows of `tileHeight`, with `gap` between them. Always at least 1 × 1.
 */
export function fitGrid({ width, height, minTileWidth, tileHeight, gap }) {
  const cols = Math.max(1, Math.floor((width + gap) / (minTileWidth + gap)));
  const rows = Math.max(1, Math.floor((height + gap) / (tileHeight + gap)));
  return { cols, rows };
}

/** Tiles per page: the `perPage` setting (`"auto"` or a number), never more than `fit`. */
export function tilesPerPage(perPage, fit) {
  return perPage === "auto" ? fit : Math.min(perPage, fit);
}

/**
 * The grid for `count` tiles with at most `maxCols` per row, using as few columns as
 * keep the rows balanced: 10 tiles at 8 per row are 5 × 2, not 8 + 2.
 */
export function balancedShape(count, maxCols) {
  if (count <= 0) return { cols: 1, rows: 0 };
  const rows = Math.ceil(count / maxCols);
  return { cols: Math.ceil(count / rows), rows };
}

/** How many pages `count` tiles take at `perPage` each; there's always at least one. */
export function pageCount(count, perPage) {
  return Math.max(1, Math.ceil(count / perPage));
}

/** The page (0-based) the tile at `index` is on. */
export function pageOf(index, perPage) {
  return Math.floor(index / perPage);
}

/**
 * Where a site goes when dropped on `page` (0-based) so it ends up last on that page:
 * an index for `moveSite`, clamped to the `siteCount` sites.
 */
export function endOfPage(page, perPage, siteCount) {
  return Math.min((page + 1) * perPage - 1, siteCount - 1);
}

/**
 * Which way a tile dragged to `x` should flip the page: -1 past the left edge of the
 * tiles (`left`), 1 past the right edge (`right`), else 0. Each side zone is at least
 * `minWidth` wide at the edges of a window `windowWidth` wide.
 */
export function flipDirection(x, { left, right, windowWidth, minWidth }) {
  if (x < Math.max(left, minWidth)) return -1;
  if (x > Math.min(right, windowWidth - minWidth)) return 1;
  return 0;
}

/**
 * The page (0-based) a key press switches to, or null if it isn't a page shortcut.
 * Digits 1–9 work on their own outside text fields, and anywhere with Ctrl on macOS
 * (where Option+digit types characters) or Alt elsewhere (where Ctrl+digit switches
 * tabs). Shift, Cmd, and the other system's modifier are left to the browser.
 */
export function pageForKey({ code, altKey, ctrlKey, metaKey, shiftKey }, { isMac, inTextField }) {
  const digit = /^Digit([1-9])$/.exec(code);
  if (!digit || shiftKey || metaKey) return null;
  const [modifier, other] = isMac ? [ctrlKey, altKey] : [altKey, ctrlKey];
  if (other || (!modifier && inTextField)) return null;
  return Number(digit[1]) - 1;
}
