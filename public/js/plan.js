// ── The floor plan ───────────────────────────────────────────────────────
// The office is a list of rooms. A room type knows its size and where things
// stand inside it: the desks, Claude's chair, the lamps, what is in the way.
// Those are written in the coordinates of the place the type was first drawn
// for, its home; a room placed elsewhere is shifted by the difference. So a
// room can stand anywhere, a new room only adds to the list, and the office
// is whatever the rooms cover. This file is the only place that knows the
// plan: the mod times every walk and lets the page find the way.
import { store, owns } from './store.js'

export const ROOM_TYPES = {
  // Claude's corner office
  corner: {
    home: { x: 6, y: 16 },
    w: 240,
    h: 116,
    topWall: 16,
    windows: [30, 120],
    claude: { cx: 128, dy: 78 },
    // Where a helper stands to hand over its result, right of Claude's desk
    handoff: seat => ({ x: 202 + (seat % 3) * 13, y: 82 + (Math.floor(seat / 3) % 2) * 14 }),
    board: { x: 196, y: 46, w: 44, h: 30 },
    plants: [[228, 36, true], [22, 116]],
    lights: [[70, 31, 44, 0.4]],
    bulbs: [[70, 31]],
    blocks: [[10, 22, 12, 84], [64, 77, 128, 30], [107, 60, 42, 22], [28, 22, 28, 24], [63, 24, 14, 14], [196, 46, 44, 30], [220, 28, 16, 18]],
  },
  kitchen: {
    home: { x: 252, y: 16 },
    w: 222,
    h: 116,
    topWall: 16,
    windows: [290, 390],
    coffee: { x: 318, y: 112 },
    // Where helpers stand with their coffee on a break: spread round the big
    // table, clear of stools and machines, two by two
    standing: [[334, 100, 'right'], [300, 128, 'right'], [412, 128, 'left'], [298, 76, 'right'], [340, 66, 'front']].map(([x, y, facing]) => ({ x, y, facing })),
    machine: { x: 270, y: 20 },
    clock: { x: 461, y: 8, r: 6 },
    plants: [[462, 120], [262, 120]],
    lights: [[368, 92, 64, 0.34], [276, 91, 30, 0.22]],
    blocks: [[256, 18, 150, 18], [440, 18, 28, 34], [436, 64, 32, 30], [344, 68, 48, 48], [267, 66, 18, 50]],
  },
  team: {
    home: { x: 6, y: 138 },
    w: 468,
    h: 240,
    desks: [0, 1, 2, 3, 4, 5].map(i => ({ cx: 92 + (i % 3) * 148, dy: 202 + Math.floor(i / 3) * 102 })),
    sideWindows: [[0, 284, 40], [474, 300, 40]],
    // Where a helper without a desk sits on the floor with its laptop
    floor: [[70, 372], [100, 372], [252, 372], [276, 372], [364, 372], [394, 372], [424, 372], [34, 278], [62, 278], [90, 278]].map(([x, y]) => ({ x, y })),
    // Clear of the doorway to the quiet room, between it and the ping-pong table
    plants: [[462, 150, true], [20, 150], [380, 368], [56, 368], [274, 368]],
    lights: [[130, 366, 54, 0.42, 'lamp', 'lounge'], [240, 147, 46, 0.4, 'neon', 'neon'], ...[[166, 200], [314, 200], [166, 300], [314, 300]].map(([x, y]) => [x, y, 66, 0.16, 'ceiling'])],
    bulbs: [[130, 366, 'lounge']],
    // Furniture bought for the room, and where its sign stands until then
    items: { lounge: { x: 180, y: 362 }, pingpong: { x: 316, y: 362 } },
    // The two ends of the ping-pong table
    pingpong: [{ x: 280, y: 364, facing: 'right' }, { x: 352, y: 364, facing: 'left' }],
    blocks: [
      // Desks, and the chairs behind them: walkers go round, not over people
      ...[0, 1, 2, 3, 4, 5].map(i => [50 + (i % 3) * 148, 201 + Math.floor(i / 3) * 102, 84, 30]),
      ...[0, 1, 2, 3, 4, 5].map(i => [71 + (i % 3) * 148, 184 + Math.floor(i / 3) * 102, 42, 22]),
      [8, 178, 14, 76], [14, 356, 30, 18], [138, 346, 84, 31], [290, 349, 52, 28], [452, 334, 16, 24],
    ],
  },
  toilet: {
    home: { x: 6, y: 514 },
    w: 114,
    h: 90,
    plants: [[108, 548]],
    // Inside each stall, out of sight
    stalls: [{ x: 34, y: 588 }, { x: 86, y: 588 }],
    lights: [[63, 559, 44, 0.18, 'ceiling']],
    blocks: [[8, 566, 104, 36], [70, 516, 46, 16]],
  },
  meeting: {
    home: { x: 126, y: 514 },
    w: 348,
    h: 90,
    plants: [[140, 528], [460, 528, true]],
    // Chairs round the long table: a row behind it, a row in front of it
    chairs: [
      ...[0, 1, 2, 3, 4, 5].map(i => ({ x: 190 + i * 44, y: 542, row: 'behind' })),
      ...[0, 1, 2, 3, 4, 5].map(i => ({ x: 190 + i * 44, y: 588, row: 'front', facing: 'back' })),
    ],
    head: { x: 154, y: 566, facing: 'right' },
    lights: [[240, 560, 54, 0.3], [360, 560, 54, 0.3]],
    blocks: [[168, 532, 264, 58], [424, 516, 40, 16]],
  },
  // The quiet room: four more desks, for when the team room is full
  quiet: {
    home: { x: 6, y: 384 },
    w: 468,
    h: 118,
    desks: [0, 1, 2, 3].map(i => ({ cx: 72 + i * 112, dy: 440 })),
    plants: [[460, 400, true], [18, 400]],
    lights: [[128, 440], [240, 440], [352, 440]].map(([x, y]) => [x, y, 66, 0.16, 'ceiling']),
    // The aquarium along the top wall, right of the door from the team room
    // so the doorway stays free: x, y, width, height
    aquarium: [330, 388, 64, 14],
    // The desks and chairs, and the aquarium's place by the wall
    blocks: [...[0, 1, 2, 3].flatMap(i => [[30 + i * 112, 439, 84, 30], [51 + i * 112, 422, 42, 22]]), [330, 388, 64, 14]],
  },
}

