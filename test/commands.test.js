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
    "/mv <name> <position>        move a site to a position (1 is first)",
    "/edit <name>                 edit a site's name or URL",
    "/set icon-lookup [on|off]    look up missing icons on DuckDuckGo (off by default)",
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
  assert.equal(complete("/m", sites), "/mv ");
  assert.equal(complete("/s", sites), "/set ");
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
  assert.equal(complete("/mv pr", sites), "/mv Prime Video");
  assert.equal(complete("/mv github 3", sites), null);
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

const fourSites = () => {
  let sites = [];
  for (const url of ["github.com", "mail.google.com", "primevideo.com"]) {
    sites = runCommand(sites, parseCommand(`/add ${url}`)).sites;
  }
  return runCommand(sites, parseCommand("/add walmart.com Prime Video Deals")).sites;
};

test("/mv moves a site, with multi-word names and 1 as first", () => {
  const result = runCommand(fourSites(), parseCommand("/mv prime video deals 1"));
  assert.deepEqual(result.sites.map((s) => s.name), ["Prime Video Deals", "Github", "Google", "Primevideo"]);
  assert.equal(result.message, "moved Prime Video Deals to 1");
});

test("/mv past the end moves to the end", () => {
  const result = runCommand(fourSites(), parseCommand("/mv github 99"));
  assert.equal(result.sites.at(-1).name, "Github");
  assert.equal(result.message, "moved Github to 4");
});

test("/mv refuses bad positions, names, and usage", () => {
  const sites = fourSites();
  assert.equal(runCommand(sites, parseCommand("/mv github 0")).error, "not a position: 0 (1 is first)");
  assert.equal(runCommand(sites, parseCommand("/mv github first")).error, "not a position: first (1 is first)");
  assert.equal(runCommand(sites, parseCommand("/mv nope 1")).error, "no site named nope");
  assert.equal(runCommand(sites, parseCommand("/mv github")).error, "usage: /mv <name> <position>");
});

test("/set icon-lookup reads or changes the setting", () => {
  assert.deepEqual(runCommand([], parseCommand("/set icon-lookup")), { action: "setting", key: "icon-lookup" });
  assert.deepEqual(runCommand([], parseCommand("/set Icon-Lookup ON")), { action: "setting", key: "icon-lookup", value: true });
  assert.deepEqual(runCommand([], parseCommand("/set icon-lookup off")), { action: "setting", key: "icon-lookup", value: false });
});

test("/set refuses unknown settings and values", () => {
  assert.equal(runCommand([], parseCommand("/set")).error, "usage: /set icon-lookup [on|off]");
  assert.equal(runCommand([], parseCommand("/set colour blue")).error, "unknown setting: colour");
  assert.equal(runCommand([], parseCommand("/set icon-lookup maybe")).error, "usage: /set icon-lookup [on|off]");
  assert.equal(runCommand([], parseCommand("/set icon-lookup on now")).error, "usage: /set icon-lookup [on|off]");
});

test("complete finishes the words a command accepts", () => {
  assert.equal(complete("/set i", sites), "/set icon-lookup");
  assert.equal(complete("/SET I", sites), "/SET icon-lookup");
  assert.equal(complete("/set icon-lookup o", sites), "/set icon-lookup on");
  assert.equal(complete("/set icon-lookup of", sites), "/set icon-lookup off");
  assert.equal(complete("/import --r", sites), "/import --replace");
  assert.equal(complete("/import -", sites), "/import --merge");
});

test("complete offers no word that doesn't fit", () => {
  assert.equal(complete("/set ", sites), null);
  assert.equal(complete("/set x", sites), null);
  assert.equal(complete("/set icon-lookup on", sites), null);
  assert.equal(complete("/set other o", sites), null);
  assert.equal(complete("/import --merge --", sites), null);
  assert.equal(complete("/export x", sites), null);
});
