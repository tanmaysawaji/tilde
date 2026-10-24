import { test } from "node:test";
import assert from "node:assert/strict";
import { HISTORY_LIMIT, addToHistory, browseHistory } from "../history.js";

test("addToHistory appends trimmed commands", () => {
  assert.deepEqual(addToHistory(["/add a.com"], "  /rm a "), ["/add a.com", "/rm a"]);
});

test("addToHistory skips blanks and a repeat of the latest command", () => {
  const history = ["/rm a", "/add a.com"];
  assert.equal(addToHistory(history, "   "), history);
  assert.equal(addToHistory(history, "/add a.com"), history);
  assert.deepEqual(addToHistory(history, "/rm a"), ["/rm a", "/add a.com", "/rm a"]);
});

test("addToHistory keeps only the newest entries", () => {
  const full = Array.from({ length: HISTORY_LIMIT }, (_, i) => `/cmd ${i}`);
  const result = addToHistory(full, "/newest");
  assert.equal(result.length, HISTORY_LIMIT);
  assert.equal(result[0], "/cmd 1");
  assert.equal(result.at(-1), "/newest");
  assert.deepEqual(addToHistory(["/a", "/b"], "/c", 2), ["/b", "/c"]);
});

test("browseHistory steps back and forward, restoring the draft", () => {
  const history = ["/first", "/second"];
  const up1 = browseHistory(history, null, -1, "dra");
  assert.equal(up1.text, "/second");
  const up2 = browseHistory(history, up1.state, -1, up1.text);
  assert.equal(up2.text, "/first");
  assert.equal(browseHistory(history, up2.state, -1, up2.text), null);

  const down1 = browseHistory(history, up2.state, 1, up2.text);
  assert.equal(down1.text, "/second");
  const down2 = browseHistory(history, down1.state, 1, down1.text);
  assert.deepEqual(down2, { state: null, text: "dra" });
});

test("browseHistory has nowhere to go when empty or not browsing", () => {
  assert.equal(browseHistory([], null, -1, ""), null);
  assert.equal(browseHistory(["/a"], null, 1, "x"), null);
});
