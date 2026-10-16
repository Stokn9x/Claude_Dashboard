// ── The floor plan ───────────────────────────────────────────────────────
// The office is a main corridor, the hall, with a row of rooms on each side
// (see GRUNDPLAN.md). A room type knows where things stand inside it: the
// desks, Claude's chair, the lamps, what is in the way. Those are written in
// the coordinates of the place the type was first drawn for, its home; a
// room placed elsewhere is shifted by the difference.
//
// Some rooms grow in steps, bought one at a time: the team rooms to the
// west, the lounge and the toilet to the east, the kitchen into the depot
// beside it. A type is drawn and furnished at its full size, and the room
// shows as much of it as its bought steps cover: anything outside the
// room's rectangle now is not there yet. A step inside the house stands as
// a closed depot until it is bought, so the house never has a hole in it.
// This file is the only place that knows the plan: the mod times every walk
// and lets the page find the way.
import { store, owns } from './store.js'

// Something bought, or, for a list, any one of them.
const ownsAny = need => (Array.isArray(need) ? need.some(owns) : owns(need))

// The rows of desks in a team room, by the y of the room's top, and the
// three columns, one for each step, from east to west.
const DESK_ROWS = [46, 122, 198]
const TEAM_COLUMNS = [65, -65, -195]
const teamDesks = top => TEAM_COLUMNS.flatMap((cx, i) => DESK_ROWS.map(dy => ({ cx, dy: top + dy, step: i + 1 })))
// A desk and the chair behind it, as blocks to walk round
const deskBlocks = list => list.flatMap(({ cx, dy }) => [[cx - 42, dy - 1, 84, 30], [cx - 21, dy - 18, 42, 22]])