export const PLAN = {
  rooms: [
    { id: 'claude', type: 'corner', x: 6, y: 16 },
    { id: 'kitchen', type: 'kitchen', x: 252, y: 16, buy: 'kitchen' },
    { id: 'team', type: 'team', x: 6, y: 138 },
    { id: 'quiet', type: 'quiet', x: 6, y: 384 },
    { id: 'toilet', type: 'toilet', x: 6, y: 514, buy: 'toilet' },
    { id: 'meeting', type: 'meeting', x: 126, y: 514, buy: 'meeting' },
  ],
  // Openings in the walls, in world units, between two rooms (open once
  // both are built), and the front door.
  doors: [
    { x: 246, y: 90, w: 6, h: 32, colour: '#CDB892', between: ['claude', 'kitchen'] },
    { x: 196, y: 132, w: 40, h: 6, colour: '#CDB892', between: ['claude', 'team'] },
    { x: 300, y: 132, w: 40, h: 6, colour: '#D5DAD2', between: ['kitchen', 'team'] },
    { x: 214, y: 378, w: 48, h: 6, colour: '#C3CCD6', between: ['team', 'quiet'] },
    { x: 18, y: 502, w: 40, h: 12, colour: '#C3CCD6', between: ['quiet', 'toilet'] },
    { x: 280, y: 502, w: 48, h: 12, colour: '#C3CCD6', between: ['quiet', 'meeting'] },
    { x: 474, y: 236, w: 6, h: 40, colour: '#8C6B4A', isEntrance: true, between: ['team'] },
  ],
  entrance: { x: 478, y: 256 },
  doormat: [462, 242, 12, 28],
}

export const typeOf = room => ROOM_TYPES[room.type]
export const roomById = id => PLAN.rooms.find(r => r.id === id) ?? null
export const isBuilt = room => owns(room.buy)
// A door opens once every room it joins stands.
export const isOpenDoor = door => (door.between ?? []).every(id => roomById(id) && isBuilt(roomById(id)))
export const shiftOf = room => ({ dx: room.x - typeOf(room).home.x, dy: room.y - typeOf(room).home.y })
export const roomsOf = type => PLAN.rooms.filter(r => r.type === type)
export const firstRoom = type => roomsOf(type)[0] ?? null
// A point of a room type, where it stands in this room.
export const at = (room, p) => {
  const { dx, dy } = shiftOf(room)
  return 'cx' in p ? { ...p, cx: p.cx + dx, dy: p.dy + dy } : { ...p, x: p.x + dx, y: p.y + dy }
}
export const frameOf = room => {
  const t = typeOf(room)
  return { x: room.x - 6, y: room.y - (t.topWall ?? 6), w: t.w + 12, h: t.h + (t.topWall ?? 6) + 6 }
}

// The office: everything the rooms and their walls cover.
export const WORLD = (() => {
  const frames = PLAN.rooms.map(frameOf)
  const x = Math.min(...frames.map(f => f.x))
  const y = Math.min(...frames.map(f => f.y))
  return { x, y, w: Math.max(...frames.map(f => f.x + f.w)) - x, h: Math.max(...frames.map(f => f.y + f.h)) - y }
})()

