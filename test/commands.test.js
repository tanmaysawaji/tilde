import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCommand, runCommand } from "../commands.js";

test("parseCommand ignores text without a leading slash", () => {
  assert.equal(parseCommand("add milk to cart"), null);
  assert.equal(parseCommand("github.com"), null);
});

test("parseCommand splits the name from the arguments", () => {
  assert.deepEqual(parseCommand("  /ADD github.com  My Code "), { name: "add", args: "github.com  My Code" });
  assert.deepEqual(parseCommand("/rm"), { name: "rm", args: "" });
  assert.deepEqual(parseCommand("/"), { name: "", args: "" });
});

test("/add saves a site and names it", () => {
  const result = runCommand([], parseCommand("/add github.com My  Code"));
  assert.equal(result.sites.length, 1);
  assert.equal(result.sites[0].name, "My Code");
  assert.equal(result.message, "added My Code → https://github.com/");
});

test("/add passes errors through", () => {
  assert.equal(runCommand([], parseCommand("/add")).error, "usage: /add <url> [name]");
  assert.match(runCommand([], parseCommand("/add nope")).error, /not a web address/);
});

test("/rm removes a site by name", () => {
  const { sites } = runCommand([], parseCommand("/add github.com"));
  const result = runCommand(sites, parseCommand("/rm github"));
  assert.deepEqual(result.sites, []);
  assert.equal(result.message, "removed Github");
  assert.equal(runCommand([], parseCommand("/rm")).error, "usage: /rm <name>");
});

test("unknown commands are reported, including inherited object keys", () => {
  assert.equal(runCommand([], parseCommand("/foo")).error, "unknown command: /foo");
  assert.equal(runCommand([], parseCommand("/constructor")).error, "unknown command: /constructor");
});