export const ROOM_TYPES = {
  // Claude's office, in the middle of the north row, right above the
  // reception, so helpers have a short way with their results.
  corner: {
    home: { x: 182, y: 0 },
    w: 230,
    h: 250,
    topWall: 16,
    windows: [184, 356],
    claude: { cx: 297, dy: 96 },
    // Where a helper stands to hand over its result, right of Claude's desk
    handoff: seat => ({ x: 374 + (seat % 3) * 13, y: 100 + (Math.floor(seat / 3) % 2) * 14 }),
    board: { x: 354, y: 22, w: 44, h: 30 },
    plants: [[196, 236], [400, 236, true]],
    lights: [[240, 192, 44, 0.4], [297, 60, 70, 0.16, 'ceiling'], [297, 196, 70, 0.16, 'ceiling']],
    bulbs: [[240, 192]],
    blocks: [[184, 16, 12, 88], [233, 95, 128, 30], [276, 78, 42, 22], [354, 22, 44, 30], [196, 180, 28, 26], [233, 185, 14, 14], [392, 150, 18, 58]],
  },
  // The second team room, in the north row, west of Claude: three desks to
  // start with, three more for each step west.
  team2: {
    home: { x: 0, y: 0 },
    w: 170,
    h: 250,
    topWall: 16,
    windows: [37, -93, -223],
    sideWindows: [['west', 60, 40], ['west', 150, 40]],
    desks: teamDesks(0),
    plants: [[12, 14], [158, 22, true]],
    lights: TEAM_COLUMNS.flatMap(cx => [[cx, 84, 66, 0.16, 'ceiling'], [cx, 160, 66, 0.16, 'ceiling']]),
    blocks: [...deskBlocks(teamDesks(0)), [-258, 70, 14, 76], [-100, 2, 70, 14], [-36, 228, 16, 20]],
  },
  // The first team room, in the south row under the second
  team: {
    home: { x: 0, y: 314 },
    w: 170,
    h: 250,
    sideWindows: [['west', 360, 40], ['west', 470, 40]],
    desks: teamDesks(314),
    plants: [[12, 552], [-118, 552, true]],
    lights: TEAM_COLUMNS.flatMap(cx => [[cx, 398, 66, 0.16, 'ceiling'], [cx, 474, 66, 0.16, 'ceiling']]),
    blocks: [...deskBlocks(teamDesks(314)), [-258, 380, 14, 76], [138, 540, 30, 18], [-36, 316, 16, 22]],
  },
  // The main corridor: every room has its door on it, and it is wide
  // enough for two lanes. Helpers keep right.
  hall: {
    home: { x: 0, y: 262 },
    w: 1086,
    h: 64,
    sideWindows: [['west', 274, 48], ['east', 274, 48]],
    lights: [-200, -80, 40, 160, 380, 560, 700, 880, 1040].map(x => [x, 294, 56, 0.18, 'ceiling']),
  },
  // The reception, in the middle of the front, with the front door to the
  // path: it always stands, bare, and arrivals come in by it; bought, it
  // gets a counter, sofas and Bodil, who greets everyone by name.
  reception: {
    home: { x: 182, y: 314 },
    w: 230,
    h: 250,
    receptionist: { cx: 232, dy: 404 },
    // Where its sign stands until it is bought
    items: { reception: { x: 232, y: 450 } },
    // Where a helper with no desk sits with its laptop: along the walls of
    // the waiting area, clear of the way from the front door to the hall.
    floor: [[198, 548], [222, 548], [246, 548], [348, 548], [372, 548], [396, 548], [198, 488], [222, 488], [372, 488], [396, 488]].map(([x, y]) => ({ x, y })),
    lights: [[232, 380, 64, 0.36, 'lamp', 'reception'], [380, 380, 46, 0.26, 'lamp', 'reception'], [297, 450, 66, 0.2, 'ceiling']],
    // The counter and Bodil's chair, the sofa and the table by the east
    // wall: only once it is bought. The fifth entry says what a block needs.
    blocks: [[185, 400, 94, 34, 'reception'], [210, 380, 44, 22, 'reception'], [390, 352, 18, 56, 'reception'], [366, 366, 18, 26, 'reception']],
  },
  meeting: {
    home: { x: 424, y: 0 },
    w: 300,
    h: 250,
    topWall: 16,
    windows: [470, 640],
    plants: [[438, 20], [710, 236, true]],
    // Chairs round the long table: a row behind it, a row in front of it
    chairs: [
      ...[0, 1, 2, 3, 4, 5].map(i => ({ x: 492 + i * 38, y: 100, row: 'behind' })),
      ...[0, 1, 2, 3, 4, 5].map(i => ({ x: 492 + i * 38, y: 146, row: 'front', facing: 'back' })),
    ],
    head: { x: 452, y: 120, facing: 'right' },
    lights: [[530, 120, 54, 0.3], [640, 120, 54, 0.3]],
    blocks: [[466, 90, 240, 62], [670, 2, 40, 16], [560, 226, 100, 18]],
  },
  // The quiet room: four desks, and the aquarium
  quiet: {
    home: { x: 424, y: 314 },
    w: 280,
    h: 250,
    desks: [[520, 390], [640, 390], [520, 490], [640, 490]].map(([cx, dy]) => ({ cx, dy, step: 1 })),
    plants: [[692, 330, true], [436, 552]],
    lights: [[580, 380], [580, 480]].map(([x, y]) => [x, y, 66, 0.16, 'ceiling']),
    // The aquarium along the top wall, right of the door: x, y, width, height
    aquarium: [560, 318, 64, 14],
    blocks: [...deskBlocks([[520, 390], [640, 390], [520, 490], [640, 490]].map(([cx, dy]) => ({ cx, dy }))), [560, 318, 64, 14]],
  },
  // The lounge, east of the meeting room: where helpers off work go to play
  // and unwind. Step 1 has the TV, the sofa and room for a ping-pong table,
  // step 2 (the depot) the pool table and the darts, step 3 (out on the grounds) the bar, the arcade
  // machine, the jukebox and the guitar. Each pastime has its spots: where
  // to stand or sit, and facing.
  lounge: {
    home: { x: 736, y: 0 },
    w: 200,
    h: 250,
    topWall: 16,
    windows: [750, 960, 1120],
    lights: [[897, 12, 58, 0.5, 'neon'], [836, 120, 62, 0.22, 'ceiling'], [1020, 120, 62, 0.3, 'lamp'], [1150, 34, 50, 0.3, 'lamp'], [1170, 200, 50, 0.22, 'lamp']],
    tv: { x: 800, y: 2, w: 56, h: 10 },
    sofa: { x: 840, y: 226, w: 64, h: 16 },
    pool: { x: 980, y: 100, w: 80, h: 38 },
    dartboard: { x: 1030, y: 8 },
    bar: { x: 1110, y: 4, w: 84, h: 16 },
    arcade: { x: 1208, y: 2, w: 26, h: 22 },
    jukebox: { x: 1218, y: 200, w: 20, h: 20 },
    // The ping-pong table, once bought, its two ends, and where its sign
    // stands until then
    pingpongTable: { x: 836, y: 153 },
    pingpong: [{ x: 800, y: 155, facing: 'right' }, { x: 872, y: 155, facing: 'left' }],
    items: { pingpong: { x: 836, y: 153 } },
    hobbies: {
      // On beanbags in front of the TV, backs to us
      gaming: [{ x: 814, y: 62, facing: 'back', sit: true }, { x: 842, y: 62, facing: 'back', sit: true }],
      // On the sofa by the south wall
      sofa: [{ x: 858, y: 238, facing: 'front', sit: true }, { x: 886, y: 238, facing: 'front', sit: true }],
      // One at each end of the pool table
      pool: [{ x: 968, y: 124, facing: 'right' }, { x: 1072, y: 124, facing: 'left' }],
      // At the line, throwing at the board on the north wall
      darts: [{ x: 1030, y: 72, facing: 'back' }],
      // On stools at the bar, backs to us
      bar: [{ x: 1128, y: 44, facing: 'back', sit: true }, { x: 1160, y: 44, facing: 'back', sit: true }],
      arcade: [{ x: 1221, y: 48, facing: 'back' }],
      guitar: [{ x: 1160, y: 200, facing: 'front', sit: true }],
    },
    blocks: [[796, 2, 64, 14], [836, 224, 72, 20], [808, 138, 56, 30, 'pingpong'], [976, 96, 88, 46], [1106, 2, 92, 22], [1204, 2, 34, 26], [1214, 198, 28, 24], [1176, 192, 14, 14]],
  },
  // The kitchen: a coffee machine and a small table to start with, the big
  // table, the fridge and the snack machine once it grows into the depot.
  kitchen: {
    home: { x: 716, y: 314 },
    w: 130,
    h: 250,
    coffee: { x: 760, y: 362 },
    // Where helpers stand with their coffee on a break, two by two, clear
    // of the tables and machines
    standing: [[736, 382, 'right'], [786, 382, 'left'], [878, 382, 'right'], [916, 382, 'left'], [960, 476, 'left']].map(([x, y, facing]) => ({ x, y, facing })),
    machine: { x: 730, y: 318 },
    // On the back wall: the wall on the hall has the room's sign
    clock: { x: 792, y: 567, r: 5 },
    plants: [[728, 552], [964, 552]],
    lights: [[760, 440, 40, 0.3], [900, 450, 64, 0.34]],
    blocks: [[718, 316, 62, 18], [748, 414, 24, 52], [940, 316, 28, 34], [942, 362, 32, 30], [866, 416, 68, 68]],
  },
  // The toilet: one stall, then two and a sink, then three, out to the east
  toilet: {
    home: { x: 988, y: 314 },
    w: 98,
    h: 150,
    plants: [[1000, 330]],
    // Inside each stall, out of sight
    stalls: [{ x: 1020, y: 448 }, { x: 1118, y: 448 }, { x: 1176, y: 448 }],
    lights: [[1037, 370], [1116, 370], [1176, 370]].map(([x, y]) => [x, y, 44, 0.18, 'ceiling']),
    blocks: [[994, 424, 52, 40], [1092, 424, 52, 40], [1150, 424, 52, 40], [1094, 316, 46, 16]],
  },
  // A store room with a closed door: where a step inside the house waits to
  // be bought. Its size is the room's own.
  depot: { home: { x: 0, y: 0 }, w: 100, h: 100 },
}

