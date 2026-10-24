import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, readSettings } from "../settings.js";

test("readSettings fills in defaults", () => {
  assert.deepEqual(readSettings(undefined), DEFAULT_SETTINGS);
  assert.deepEqual(readSettings({}), DEFAULT_SETTINGS);
});

test("readSettings keeps valid values and drops the rest", () => {
  assert.deepEqual(readSettings({ perPage: 12, extra: true }), { perPage: 12 });
  assert.deepEqual(readSettings({ perPage: "auto" }), { perPage: "auto" });
  for (const perPage of [0, -3, 2.5, "12", null]) {
    assert.deepEqual(readSettings({ perPage }), DEFAULT_SETTINGS, String(perPage));
  }
});
