import { test } from "node:test";
import assert from "node:assert/strict";
import { complete, parseCommand, runCommand } from "../commands.js";

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

test("/help lists every command in aligned columns", () => {
  const { info } = runCommand([], parseCommand("/help"));
  assert.equal(info, [
    "/add <url> [name]  save a site, optionally as [name]",
    "/rm <name>         remove a site",
    "/help              list the commands",
  ].join("\n"));
});

const sites = [
  { id: "1", name: "Github", url: "https://github.com/", icon: null },
  { id: "2", name: "Gmail", url: "https://mail.google.com/", icon: null },
  { id: "3", name: "Prime Video", url: "https://www.primevideo.com/", icon: null },
];

test("complete finishes command names, adding a space when args follow", () => {
  assert.equal(complete("/", sites), "/add ");
  assert.equal(complete("/a", sites), "/add ");
  assert.equal(complete("/R", sites), "/rm ");
  assert.equal(complete("/he", sites), "/help");
  assert.equal(complete("/add", sites), null);
  assert.equal(complete("/x", sites), null);
});

test("complete finishes site names for commands that take one", () => {
  assert.equal(complete("/rm g", sites), "/rm Github");
  assert.equal(complete("/rm gm", sites), "/rm Gmail");
  assert.equal(complete("/rm prime v", sites), "/rm Prime Video");
  assert.equal(complete("/RM  git", sites), "/RM  Github");
});

test("complete suggests nothing it shouldn't", () => {
  assert.equal(complete("github", sites), null);
  assert.equal(complete(" /rm g", sites), null);
  assert.equal(complete("/rm ", sites), null);
  assert.equal(complete("/rm github", sites), null);
  assert.equal(complete("/rm z", sites), null);
  assert.equal(complete("/add g", sites), null);
  assert.equal(complete("/constructor x", sites), null);
});