// The rooms, with their steps: a step that is bought moves the room's west
// edge (x) or widens it (w). The hall follows the team rooms west. The
// south row stands below the hall, its types drawn for y 314 and shifted
// down with the room (SOUTH).
const SOUTH = 338
export const PLAN = {
  rooms: [
    { id: 'hall', type: 'hall', x: 0, y: 262, grows: [{ buy: ['team1-2', 'team2-2'], x: -130, w: 1216 }, { buy: ['team1-3', 'team2-3'], x: -260, w: 1346 }] },
    { id: 'team2', type: 'team2', x: 0, y: 0, buy: 'team2', grows: [{ buy: 'team2-2', x: -130, w: 300 }, { buy: 'team2-3', x: -260, w: 430 }] },
    { id: 'claude', type: 'corner', x: 182, y: 0 },
    { id: 'meeting', type: 'meeting', x: 424, y: 0, buy: 'meeting' },
    { id: 'lounge', type: 'lounge', x: 736, y: 0, buy: 'lounge', grows: [{ buy: 'lounge-2', w: 350 }, { buy: 'lounge-3', w: 510 }] },
    { id: 'lounge-depot', type: 'depot', x: 948, y: 0, w: 138, h: 250, until: 'lounge-2' },
    { id: 'team', type: 'team', x: 0, y: SOUTH, grows: [{ buy: 'team1-2', x: -130, w: 300 }, { buy: 'team1-3', x: -260, w: 430 }] },
    { id: 'reception', type: 'reception', x: 182, y: SOUTH },
    { id: 'quiet', type: 'quiet', x: 424, y: SOUTH },
    { id: 'kitchen', type: 'kitchen', x: 716, y: SOUTH, buy: 'kitchen', grows: [{ buy: 'kitchen-2', w: 260 }] },
    { id: 'kitchen-depot', type: 'depot', x: 858, y: SOUTH, w: 118, h: 250, until: 'kitchen-2' },
    { id: 'toilet', type: 'toilet', x: 988, y: SOUTH, buy: 'toilet', grows: [{ buy: 'toilet-2', w: 158 }, { buy: 'toilet-3', w: 218 }] },
  ],
  // Openings in the walls, in world units, between two rooms (open once
  // both are built), and the front door. Every room opens on the hall. A
  // closed door is a depot's, drawn while the depot stands.
  doors: [
    { x: 124, y: 250, w: 40, h: 12, colour: '#D5DAD2', between: ['team2', 'hall'] },
    { x: 277, y: 250, w: 40, h: 12, colour: '#CDB892', between: ['claude', 'hall'] },
    { x: 444, y: 250, w: 40, h: 12, colour: '#C8A57F', between: ['meeting', 'hall'] },
    { x: 756, y: 250, w: 40, h: 12, colour: '#8C6B55', between: ['lounge', 'hall'] },
    { x: 124, y: SOUTH - 12, w: 40, h: 12, colour: '#D5DAD2', between: ['team', 'hall'] },
    { x: 277, y: SOUTH - 12, w: 40, h: 12, colour: '#E0DBD0', between: ['reception', 'hall'] },
    { x: 444, y: SOUTH - 12, w: 40, h: 12, colour: '#C3CCD6', between: ['quiet', 'hall'] },
    { x: 804, y: SOUTH - 12, w: 40, h: 12, colour: '#E4E8EB', between: ['kitchen', 'hall'] },
    { x: 1042, y: SOUTH - 12, w: 36, h: 12, colour: '#D4E3E9', between: ['toilet', 'hall'] },
    // The front door, out to the path
    { x: 279, y: SOUTH + 250, w: 36, h: 6, colour: '#8C6B4A', isEntrance: true, between: ['reception'] },
    { x: 1000, y: 250, w: 30, h: 12, closed: 'lounge-depot' },
    { x: 900, y: SOUTH - 12, w: 30, h: 12, closed: 'kitchen-depot' },
  ],
}

