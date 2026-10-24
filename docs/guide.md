# Using tilde

tilde replaces your browser's new tab page with a terminal-style prompt and a grid of
your sites. Everything here can be done with the mouse; where there's also a command or
a keyboard shortcut, it's listed alongside for anyone who prefers typing.

- [Searching and opening sites](#searching-and-opening-sites)
- [Adding, editing, and removing sites](#adding-editing-and-removing-sites)
- [Rearranging sites](#rearranging-sites)
- [Pages](#pages)
- [Icons](#icons)
- [Settings](#settings)
- [Backups](#backups)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Commands](#commands)
- [Your data and privacy](#your-data-and-privacy)
- [Troubleshooting](#troubleshooting)

## Searching and opening sites

Type in the prompt at the top and press **Enter**.

- **An address opens directly.** Anything with `http://` or `https://`, `localhost`, an
  IP address, or a name ending in a common domain (`.com`, `.org`, `.io`, `.dev`, `.app`,
  and others) goes straight there.
- **Anything else is a search**, using the search engine your browser is set to. So
  `node.js` searches rather than trying to open a site called node.js.
- **Click a tile** to open that site.

The prompt has focus whenever you open a new tab, so you can start typing right away. If
you've clicked elsewhere, press **/** to jump back to it, and **Esc** to clear it.

## Adding, editing, and removing sites

**Adding a site.** Click the **+** tile at the end of the grid, type the address, and
press **Save**. The name is filled in from the address (`github.com` becomes "Github")
unless you type your own, and the site's icon is found for you.

**Editing a site.** Hover over its tile and click the pencil that appears in the corner
(or press **Tab** until the tile is selected). You can change its address, its name, and
its icon (see [Icons](#icons)), then press **Save**.

**Removing a site.** Open the same panel and click **Delete**, then **Really delete?** to
confirm. There's no undo, so the second click is there to catch slips.

In the panel, **Enter** saves, and **Esc**, **Cancel**, or a click outside the panel
closes it without changes.

| Do this | With a command |
|---|---|
| Add a site | `/add github.com`, or `/add github.com Code` to name it |
| Edit a site | `/edit github` |
| Remove a site | `/rm github` |

## Rearranging sites

- **Drag a tile onto another** to put it in that spot; the tiles in between shift over.
  Drop it on **+** (on the last page) to move it to the very end.
- **Drag a tile to another page** by holding it just past the right edge of the grid (or
  the left edge for the page before). After a moment the page turns, and keeps turning
  once a second while you hold it there. Let go over a tile to drop it. Letting go at the
  edge cancels the move.
- **Drop a tile on a page number** below the grid to send it to the end of that page.
- **With the keyboard:** select a tile with **Tab**, then press **Alt+←** or **Alt+→**
  (**Option+←/→** on a Mac) to move it one place at a time.

New positions are saved straight away. With a command: `/mv github 1` puts GitHub first.

## Pages

tilde shows as many tiles as fit on your screen and puts the rest on more pages, with the
rows evened out (ten tiles on a screen that fits eight per row show as two rows of five).
When there's more than one page, page numbers appear below the tiles, with the current
one in brackets: `[1] 2 3`.

To switch pages, click a number or scroll the mouse wheel. With the keyboard, see
[Keyboard shortcuts](#keyboard-shortcuts). New tabs always open on the first page.

To show fewer tiles per page, open [Settings](#settings) and choose a number. It can't go
above what fits; if it's set higher, you'll see as many as fit until the window is
bigger.

## Icons

Each site's icon comes from your browser's own collection of site icons and is saved with
the site, so it loads instantly and survives clearing the browser's cache.

- **The grey globe** means the browser has no icon for that site yet, usually because
  you haven't visited it. Visit the site once and its icon appears.
- **DuckDuckGo lookup** can find icons the browser doesn't have. It's off by default; turn
  it on in [Settings](#settings). When it's on, DuckDuckGo is told the address (just the
  domain, like `github.com`) of each site your browser has no icon for. The first time,
  the browser asks you to allow tilde to contact `icons.duckduckgo.com`.
- **Your own icon:** in a site's panel, click **Upload…** and choose any image. **Reset**
  goes back to the automatic icon.

## Settings

Click the gear in the top right corner of the page (or type `/settings`).

- **Tiles per page:** "Fit to screen" (the default), or a number of your choosing.
- **Icons:** the DuckDuckGo lookup switch described in [Icons](#icons).
- **Backup:** export and import buttons, described below.

Changes to the first two take effect when you press **Save**; **Cancel** or **Esc**
leaves everything as it was. The backup buttons act right away.

## Backups

Your sites live in the browser, so it's worth keeping a backup file, especially before
removing tilde or moving to another computer.

- **Export:** in [Settings](#settings), click **Export**. A file named like
  `tilde-2026-10-24.json` downloads, holding your sites, their icons, and your settings.
- **Import:** in Settings, choose what should happen, then click **Import…** and pick a
  backup file:
  - **Add to my sites** adds the sites you don't already have and leaves the rest alone.
  - **Replace my sites** swaps everything for what's in the file, including your
    settings. It asks for a second click (**Really replace?**) first.

With commands: `/export`, `/import` (adds), and `/import --replace`. Typing these shows a
line under the prompt with a button to click; that's deliberate, because the file window
would otherwise open with the mouse pointer hidden (see
[Troubleshooting](#troubleshooting)). While `/import` is waiting, you can also drag the
backup file onto the page instead of clicking.

## Keyboard shortcuts

| Action | Windows and Linux | macOS |
|---|---|---|
| Jump to the prompt | `/` | `/` |
| Clear the prompt, or cancel | `Esc` | `Esc` |
| Accept the suggested command | `Tab` | `Tab` |
| Previous or next command | `↑` / `↓` | `↑` / `↓` |
| Go to page 1 to 9, from anywhere | `Alt+1` to `Alt+9` | `Ctrl+1` to `Ctrl+9` |
| Go to page 1 to 9, outside the prompt | `1` to `9` | `1` to `9` |
| Move the selected tile | `Alt+←` / `Alt+→` | `Option+←` / `Option+→` |

## Commands

Commands are typed into the prompt and start with `/`. As you type, a dimmed suggestion
shows the rest of the command, a site name, or an option; press **Tab** to accept it.
**↑** brings back commands you've run before. The result shows on a line under the
prompt: green for success (it fades after a few seconds), red for a problem (it stays, and
so does your command, so you can fix it and press Enter again).

| Command | What it does |
|---|---|
| `/add <address> [name]` | Save a site, optionally with your own name |
| `/rm <name>` | Remove a site |
| `/mv <name> <position>` | Move a site (1 is the first spot) |
| `/edit <name>` | Open a site's panel |
| `/page <n>` | Go to a page |
| `/set perpage <n>` or `/set perpage auto` | Tiles per page, or fit to screen |
| `/set icon-lookup on` or `off` | DuckDuckGo icon lookup |
| `/settings` | Open the settings panel |
| `/export` | Download a backup |
| `/import`, `/import --replace` | Load a backup, adding to or replacing your sites |
| `/help` | List the commands |

Site names in commands ignore upper and lower case, and names with spaces work as they
are: `/rm prime video`.

## Your data and privacy

- Your sites, icons, settings, and command history are stored by your browser on your
  computer. tilde has no account and no server.
- Searches go to your browser's search engine, the same as searching from the address
  bar.
- Nothing else leaves your computer, except the site domains sent to DuckDuckGo if you
  turn on icon lookup.
- Removing the extension removes its data, so export a backup first.

## Troubleshooting

**The browser asks whether to keep the new tab page.** Browsers check when an extension
changes the new tab page. Choose to keep it.

**There's a bar at the bottom with "Tilde" and "Customize Brave".** That comes from Brave
(Chrome shows a similar one), not from tilde, and tilde can't remove it.

**The mouse pointer is missing in the save or open window.** Windows (and macOS) hide the
pointer while you type, and it stays hidden in a window that opens straight from a
keypress. That's why `/export` and `/import` show a button to click first. If it still
happens, move the mouse, or turn off "Hide pointer while typing" in Windows' mouse
settings.

**`Ctrl+1` to `Ctrl+9` don't switch pages on a Mac.** macOS can use those keys to switch
between desktops (System Settings, then Keyboard, then Keyboard Shortcuts, then Mission
Control). If that's turned on, macOS takes them first. Use the page numbers, the scroll
wheel, or plain `1` to `9` instead.

**A site shows a globe instead of its icon.** See [Icons](#icons): visit the site once,
or turn on DuckDuckGo lookup.

**Which browsers work?** tilde is built and tested in Brave and should work in other
Chromium browsers such as Chrome and Edge. Firefox and Safari aren't supported.
