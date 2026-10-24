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
    "/add <url> [name]            save a site, optionally as [name]",
    "/rm <name>                   remove a site",
    "/edit <name>                 edit a site's name or URL",
    "/export                      download your sites as a backup file",
    "/import [--merge|--replace]  load sites from a backup file (merges by default)",
    "/help                        list the commands",
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
  assert.equal(complete("/e", sites), "/edit ");
  assert.equal(complete("/ex", sites), "/export");
  assert.equal(complete("/i", sites), "/import ");
  assert.equal(complete("/add", sites), null);
  assert.equal(complete("/x", sites), null);
});

test("complete finishes site names for commands that take one", () => {
  assert.equal(complete("/rm g", sites), "/rm Github");
  assert.equal(complete("/rm gm", sites), "/rm Gmail");
  assert.equal(complete("/rm prime v", sites), "/rm Prime Video");
  assert.equal(complete("/edit gm", sites), "/edit Gmail");
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

test("/export asks the page to download a backup", () => {
  assert.deepEqual(runCommand([], parseCommand("/export")), { action: "export" });
  assert.equal(runCommand([], parseCommand("/export now")).error, "usage: /export");
});

test("/import merges by default and takes --merge or --replace", () => {
  assert.deepEqual(runCommand([], parseCommand("/import")), { action: "import", mode: "merge" });
  assert.deepEqual(runCommand([], parseCommand("/import --merge")), { action: "import", mode: "merge" });
  assert.deepEqual(runCommand([], parseCommand("/import  --replace ")), { action: "import", mode: "replace" });
});

test("/import refuses bad options", () => {
  assert.equal(runCommand([], parseCommand("/import --force")).error, "unknown option: --force");
  assert.equal(runCommand([], parseCommand("/import replace")).error, "usage: /import [--merge|--replace]");
  assert.equal(runCommand([], parseCommand("/import --merge --replace")).error, "use --merge or --replace, not both");
});

test("/edit asks the page to open the panel for that site", () => {
  const { sites } = runCommand([], parseCommand("/add github.com"));
  assert.deepEqual(runCommand(sites, parseCommand("/edit GITHUB")), { action: "edit", id: sites[0].id });
  assert.equal(runCommand(sites, parseCommand("/edit nope")).error, "no site named nope");
  assert.equal(runCommand(sites, parseCommand("/edit")).error, "usage: /edit <name>");
});