// The steps a room grows by, in the order they are bought. The team rooms
// are one chain: team room 2 comes once team room 1 is full grown, so the
// desks fill the rooms in order. The server has the same chains.
export const CHAINS = {
  team: ['team1-2', 'team1-3', 'team2', 'team2-2', 'team2-3'],
  kitchen: ['kitchen', 'kitchen-2'],
  lounge: ['lounge', 'lounge-2', 'lounge-3'],
  toilet: ['toilet', 'toilet-2', 'toilet-3'],
}

// Where helpers come in and go out: the reception's door to the path. The
// walkway outside runs from that door down the path to the pavement.
export const entrance = () => ({ x: 297, y: SOUTH + 258 })
export const doormat = () => [285, SOUTH + 262, 24, 8]
export const walkway = () => [entrance(), { x: 297, y: SOUTH + 286 }, { x: 297, y: GROUNDS.pavement.y + 8 }]

export const typeOf = room => ROOM_TYPES[room.type]
export const roomById = id => PLAN.rooms.find(r => r.id === id) ?? null
// A depot stands until its step is bought; any other room once it is.
export const isBuilt = room => (room.until ? !owns(room.until) : owns(room.buy))
export const isDepot = room => !!room.until
// A door opens once every room it joins stands.
export const isOpenDoor = door => !door.closed && (door.between ?? []).every(id => roomById(id) && isBuilt(roomById(id)))
export const shiftOf = room => ({ dx: room.x - typeOf(room).home.x, dy: room.y - typeOf(room).home.y })
export const roomsOf = type => PLAN.rooms.filter(r => r.type === type)
export const firstRoom = type => roomsOf(type)[0] ?? null