// ── The grounds ──────────────────────────────────────────────────────────
// Grass all round the office, so it fills the window: a path from the front
// door to the street, a road along the bottom, a pond, trees. Helpers come
// up the last bit of the path, and leave down it and along the pavement.
// Everything stays in one plane: the office grows across the grounds, never
// upwards.
export const GROUNDS = {
  // Everything the camera may show, in world units
  scene: { x: -920, y: -560, w: 2320, h: 1740 },
  // From the front door east, then south to the pavement
  path: [[480, 244, 84, 24], [540, 244, 24, 434]],
  pavement: { y: 676, h: 16 },
  road: { y: 692, h: 44 },
  farPavement: { y: 736, h: 12 },
  pond: { x: -250, y: 300, rx: 84, ry: 48 },
  bench: { x: 598, y: 226 },
  // Where helpers with no room inside sit: on the bench, two side by side,
  // then on the grass round it
  benchSpots: [{ x: 590, y: 232 }, { x: 607, y: 232 }, { x: 578, y: 212 }, { x: 618, y: 212 }],
  // A lawn east of the path where helpers off work stand and chat, two by
  // two, facing each other
  hangout: [[630, 312], [700, 342], [640, 384], [712, 414]].flatMap(([x, y]) => [{ x, y, facing: 'right' }, { x: x + 34, y, facing: 'left' }]),
  // The walk between the front door and the street: out of the door, to
  // the corner of the path, down to the pavement
  walkway: [{ x: 478, y: 256 }, { x: 552, y: 256 }, { x: 552, y: 684 }],
  // Lamp posts along the pavement, every so often
  lamps: [-560, -400, -240, -80, 80, 240, 400, 620, 780, 940, 1100].map(x => ({ x, y: 680 })),
}

// ── Places, as the floor plan has them now ───────────────────────────────
// Every desk the rooms have room for, and how many of them are bought (all of
// them before the server tells).
export const deskSlots = () => PLAN.rooms.filter(room => typeOf(room).desks).flatMap(room => typeOf(room).desks.map(d => at(room, d)))
export const ownedDesks = () => Math.min(deskSlots().length, store.state.game?.owned?.desks ?? deskSlots().length)
export const desks = () => deskSlots().slice(0, ownedDesks())

// The spots along the walls, for helpers beyond the last desk the rooms
// have room for.
const wallSpots = () => roomsOf('team').flatMap(room => (typeOf(room).floor ?? []).map(p => at(room, p)))

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

// A helper's place: its desk, or, once the bought desks run out, a spot on
// the floor, where it works on a laptop and lets everyone know. Every spot
// follows from the seat number alone, never from how many desks are bought:
// a helper whose desk is not bought yet sits on the rug where it will
// stand, so buying a desk moves that one helper and nobody else. Beyond the
// last desk the rooms have room for, along the walls; beyond those, outside
// on the bench by the path.
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
  return { isDesk: false, isOutside: true, spot: { x: GROUNDS.bench.x + 40 + (m % 4) * 18, y: GROUNDS.bench.y - 20 + Math.floor(m / 4) * 22 } }
}

// What can be bought, by its id: rooms, the team room's furniture, decor.
export const ITEMS = {
  desk: { name: 'Skrivebord', icon: '🪑', about: 'Hjælpere uden skrivebord sidder på gulvet med en laptop og brokker sig.' },
  kitchen: { name: 'Køkken', icon: '☕', about: 'Claude holder kaffepause i køkkenet i stedet for ved skrivebordet.' },
  toilet: { name: 'Toilet', icon: '🚻', about: 'Et toilet med to båse og en håndvask. Hvem har ikke brug for det?' },
  lounge: { name: 'Sofahjørne', icon: '🛋️', about: 'En sofa, et sofabord og en lampe i teamrummet.' },
  pingpong: { name: 'Bordtennisbord', icon: '🏓', about: 'Et bordtennisbord i teamrummet.' },
  meeting: { name: 'Mødelokale', icon: '📊', about: 'Et mødelokale med et langt bord og en skærm på væggen.' },
  plants: { name: 'Planter overalt', icon: '🪴', about: 'Store planter i teamrummet og stillerummet.' },
  art: { name: 'Kunst på væggene', icon: '🖼️', about: 'Malerier på væggene i teamrummet og hos Claude.' },
  neon: { name: 'Neonskilt', icon: '💡', about: 'Et lyserødt "SHIP IT" over teamrummet, der lyser om aftenen.' },
  espresso: { name: 'Espressomaskine', icon: '☕', about: 'En rigtig espressomaskine i køkkenet. Den damper hele dagen.' },
  aquarium: { name: 'Akvarium', icon: '🐠', about: 'Et akvarium med fisk i stillerummet.' },
  chairs: { name: 'Ergonomiske stole', icon: '💺', about: 'Bedre stole til alle skriveborde. Ryggen siger tak.' },
  screens: { name: 'Store skærme', icon: '🖥️', about: 'Brede skærme på alle skriveborde.' },
}
