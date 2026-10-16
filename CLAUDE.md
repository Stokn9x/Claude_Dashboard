# Agent-kontor

A Claude Code mod that shows Claude and its subagents as pixel people in an office, drawn on a page in the browser, plus a small game: the work earns kroner, which buy desks, rooms and furniture. Everything stays on this computer.

Talk to the user in Danish. The page is dark only (the user's wish); there is no light theme. All text the user sees (page, panel, button, README, UDVIDELSER.md, SPIL.md) is Danish; code comments are English, in full sentences.

## How it fits together

| Part | File | Job |
|---|---|---|
| Mod | `hooks/register.tsx`, `types/index.d.ts` | Watches Claude's events, keeps the office in `$.state`, writes a status file per session to `~/.claude/agent-kontor/sessions/<key>.json`, starts the server, draws the "🏢 Åbn kontor" button above the chat box and the `/kontor panel` list. |
| Server | `server/server.mjs` | Zero-dependency Node server on `127.0.0.1:4747`. Reads the status files, streams them to the page over SSE, and is the only writer of `~/.claude/agent-kontor/spil.json` (kroner, what is owned, wellbeing). Sells things via `POST /api/buy`. |
| Page | `public/index.html`, `public/app.js` | Draws and animates everything on a canvas at 60 fps: floor plan, A* routes, camera, breaks, banter, shop. |

Rules that keep the parts apart:

- **The floor plan lives only in `public/app.js`** (`ROOM_TYPES`, `PLAN`). The mod knows no coordinates: every walk takes a fixed time (`WALKS` in the mod, sent in the status file), and the page sets the pace.
- **The server owns money and prices.** The mod only counts earnings (`earned`, with the rules: 100 lines per edit at most, green tests at most every ten minutes); the server credits the growth of each session's counts, times wellbeing. The page never decides a price.
- **Breaks, meetings and banter are page-only and deterministic** (from helper ids and the clock), so every viewer sees the same and a reload changes nothing.
- **The mod must never get in Claude's way.** Everything it does runs through `quietly()`; a failure is dropped.

## Plans and backlog

- `SPIL.md` is the game's plan, phase by phase, with what is decided. Update its status line and phase table when a phase lands.
- `UDVIDELSER.md` lists everything built and planned, with a version table at the top. Add a row for each release and set item statuses.

## Developing

The mod runs from the session's dev-mods folder, not from this repo. After changing files here, copy them there; the mod reloads when the turn ends:

```
DEV=~/.claude/dev-mods/<session-id>/agent-kontor
for p in hooks/register.tsx types/index.d.ts tests/kontor.test.ts server/server.mjs public/app.js public/index.html .claude-plugin/plugin.json; do cp "$p" "$DEV/$p"; done
```

Checks, all of which should pass before a commit:

- Mod tests and validation, with the desktop app's own CLI: `claude.exe plugin test <dev-mod folder>` and `claude.exe plugin validate <dev-mod folder>` (on this machine `claude.exe` is under `%APPDATA%\Claude\claude-code\<version>\`).
- Type-check: `npx -y -p typescript@5.6.3 tsc -p <tsconfig>` with a tsconfig that includes the engine's `claude-code.d.ts` and the mod's `hooks`, `types`, `tests`.
- Server economy: `node tests/economy.check.mjs` (starts the server against a temporary home folder).
- Page syntax: `node --check public/app.js`.

### Previewing the page

Preview against a temporary home folder, never the user's real `~/.claude`:

1. A `.claude/launch.json` in the parent folder (`Desktop/Claude mod`) that runs `agent-kontor/server/server.mjs` with `USERPROFILE` set to a scratch folder and `AGENT_KONTOR_PORT` 4748.
2. A small script that writes fake v2 status files (helpers with `seat`, `phase`, `since`, `activity`, `earned`, `walks`) into that folder every 500 ms, and a `spil.json` there if the test needs owned rooms or money.
3. `preview_start`, then look at the page **at full size** (the user asked for this). `resize_window` to e.g. 1280×800 lays the page out at that size, but the screenshot shows it small in a corner: use it for the layout, and the pane's own size (zoomed crops) for details. `?tid=21:30` shows another time of day; overriding `Date.now` in the page jumps to a break or a meeting.
4. Afterwards stop the server and the writer, and delete the `launch.json`.

### After a release

Bump the version in `.claude-plugin/plugin.json` (both copies) and `VERSION` in `server/server.mjs`. The running server keeps its old code in memory: stop the process listening on 4747 (only if its command line is this server) and start it again with `node <dev-mod>/server/server.mjs --detach`.

Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Pushing to `Stokn9x/Claude_Dashboard` is fine.

## Pitfalls we have hit

- **`$.state` survives a reload of the mod.** An office saved by an older version lacks newer fields: read it through `fresh()` and give every new field a default in `emptyOffice`.
- **`$.state` reads are a snapshot per event.** Look up something added earlier in the same event inside `update()`.
- **Windows paths:** `$.fs` needs forward slashes; build paths with `split(String.fromCharCode(92)).join('/')`.
- **Status files can be read half-written.** The server keeps the last good read of each file.
- **Don't rebuild buttons on every update.** The state arrives several times a second; a button replaced under the pointer swallows the click. Build once, then update text and `disabled` (see `buildShop`).
- **CSS class names are shared.** `.note` in the people list carries `grid-column: 2`; use the shop's own classes (`.hint`).
- **Patch scripts:** heredocs mangle backslashes and quotes. Write larger patches as Python files with the Write tool, assert every replacement, and remember to actually run the script.
- **A floor plan change can cut off a room.** Furniture in a narrow corridor, or a door that does not quite meet the floor on both sides, leaves A* without a route, and the walk then cuts straight through walls. After changing `ROOM_TYPES` or `PLAN`, run `kontorCheckRoutes()` in the page's console in an office that owns everything; it must report no problems.
- **The balance is slow on purpose:** the office should take weeks of work. `tests/economy.check.mjs` reads rates and prices from the server, so changing them does not break it.
- **Deleting is refused by the auto-mode classifier.** Move things aside (e.g. to `~/.claude/dev-mods-arkiv`) instead.
