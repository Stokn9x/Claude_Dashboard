# Agent-kontor

A Claude Code mod that shows Claude and its subagents as pixel people in an office, drawn on a page in the browser, plus a small game: the work earns kroner, which buy desks, rooms and furniture. Everything stays on this computer.

Talk to the user in Danish. The page is dark only (the user's wish); there is no light theme. All text the user sees (page, panel, button, README, UDVIDELSER.md, SPIL.md) is Danish; code comments are English, in full sentences.

## How it fits together

| Part | File | Job |
|---|---|---|
| Mod | `hooks/register.tsx`, `types/index.d.ts` | Watches Claude's events, keeps the office in `$.state`, writes a status file per session to `~/.claude/agent-kontor/sessions/<key>.json`, starts the server, draws the "🏢 Åbn kontor" button above the chat box and the `/kontor panel` list. |
| Server | `server/server.mjs` | Zero-dependency Node server on `127.0.0.1:4747`. Reads the status files, streams them to the page over SSE, and is the only writer of `~/.claude/agent-kontor/spil.json` (kroner, what is owned, wellbeing). Sells things via `POST /api/buy`. |
| Page | `public/index.html`, `public/style.css`, `public/js/*.js` | Draws and animates everything on a canvas that fills the window, at 60 fps, with the panels floating over it. ES modules, one job each (see below). |

Rules that keep the parts apart:

- **The floor plan lives only in `public/js/plan.js`** (`ROOM_TYPES`, `PLAN`, `CHAINS`, `GROUNDS`). The mod knows no coordinates: `WALKS` in the mod (sent in the status file) is a ceiling for each walk, and the page walks at one pace (`SPEED`), briskly only when a route is longer than its ceiling.
- **The server owns money and prices.** The mod only counts earnings (`earned`, with the rules: 100 lines per edit at most, green tests at most every ten minutes); the server credits the growth of each session's counts, times wellbeing. The page never decides a price.
- **Breaks, meetings and banter are page-only and deterministic** (from helper ids and the clock), so every viewer sees the same and a reload changes nothing.
- **The mod must never get in Claude's way.** Everything it does runs through `quietly()`; a failure is dropped.

### The page's modules

`main.js` starts it and feeds it the server's state. `store.js` holds what the page knows (state, focused session, selection, hit boxes); no module keeps its own copy. `plan.js` is the floor plan and the grounds, `routes.js` A* and walks (also the walk home down the path), `breaks.js` breaks, meetings and banter, `scenery.js` where the trees stand, `activity.js` what happened between two states, `idle.js` what helpers off work do, `voices.js` each helper's temperament and lines. Drawing: `gfx.js` (canvas and primitives), `figures.js` (people), `furniture.js`, `building.js` (the cached background: grounds, walls, rooms), `outdoors.js` (grass, trees, road; cars and the duck), `light.js`, `scene.js` (one frame). `camera.js` owns the view, input, the minimap and the free part of the window. The page around it: `panel.js`, `card.js`, `shop.js`, `progress.js`, `feed.js` (the activity log; `onEvents` lets others hear the news), `sound.js` (tunes, made with Web Audio), `notify.js` (browser notices and the tab title), `tip.js` (our own tooltips: any `title` becomes one).

The modules without drawing (`util`, `store`, `plan`, `routes`, `breaks`, `scenery`, `activity`, `idle`, `voices`) touch no DOM when loaded, so `tests/page.test.mjs` runs them in Node. Keep it that way: anything that needs `document` or `window` goes in a drawing or page module. `public/js/package.json` only tells Node they are ES modules; the server never serves it.

The camera: the canvas covers the window; `view` is the world point in the middle of the free area (what the header and panel leave) and a zoom, where zoom 1 fits the office into that area. Panning is kept over `GROUNDS.scene`.

## Plans and backlog

- `SPIL.md` is the game's plan, phase by phase, with what is decided. Update its status line and phase table when a phase lands.
- `UDVIDELSER.md` lists everything built and planned, with a version table at the top. Add a row for each release and set item statuses.
- `GRUNDPLAN.md` (with `docs/grundplan.svg`) is the floor plan built in 0.19.0: a hall, two rows of rooms, rooms that grow in steps; its "Sådan blev det" section says where the build differs from the drawing.

## Developing

The mod runs from the session's dev-mods folder, not from this repo. After changing files here, copy them there; the mod reloads when the turn ends:

```
DEV=~/.claude/dev-mods/<session-id>/agent-kontor
mkdir -p "$DEV/public/js"
for p in hooks/register.tsx types/index.d.ts tests/*.ts tests/*.mjs server/server.mjs public/index.html public/style.css public/js/*.js public/js/package.json .claude-plugin/plugin.json; do cp "$p" "$DEV/$p"; done
```

Checks, all of which should pass before a commit:

- Mod tests and validation, with the desktop app's own CLI: `claude.exe plugin test <dev-mod folder>` and `claude.exe plugin validate <dev-mod folder>` (on this machine `claude.exe` is under `%APPDATA%\Claude\claude-code\<version>\`).
- Type-check: `npx -y -p typescript@5.6.3 tsc -p <tsconfig>` with a tsconfig that includes the engine's `claude-code.d.ts` and the mod's `hooks`, `types`, `tests`.
- Server economy: `node tests/economy.check.mjs` (starts the server against a temporary home folder).
- Page logic and server: `node --test tests/page.test.mjs tests/server.test.mjs` (floor plan, every route, breaks, trees, activity log; the files the server hands out, backups, recovery from a broken `spil.json`).
- Page syntax: `for f in public/js/*.js; do node --check "$f"; done`.

### Previewing the page

Preview against a temporary home folder, never the user's real `~/.claude`:

1. A `.claude/launch.json` in the parent folder (`Desktop/Claude mod`) that runs `agent-kontor/server/server.mjs` with `USERPROFILE` set to a scratch folder and `AGENT_KONTOR_PORT` 4748.
2. A small script that writes fake v2 status files (helpers with `seat`, `phase`, `since`, `activity`, `earned`, `walks`) into that folder every 500 ms, and a `spil.json` there if the test needs owned rooms or money.
3. `preview_start`, then look at the page **at full size** (the user asked for this). While the Browser pane is hidden the page draws only when a screenshot is taken (about one frame a second): glides, walks and bubbles then look slow or missed, and a reload can come out drawn small in a corner. To check timed things (a chat line, a break), read the state from the page with `javascript_tool` (`await import('/js/store.js')`) instead of hunting for the right frame; to see a layout without buying it, wrap `store.state` in a setter that rewrites `game.owned.rooms`, since the next server message would undo a plain change. `resize_window` to e.g. 1280×800 lays the page out at that size, but the screenshot shows it small in a corner: use it for the layout, and the pane's own size (zoomed crops) for details. `?tid=21:30` shows another time of day; overriding `Date.now` in the page jumps to a break or a meeting.
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
- **CSS class names are shared.** `.note` in the people list carries `grid-column: 2`; use the shop's own classes (`.hint`). `.bar` is a day in the progress chart (the header bar is `.topbar`).
- **A fixed element has no `offsetParent`.** To see whether the floating panel shows, look at its `getBoundingClientRect()` width.
- **The server serves only known names:** `/`, `/style.css` and `/js/<lowercase>.js`. A new module needs a lowercase name without dashes.
- **Patch scripts:** heredocs mangle backslashes and quotes. Write larger patches as Python files with the Write tool, assert every replacement, and remember to actually run the script. A `\n` or `\t` inside a Python string in such a script becomes a real newline or tab in the file: check the result with `node --check`, or fix the spot with the Edit tool.
- **Every bought thing needs an entry in `ITEMS` (plan.js)**, or the shop throws and the whole panel stops rendering. `tests/page.test.mjs` reads the server's price lists and checks this.
- **The engine's hooks are set before the first `$` call in a mod test.** A second `on(...)` for the same hook mid-test fails; give a different fake its own test. A test that waits on `$.clock.after` must advance the clock itself (`clock.advance`) while the call runs.
- **Room geometry:** a door must span both walls (each room has its own 6-unit wall). Every room opens on the hall, and a walk goes room by room (`roomPath`): out of a door a step straight on (`MOUTH`), along the hall in the lane on the right (`laneOf`), in by the next door; within a room A* round the furniture, then pulled straight. A walk between outside places is a straight line: keep the bench and the lawn where that line misses the buildings. Things that only exist once bought (furniture) are blocks with a fifth entry, the item they need.
- **Rooms that grow:** a room's `grows` list moves its west edge (`x`) or widens it (`w`) for each step bought; `rectOf` is the room now, `fullRectOf` fully grown. A type is drawn and furnished at full size, and anything outside `rectOf` is not there yet (`hasNow`, `spotsIn`): desks, spots, lamps, blocks. A step inside the house has a depot (`until`) that stands until it is bought. The south row's types are drawn for y 314 and shifted down to `SOUTH` by the room's position, so the hall's width is one number.
- **Desks fill in a fixed order** (`DESK_ORDER`), and the team rooms' steps are one chain on the server, so a new step only adds desks at the end and nobody moves.
- **A saved game for an older floor plan is moved over by the server** (`migrate`, `PLAN_VERSION`): bump the version and extend `migrate` whenever owned ids change meaning.
- **A floor plan change can cut off a room.** Furniture in a narrow corridor, or a door that does not quite meet the floor on both sides, leaves A* without a route, and the walk then cuts straight through walls. After changing `ROOM_TYPES` or `PLAN`, run `kontorCheckRoutes()` in the page's console in an office that owns everything; it must report no problems.
- **The balance is slow on purpose:** the office should take weeks of work. `tests/economy.check.mjs` reads rates and prices from the server, so changing them does not break it.
- **Nobody jumps.** A phase reaches the page up to a second late; `settle` (routes.js, used by main.js) lets one that is less than 2.5 s late begin when the page first sees it. Breaks and meetings are settled when they begin (`lineups`, kept per session in scene.js), and no break starts round a meeting. Should a figure still be far from where it was drawn last frame, `unjumped` (scene.js) walks it there along a route at 2.5 times the pace. To check movement, simulate in the page: override `Date.now`, feed `store.state` through `settle` every 400 ms with a delay, call `draw()` every 33 ms and compare `store.hits` frame to frame (a hidden Browser pane draws nothing on its own).
- **A helper's life:** arriving → working → delivering → idle (off work, `WALKS.idle`, three minutes) → leaving. Called on while idle, it goes back to `arriving` with `from: 'idle'`; a stuck one skips idle. Idle and leaving helpers hold no seat. What an idle helper does is the page's (`idle.js`); the walks between idle spots are remembered in the page only, so a reload can skip one.
- **Lines are counted from Edit and Write, and at each commit.** After a successful `git commit` the mod reads `git show --numstat HEAD` (in the folder of a leading `cd`) and earns what Edit and Write did not count since the last commit, at most 400 each way. Tests count by command (`npm test`, `node --test`, …).
- **Servers older than 0.13.1 have no `/api/quit`.** The mod then stops the process listening on 4747, but only if its command line runs `server/server.mjs` (`stopByPort`).
- **The reception always stands.** It is the front of the building: helpers come in by its door to the path (`entrance()`, `walkway()` in plan.js). Buying 'reception' only furnishes it and seats Bodil.
- **One plane only.** The office grows across the grounds, never upwards: no floors, lifts or stairs (the user's decision).
- **Deleting is refused by the auto-mode classifier.** Move things aside (e.g. to `~/.claude/dev-mods-arkiv`) instead.
