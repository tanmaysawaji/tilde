import { test } from "node:test";
import assert from "node:assert/strict";
import { balancedShape, endOfPage, fitGrid, flipDirection, pageCount, pageForKey, pageOf, tilesPerPage } from "../pages.js";
import { moveSite } from "../sites.js";

test("fitGrid counts the columns and rows that fit", () => {
  const grid = { width: 1000, height: 450, minTileWidth: 112, tileHeight: 140, gap: 10 };
  assert.deepEqual(fitGrid(grid), { cols: 8, rows: 3 });
  assert.deepEqual(fitGrid({ ...grid, width: 112, height: 140 }), { cols: 1, rows: 1 });
});

test("fitGrid never goes below one tile", () => {
  assert.deepEqual(fitGrid({ width: 50, height: -20, minTileWidth: 112, tileHeight: 140, gap: 10 }), { cols: 1, rows: 1 });
});

test("tilesPerPage caps the setting at what fits", () => {
  assert.equal(tilesPerPage("auto", 24), 24);
  assert.equal(tilesPerPage(12, 24), 12);
  assert.equal(tilesPerPage(40, 24), 24);
});

test("balancedShape balances the rows", () => {
  assert.deepEqual(balancedShape(10, 8), { cols: 5, rows: 2 });
  assert.deepEqual(balancedShape(8, 8), { cols: 8, rows: 1 });
  assert.deepEqual(balancedShape(9, 8), { cols: 5, rows: 2 });
  assert.deepEqual(balancedShape(17, 8), { cols: 6, rows: 3 });
  assert.deepEqual(balancedShape(3, 8), { cols: 3, rows: 1 });
  assert.deepEqual(balancedShape(0, 8), { cols: 1, rows: 0 });
});

test("pageCount and pageOf split tiles into pages", () => {
  assert.equal(pageCount(0, 10), 1);
  assert.equal(pageCount(10, 10), 1);
  assert.equal(pageCount(11, 10), 2);
  assert.equal(pageOf(9, 10), 0);
  assert.equal(pageOf(10, 10), 1);
});

const sites = "abcdefghij".split("").map((id) => ({ id, name: id, url: `https://${id}.com/` }));
const order = (list) => list.map((s) => s.id).join("");

test("endOfPage puts a dropped site last on that page", () => {
  assert.equal(order(moveSite(sites, "a", endOfPage(1, 4, sites.length))), "bcdefghaij");
  assert.equal(order(moveSite(sites, "j", endOfPage(0, 4, sites.length))), "abcjdefghi");
});

test("endOfPage on the last page means the end of the list", () => {
  assert.equal(endOfPage(2, 4, sites.length), 9);
  assert.equal(order(moveSite(sites, "a", endOfPage(2, 4, sites.length))), "bcdefghija");
});

test("flipDirection flips past either side of the tiles", () => {
  const edges = { left: 300, right: 1300, windowWidth: 1600, minWidth: 48 };
  assert.equal(flipDirection(299, edges), -1);
  assert.equal(flipDirection(300, edges), 0);
  assert.equal(flipDirection(800, edges), 0);
  assert.equal(flipDirection(1300, edges), 0);
  assert.equal(flipDirection(1301, edges), 1);
});

test("flipDirection keeps a zone at the window edges when the tiles reach them", () => {
  const edges = { left: 10, right: 1590, windowWidth: 1600, minWidth: 48 };
  assert.equal(flipDirection(40, edges), -1);
  assert.equal(flipDirection(48, edges), 0);
  assert.equal(flipDirection(1553, edges), 1);
  assert.equal(flipDirection(1552, edges), 0);
});

const key = (code, mods = {}) => ({ code, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...mods });
const windows = (inTextField) => ({ isMac: false, inTextField });
const mac = (inTextField) => ({ isMac: true, inTextField });

test("pageForKey uses Alt+digit anywhere outside macOS, and leaves Ctrl+digit to the browser", () => {
  assert.equal(pageForKey(key("Digit3", { altKey: true }), windows(true)), 2);
  assert.equal(pageForKey(key("Digit3", { ctrlKey: true }), windows(false)), null);
  assert.equal(pageForKey(key("Digit3", { ctrlKey: true, altKey: true }), windows(false)), null);
});

test("pageForKey uses Ctrl+digit anywhere on macOS, and leaves Option and Cmd alone", () => {
  assert.equal(pageForKey(key("Digit3", { ctrlKey: true }), mac(true)), 2);
  assert.equal(pageForKey(key("Digit3", { altKey: true }), mac(true)), null);
  assert.equal(pageForKey(key("Digit3", { altKey: true }), mac(false)), null);
  assert.equal(pageForKey(key("Digit3", { metaKey: true }), mac(false)), null);
});

test("pageForKey takes plain digits only outside text fields", () => {
  for (const system of [windows, mac]) {
    assert.equal(pageForKey(key("Digit1"), system(false)), 0);
    assert.equal(pageForKey(key("Digit9"), system(false)), 8);
    assert.equal(pageForKey(key("Digit1"), system(true)), null);
  }
});

test("pageForKey ignores other keys, 0, and Shift", () => {
  assert.equal(pageForKey(key("Digit0"), windows(false)), null);
  assert.equal(pageForKey(key("KeyA"), windows(false)), null);
  assert.equal(pageForKey(key("Numpad1"), windows(false)), null);
  assert.equal(pageForKey(key("Digit1", { shiftKey: true }), windows(false)), null);
});