// The room's floor as its bought steps have it now, and at its full size.
const baseRect = room => ({ x: room.x, y: room.y, w: room.w ?? typeOf(room).w, h: room.h ?? typeOf(room).h })
const grownBy = (rect, step) => ({ ...rect, x: step.x ?? rect.x, w: step.w ?? rect.w })
export const rectOf = room => (room.grows ?? []).reduce((rect, step) => (ownsAny(step.buy) ? grownBy(rect, step) : rect), baseRect(room))
export const fullRectOf = room => (room.grows ?? []).reduce(grownBy, baseRect(room))
// The first step not bought yet, and the floor it adds beside the room as
// it stands now (the wall between them goes once it is built).
export const nextStepOf = room => (room.grows ?? []).find(step => !ownsAny(step.buy)) ?? null
// The floor a step adds, wall and all, whether it is bought or not.
export const stepArea = (room, item) => {
  let rect = baseRect(room)
  for (const step of room.grows ?? []) {
    const next = grownBy(rect, step)
    if ([step.buy].flat().includes(item)) return next.x < rect.x ? { x: next.x, y: rect.y, w: rect.x - next.x, h: rect.h } : { x: rect.x + rect.w, y: rect.y, w: next.x + next.w - rect.x - rect.w, h: rect.h }
    rect = next
  }
  return null
}
// The lot a step not yet bought stands on: its floor, short of the wall of
// the room as it is now.
export const lotOf = (room, step) => {
  const a = stepArea(room, step.buy)
  return a.x < rectOf(room).x ? { ...a, w: a.w - 6 } : { ...a, x: a.x + 6, w: a.w - 6 }
}
// Whether a point of the room's type lies on the floor the room has now:
// furniture, desks, spots and lamps beyond it are not there yet.
export const hasNow = (room, p) => {
  const r = rectOf(room)
  const { dx, dy } = shiftOf(room)
  const x = (p.x ?? p.cx ?? p[0]) + dx
  const y = (p.y ?? p.dy ?? p[1]) + dy
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
}
// A point of a room type, where it stands in this room.
export const at = (room, p) => {
  const { dx, dy } = shiftOf(room)
  return 'cx' in p ? { ...p, cx: p.cx + dx, dy: p.dy + dy } : { ...p, x: p.x + dx, y: p.y + dy }
}
const frameAround = (room, r) => ({ x: r.x - 6, y: r.y - (typeOf(room).topWall ?? 6), w: r.w + 12, h: r.h + (typeOf(room).topWall ?? 6) + 6 })
export const frameOf = room => frameAround(room, rectOf(room))
export const fullFrameOf = room => frameAround(room, fullRectOf(room))

// The windows in a room's walls as it stands now: those along the top wall
// (x), and those in the side walls ([x, y, height], x 'west' or 'east' for
// the room's west or east wall wherever it is now).
export const topWindowsOf = room => {
  const r = rectOf(room)
  return (typeOf(room).windows ?? []).map(x => x + shiftOf(room).dx).filter(x => x >= r.x && x + 56 <= r.x + r.w)
}
export const sideWindowsOf = room => {
  const r = rectOf(room)
  const { dy } = shiftOf(room)
  return (typeOf(room).sideWindows ?? []).map(([side, y, h]) => ({ x: side === 'west' ? r.x - 6 : r.x + r.w, y: y + dy, h, isLeft: side === 'west' }))
}

// The office: everything the rooms and their walls cover, fully grown.
export const WORLD = (() => {
  const frames = PLAN.rooms.map(fullFrameOf)
  const x = Math.min(...frames.map(f => f.x))
  const y = Math.min(...frames.map(f => f.y))
  return { x, y, w: Math.max(...frames.map(f => f.x + f.w)) - x, h: Math.max(...frames.map(f => f.y + f.h)) - y }
})()

// The hall's two lanes: helpers keep right, so going east they walk in the
// south half and going west in the north half.
export const laneOf = goingEast => {
  const r = rectOf(roomById('hall'))
  return goingEast ? r.y + r.h * 0.7 : r.y + r.h * 0.3
}

// ── The grounds ──────────────────────────────────────────────────────────
// Grass all round the office, so it fills the window: a garden between the
// house and the road, with a path from the front door to the street, a
// pond, a bench and a lawn. Helpers come
// up the path, and leave down it and along the pavement. Everything stays
// in one plane: the office grows across the grounds, never upwards.
export const GROUNDS = {
  // Everything the camera may show, in world units
  scene: { x: -820, y: -420, w: 2420, h: 1440 },
  // From the front door straight down to the pavement
  path: [[285, SOUTH + 256, 24, 820 - SOUTH - 254]],
  pavement: { y: 820, h: 16 },
  road: { y: 836, h: 44 },
  farPavement: { y: 880, h: 12 },
  // South of team room 1's lot
  pond: { x: -110, y: 716, rx: 84, ry: 44 },
  // West of the path, facing it
  bench: { x: 220, y: 676 },
  // Where helpers with no room inside sit: on the bench, two side by side,
  // then on the grass round it
  benchSpots: [{ x: 212, y: 682 }, { x: 229, y: 682 }, { x: 202, y: 660 }, { x: 236, y: 660 }],
  // A lawn east of the path where helpers off work stand and chat, two by
  // two, facing each other
  hangout: [[380, 662], [450, 690], [390, 730], [462, 760]].flatMap(([x, y]) => [{ x, y, facing: 'right' }, { x: x + 34, y, facing: 'left' }]),
  // Lamp posts along the pavement, every so often
  lamps: [-600, -440, -280, -120, 40, 200, 400, 560, 720, 880, 1040, 1200, 1360].map(x => ({ x, y: 824 })),
}

// ── Places, as the floor plan has them now ───────────────────────────────
// Every desk the rooms have room for now, in the order they are bought:
// team room 1's first three, the quiet room's four, then three for each
// step a team room grows. The steps are bought in order (CHAINS.team), so
// those that stand are always the first ones, and a new step only adds
// desks at the end.
const DESK_ORDER = [['team', 1], ['quiet', 1], ['team', 2], ['team', 3], ['team2', 1], ['team2', 2], ['team2', 3]]
const stepStands = (room, step) => isBuilt(room) && (step === 1 || ownsAny(room.grows?.[step - 2]?.buy))
export const deskSlots = () =>
  DESK_ORDER.flatMap(([id, step]) => {
    const room = roomById(id)
    return stepStands(room, step) ? typeOf(room).desks.filter(d => d.step === step).map(d => at(room, d)) : []
  })
export const ownedDesks = () => Math.min(deskSlots().length, store.state.game?.owned?.desks ?? deskSlots().length)
export const desks = () => deskSlots().slice(0, ownedDesks())

// The spots along the reception's walls, for helpers beyond the last desk
// the rooms have room for.
const wallSpots = () => roomsOf('reception').flatMap(room => (typeOf(room).floor ?? []).map(p => at(room, p)))

export const MAIN = (() => {
  const room = firstRoom('corner')
  return at(room, typeOf(room).claude)
})()
// Where Claude stands up from its chair, to walk somewhere.
export const MAIN_SPOT = { x: MAIN.cx, y: MAIN.dy - 6 }

export const coffeeSpot = () => {
  const room = firstRoom('kitchen')
  return room && isBuilt(room) ? at(room, typeOf(room).coffee) : null
}
export const handoffFor = seat => {
  const room = firstRoom('corner')
  return at(room, typeOf(room).handoff(seat))
}

// A room's spots of one kind (standing in the kitchen, stalls, hobbies),
// those its bought steps have.
export const spotsIn = (room, list) => (room && isBuilt(room) ? (list ?? []).filter(p => hasNow(room, p)).map(p => at(room, p)) : [])

// A helper's place: its desk, or, once the bought desks run out, a spot on
// the floor, where it works on a laptop and lets everyone know. Every spot
// follows from the seat number alone, never from how many desks are bought:
// a helper whose desk is not bought yet sits on the rug where it will
// stand, so buying a desk moves that one helper and nobody else. Beyond the
// last desk the rooms have room for, along the reception's walls; beyond
// those, outside on the bench by the path.
export const placeOf = seat => {
  const slots = deskSlots()
  const s = Math.max(0, seat)
  if (s < ownedDesks()) {
    const d = slots[s]
    return { isDesk: true, cx: d.cx, dy: d.dy, spot: { x: d.cx, y: d.dy - 6 } }
  }
  if (s < slots.length) return { isDesk: false, spot: { x: slots[s].cx - 22, y: slots[s].dy + 28 } }
  const walls = wallSpots()
  const n = s - slots.length
  if (n < walls.length) return { isDesk: false, spot: walls[n] }
  const bench = GROUNDS.benchSpots
  const k = n - walls.length
  if (k < bench.length) return { isDesk: false, isOutside: true, spot: bench[k] }
  // More than even the bench holds: standing about on the grass beside it.
  const m = k - bench.length
  return { isDesk: false, isOutside: true, spot: { x: GROUNDS.bench.x - 70 - (m % 4) * 18, y: GROUNDS.bench.y - 10 + Math.floor(m / 4) * 22 } }
}

// What can be bought, by its id: rooms and their steps, the ping-pong
// table in the lounge, decor.
// Each room's sign by its door on the hall: an icon and a name.
export const ROOM_NAMES = {
  team: ['👥', 'Teamrum 1'],
  team2: ['👥', 'Teamrum 2'],
  claude: ['✨', 'Claude'],
  meeting: ['📊', 'Mødelokale'],
  lounge: ['🛋️', 'Lounge'],
  reception: ['🛎️', 'Reception'],
  quiet: ['🤫', 'Stillerum'],
  kitchen: ['☕', 'Køkken'],
  toilet: ['🚻', 'Toilet'],
}

export const ITEMS = {
  desk: { name: 'Skrivebord', icon: '🪑', about: 'Hjælpere uden skrivebord sidder i receptionen med en laptop og brokker sig.' },
  'team1-2': { name: 'Teamrum 1, trin 2', icon: '🏗️', about: 'Teamrum 1 vokser mod vest med plads til tre skriveborde mere.' },
  'team1-3': { name: 'Teamrum 1, trin 3', icon: '🏗️', about: 'Teamrum 1 vokser endnu længere mod vest, ud på grunden: tre skriveborde mere.' },
  team2: { name: 'Teamrum 2', icon: '🏢', about: 'Et nyt teamrum over for det første, med plads til tre skriveborde.' },
  'team2-2': { name: 'Teamrum 2, trin 2', icon: '🏗️', about: 'Teamrum 2 vokser mod vest med plads til tre skriveborde mere.' },
  'team2-3': { name: 'Teamrum 2, trin 3', icon: '🏗️', about: 'Teamrum 2 vokser endnu længere mod vest: tre skriveborde mere, 22 i alt.' },
  kitchen: { name: 'Køkken', icon: '☕', about: 'En kaffemaskine og et lille bord. Claude holder kaffepause her i stedet for ved skrivebordet.' },
  'kitchen-2': { name: 'Køkken, trin 2', icon: '🍽️', about: 'Køkkenet vokser ind i depotet: et stort bord, køleskab og snackautomat.' },
  lounge: { name: 'Lounge', icon: '🛋️', about: 'En lounge med sofa og spillekonsol, hvor hjælperne med fri slapper af.' },
  'lounge-2': { name: 'Lounge, trin 2', icon: '🎱', about: 'Loungen vokser ind i depotet: pool-bord og dartskive.' },
  'lounge-3': { name: 'Lounge, trin 3', icon: '🎸', about: 'Loungen vokser ud på grunden mod øst: bar, arkademaskine, jukebox og en guitar.' },
  toilet: { name: 'Toilet', icon: '🚻', about: 'Et toilet med én bås. Hvem har ikke brug for det?' },
  'toilet-2': { name: 'Toilet, trin 2', icon: '🚻', about: 'En bås mere og en håndvask, mod øst.' },
  'toilet-3': { name: 'Toilet, trin 3', icon: '🚻', about: 'En tredje bås, ud på grunden mod øst. Ingen kø mere.' },
  pingpong: { name: 'Bordtennisbord', icon: '🏓', about: 'Et bordtennisbord i loungen, hvor to spiller i pauserne.', needs: 'lounge' },
  meeting: { name: 'Mødelokale', icon: '📊', about: 'Et mødelokale ved siden af Claude med et langt bord og en skærm på væggen.' },
  reception: { name: 'Reception', icon: '🛎️', about: 'Indretning af receptionen bag hoveddøren: skranke, sofa, logo og Bodil, der byder hjælperne velkommen og siger farvel.' },
  plants: { name: 'Planter overalt', icon: '🪴', about: 'Store planter i teamrummet, stillerummet og hos Claude.' },
  cat: { name: 'Kontorkat', icon: '🐈', about: 'En rød kat, der sover i receptionen, spiser i køkkenet og sætter sig hos Claude. Claude klapper den i pauserne.' },
  rugs: { name: 'Tæpper', icon: '🧶', about: 'Bløde tæpper under skrivebordene i teamrummene og stillerummet.' },
  art: { name: 'Kunst på væggene', icon: '🖼️', about: 'Malerier på væggene i teamrummet og hos Claude.' },
  neon: { name: 'Neonskilt', icon: '💡', about: 'Et lyserødt "SHIP IT" i teamrummet, der lyser om aftenen.' },
  espresso: { name: 'Espressomaskine', icon: '☕', about: 'En rigtig espressomaskine i køkkenet. Den damper hele dagen.' },
  aquarium: { name: 'Akvarium', icon: '🐠', about: 'Et akvarium med fisk i stillerummet.' },
  chairs: { name: 'Ergonomiske stole', icon: '💺', about: 'Bedre stole til alle skriveborde. Ryggen siger tak.' },
  screens: { name: 'Store skærme', icon: '🖥️', about: 'Brede skærme på alle skriveborde.' },
}
