// The page's logic, without a browser: the floor plan, the routes, breaks
// and meetings, the trees outside and the activity log. Only the modules
// that draw nothing are loaded.
//
//   node --test tests/page.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'

const js = name => new URL(`../public/js/${name}.js`, import.meta.url).href
const { store } = await import(js('store'))
const plan = await import(js('plan'))
const routes = await import(js('routes'))
const breaks = await import(js('breaks'))
const scenery = await import(js('scenery'))
const { eventsBetween } = await import(js('activity'))
const idle = await import(js('idle'))
const voices = await import(js('voices'))
const util = await import(js('util'))
const cat = await import(js('cat'))

const { PLAN, WORLD, GROUNDS, CHAINS, typeOf, frameOf, fullFrameOf, rectOf, deskSlots, desks, placeOf } = plan
const STEPS = Object.values(CHAINS).flat()
const ALL_ROOMS = ['claude', 'team', ...STEPS, 'pingpong', 'meeting', 'plants', 'rugs', 'cat', 'art', 'neon', 'espresso', 'aquarium', 'chairs', 'screens', 'reception']
const owning = (rooms, deskCount) => {
  store.state = { sessions: [], game: { owned: { rooms, desks: deskCount }, kroner: 0, next: {} } }
}
const everything = () => owning(ALL_ROOMS, 22)
const startOffice = () => owning(['claude', 'team'], 2)
// Offices on the way: each chain bought up to a step, the rest not
const LAYOUTS = [
  ['claude', 'team'],
  ['claude', 'team', 'team1-2', 'kitchen', 'toilet', 'lounge', 'meeting'],
  ['claude', 'team', 'team1-2', 'team1-3', 'team2', 'kitchen', 'kitchen-2', 'lounge', 'lounge-2', 'toilet', 'toilet-2', 'meeting', 'reception', 'pingpong'],
  ['claude', 'team', 'team1-2', 'team1-3', 'team2', 'team2-2', 'lounge', 'lounge-2', 'lounge-3', 'toilet', 'toilet-2', 'toilet-3'],
  ALL_ROOMS,
]
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
const helper = (id, extra = {}) => ({ id, name: id, task: `Opgave ${id}`, seat: 0, phase: 'working', since: 0, activity: { state: 'working', detail: 'Tænker' }, ...extra })

// ── The floor plan ───────────────────────────────────────────────────────

test('every room lies inside the office, fully grown, and no two rooms that stand overlap', () => {
  for (const room of PLAN.rooms) {
    const f = fullFrameOf(room)
    assert.ok(f.x >= WORLD.x && f.y >= WORLD.y && f.x + f.w <= WORLD.x + WORLD.w && f.y + f.h <= WORLD.y + WORLD.h, room.id)
  }
  for (const rooms of LAYOUTS) {
    owning(rooms, 0)
    const standing = PLAN.rooms.filter(plan.isBuilt)
    for (const [i, a] of standing.entries()) {
      for (const b of standing.slice(i + 1)) assert.ok(!overlaps(frameOf(a), rectOf(b)) && !overlaps(rectOf(a), frameOf(b)), `${a.id} and ${b.id} with ${rooms.join(',')}`)
    }
  }
})

test('every room opens on the hall, and a depot stands until its step is bought', () => {
  for (const room of PLAN.rooms.filter(r => r.id !== 'hall' && !r.until)) {
    assert.ok(PLAN.doors.some(d => d.between?.includes(room.id) && d.between.includes('hall')) || room.id === 'reception', room.id)
  }
  startOffice()
  assert.equal(plan.isBuilt(plan.roomById('kitchen-depot')), true)
  owning(['claude', 'team', 'kitchen', 'kitchen-2'], 0)
  assert.equal(plan.isBuilt(plan.roomById('kitchen-depot')), false)
  assert.equal(rectOf(plan.roomById('kitchen')).w, 260, 'the kitchen has grown into it')
})

test('a room grows by its steps, and has only the furniture they cover', () => {
  startOffice()
  const team = plan.roomById('team')
  assert.equal(rectOf(team).x, 0)
  owning(['claude', 'team', 'team1-2', 'lounge'], 0)
  assert.equal(rectOf(team).x, -130)
  const lounge = plan.roomById('lounge')
  const hobbies = Object.entries(typeOf(lounge).hobbies).filter(([, spots]) => plan.spotsIn(lounge, spots).length).map(([kind]) => kind)
  assert.deepEqual(hobbies.sort(), ['gaming', 'sofa'])
  owning(['claude', 'team', 'lounge', 'lounge-2', 'lounge-3'], 0)
  assert.equal(Object.values(typeOf(lounge).hobbies).every(spots => plan.spotsIn(lounge, spots).length === spots.length), true)
})

test('every door joins rooms that exist, and the front door opens to the path', () => {
  for (const door of PLAN.doors) for (const id of door.between ?? [door.closed]) assert.ok(plan.roomById(id), id)
  const front = PLAN.doors.find(d => d.isEntrance)
  assert.ok(front)
  assert.deepEqual(plan.walkway()[0], plan.entrance())
  assert.ok(GROUNDS.path.some(p => util.isIn(plan.walkway()[1].x, plan.walkway()[1].y, p)), 'the corner is on the path')
})

test('22 desks in all, three more for each step a team room grows; only the bought ones are used', () => {
  everything()
  assert.equal(deskSlots().length, 22)
  startOffice()
  assert.equal(deskSlots().length, 7, 'three in team room 1 and four in the quiet room')
  owning(['claude', 'team', 'team1-2'], 0)
  const before = deskSlots()
  owning(['claude', 'team', 'team1-2', 'team1-3'], 0)
  assert.deepEqual(deskSlots().slice(0, before.length), before, 'a new step only adds desks at the end')
  assert.equal(deskSlots().length, 13)
  owning(['claude', 'team'], 4)
  assert.equal(desks().length, 4)
  assert.equal(placeOf(3).isDesk, true)
  assert.equal(placeOf(4).isDesk, false)
})

test('helpers without a desk each get their own spot, then wait on the bench outside', () => {
  startOffice()
  const places = Array.from({ length: 30 }, (_, seat) => placeOf(seat))
  const keys = places.map(p => `${p.spot.x},${p.spot.y}`)
  assert.equal(new Set(keys).size, keys.length, 'no two helpers share a spot')
  const firstOutside = places.findIndex(p => p.isOutside)
  assert.equal(firstOutside, deskSlots().length + 10, 'inside first: every desk, then the walls')
  assert.deepEqual(places[firstOutside].spot, GROUNDS.benchSpots[0])
  assert.ok(places.slice(firstOutside).every(p => p.isOutside && routes.isOutdoors(p.spot)))
})

test('buying a desk moves only the helper whose desk it is', () => {
  owning(['claude', 'team'], 3)
  const before = Array.from({ length: 14 }, (_, seat) => placeOf(seat).spot)
  owning(['claude', 'team'], 4)
  const after = Array.from({ length: 14 }, (_, seat) => placeOf(seat).spot)
  const moved = before.map((spot, seat) => (spot.x !== after[seat].x || spot.y !== after[seat].y ? seat : null)).filter(seat => seat !== null)
  assert.deepEqual(moved, [3])
  assert.equal(placeOf(3).isDesk, true)
})

test('a helper on the bench goes in by the path and the front door', () => {
  startOffice()
  const bench = GROUNDS.benchSpots[0]
  const points = routes.route(bench, plan.handoffFor(0))
  assert.deepEqual(points[1], plan.walkway()[1])
  assert.deepEqual(points[2], plan.walkway()[0])
})

// ── Routes and walks ─────────────────────────────────────────────────────

test('no route goes through a wall or a depot, in the office you start with, on the way, or full grown', () => {
  for (const rooms of LAYOUTS) {
    owning(rooms, 10)
    const result = routes.checkRoutes()
    assert.ok(result.checked > 50)
    assert.deepEqual(result.problems, [], rooms.join(','))
  }
})

test('from one room to another a walk goes by the hall, in the lane on its right', () => {
  everything()
  const hall = rectOf(plan.roomById('hall'))
  const inHall = p => util.isIn(p.x, p.y, [hall.x, hall.y, hall.w, hall.h])
  const walk = routes.route(placeOf(0).spot, plan.handoffFor(0))
  const along = walk.slice(1).map((p, i) => [walk[i], p]).filter(([a, b]) => inHall(a) && inHall(b) && a.y === b.y && a.x !== b.x)
  assert.ok(along.length > 0, 'it uses the hall')
  for (const [a, b] of along) assert.equal(a.y, plan.laneOf(b.x > a.x), 'east in the south lane, west in the north lane')
  // Out of team room 2 and into the meeting room: never through Claude's office
  const claude = rectOf(plan.roomById('claude'))
  for (const p of routes.route(placeOf(13).spot, { x: 600, y: 180 })) assert.ok(!util.isIn(p.x, p.y, [claude.x, claude.y, claude.w, claude.h]), `${p.x},${p.y}`)
})

test('walks go at one pace: a short one ends early, a long one is brisker to fit', () => {
  everything()
  const short = [{ x: 0, y: 0 }, { x: 80, y: 0 }]
  assert.equal(routes.walkMs(short, 10_000), 80 / routes.SPEED)
  const long = [{ x: 0, y: 0 }, { x: 5000, y: 0 }]
  assert.equal(routes.walkMs(long, 10_000), 10_000)
  // With a result, a helper stays at its desk until it is time to set off,
  // and reaches Claude just as the handover begins.
  const walks = routes.WALKS
  const sub = helper('a', { phase: 'delivering', since: 0, seat: 0 })
  assert.equal(routes.poseOf(sub, 10).seated, true)
  const there = routes.poseOf(sub, walks.deliver - 1)
  const spot = plan.handoffFor(0)
  assert.ok(Math.hypot(there.x - spot.x, there.y - spot.y) < 2)
})

test('no route crosses a lot that is not built', () => {
  owning(['claude', 'team', 'kitchen'], 6)
  const lots = PLAN.rooms.filter(r => !plan.isBuilt(r)).map(r => [r.x + 4, r.y + 4, typeOf(r).w - 8, typeOf(r).h - 8])
  for (let seat = 0; seat < 10; seat++) {
    for (const p of routes.route(placeOf(seat).spot, plan.handoffFor(seat))) assert.ok(!lots.some(l => util.isIn(p.x, p.y, l)), `seat ${seat}`)
  }
})

test('a walk starts at the start, ends at the end, and is halfway at half time', () => {
  const points = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]
  assert.deepEqual(routes.walkAt(points, 0), { x: 0, y: 0, facing: 'right', isWalking: true })
  const end = routes.walkAt(points, 1)
  assert.equal(end.isWalking, false)
  assert.deepEqual([end.x, end.y], [10, 10])
  const half = routes.walkAt(points, 0.5)
  assert.deepEqual([half.x, half.y, half.facing], [10, 0, 'front'])
})

test('a helper comes up the path, sits, hands over, and walks out', () => {
  startOffice()
  const walks = routes.WALKS
  const arriving = helper('a', { phase: 'arriving', since: 1000 })
  const first = routes.poseOf(arriving, 1000)
  assert.deepEqual([first.x, first.y], [plan.walkway()[1].x, plan.walkway()[1].y], 'starts on the path outside')
  assert.equal(routes.poseOf(arriving, 1000 + walks.arrive).seated, true)
  assert.equal(routes.poseOf(helper('a'), 5000).seated, true)
  const delivering = helper('a', { phase: 'delivering', since: 0 })
  assert.equal(routes.poseOf(delivering, walks.deliver + 10).handover, true)
  assert.equal(routes.poseOf(delivering, walks.deliver + walks.handover + walks.leave + 1), null)
})

test('out of the door a helper walks down the path and off along the pavement', () => {
  const walks = routes.WALKS
  const out = routes.outAt(helper('b', { phase: 'leaving', since: 100 }), walks)
  assert.equal(out, 100 + walks.leave)
  assert.equal(routes.outAt(helper('b'), walks), null)
  assert.equal(routes.homewardPose('b', out, out - 1), null)
  assert.equal(routes.homewardPose('b', out, out + routes.HOMEWARD_MS), null)
  const late = routes.homewardPose('b', out, out + routes.HOMEWARD_MS * 0.95)
  assert.equal(late.y, plan.walkway()[2].y, 'on the pavement at the end')
  assert.ok(Math.abs(late.x - plan.walkway()[2].x) > 300, 'well along it')
})

// ── Breaks and meetings ──────────────────────────────────────────────────

// A time inside a break (every three minutes, from 20 s in, here 200 s into
// a ten-minute slot, clear of its meeting) and one inside a meeting (every
// ten minutes, from a minute in).
const BREAK = 180_000 * 50_001 + 20_000 + 4000
const MEETING = 600_000 * 20_000 + 60_000 + 4000
const team = (count, extra = () => ({})) => Array.from({ length: count }, (_, i) => helper(`h${i}`, { seat: i, since: 0, ...extra(i) }))

test('breaks are the same every time for the same helpers and time', () => {
  everything()
  const subs = team(8)
  const a = breaks.breakNow(subs, BREAK, routes.WALKS, null)
  const b = breaks.breakNow(subs, BREAK, routes.WALKS, null)
  assert.ok(a.errands.size > 0)
  assert.deepEqual([...a.errands.entries()], [...b.errands.entries()])
})

test('nobody takes a break while waiting for you, or with nowhere to go', () => {
  everything()
  const waiting = team(8, () => ({ activity: { state: 'waiting', detail: 'Venter på din godkendelse' } }))
  assert.equal(breaks.breakNow(waiting, BREAK, routes.WALKS, null).errands.size, 0)
  startOffice()
  assert.equal(breaks.breakNow(team(8), BREAK, routes.WALKS, null).errands.size, 0)
})

test('ping-pong only with the table bought, and always two at it', () => {
  owning(['claude', 'team', 'kitchen'], 6)
  for (let slot = 0; slot < 40; slot++) {
    const kinds = [...breaks.breakNow(team(8), 180_000 * slot + 24_000, routes.WALKS, null)?.errands.values() ?? []].map(e => e.kind)
    assert.ok(!kinds.includes('pingpong'))
  }
  everything()
  for (let slot = 0; slot < 40; slot++) {
    const players = [...breaks.breakNow(team(8), 180_000 * slot + 24_000, routes.WALKS, null)?.errands.values() ?? []].filter(e => e.kind === 'pingpong')
    assert.ok(players.length === 0 || players.length === 2, `slot ${slot}`)
  }
})

test('a meeting needs the meeting room and three helpers', () => {
  const main = { state: 'working', detail: 'Tænker' }
  owning(['claude', 'team', 'kitchen'], 6)
  assert.equal(breaks.meetingNow(team(5), MEETING, routes.WALKS, main), null)
  everything()
  assert.equal(breaks.meetingNow(team(2), MEETING, routes.WALKS, main), null)
  const meeting = breaks.meetingNow(team(5), MEETING, routes.WALKS, main)
  assert.equal(meeting.seats.size, 5)
  assert.equal(meeting.withClaude, true)
  assert.equal(breaks.meetingNow(team(5), MEETING, routes.WALKS, { state: 'waiting', detail: 'x' }).withClaude, false)
})

test('an errand walks there, stays, and walks back', () => {
  everything()
  const home = placeOf(0).spot
  const dest = plan.spotsIn(plan.roomById('kitchen'), typeOf(plan.roomById('kitchen')).standing)[0]
  const errand = { kind: 'coffee', start: 0, stay: breaks.STAY.coffee, dest }
  const go = routes.walkMs(routes.route(home, dest), 14_000)
  const come = routes.walkMs(routes.route(dest, home), 14_000)
  assert.equal(breaks.errandPose(home, errand, -1), null)
  assert.equal(breaks.errandPose(home, errand, go - 10).isThere, undefined)
  assert.equal(breaks.errandPose(home, errand, go + 10).isThere, true)
  assert.equal(breaks.errandPose(home, errand, go + breaks.STAY.coffee + come), null)
})

test('who goes where on a break or to a meeting is settled when it begins', () => {
  everything()
  const subs = team(8)
  const lineups = new Map()
  const before = breaks.breakNow(subs, BREAK, routes.WALKS, null, lineups)
  assert.ok(before.errands.size >= 2)
  // One of them finishes mid-break: the others keep their errands, as they were
  const [first] = before.errands.keys()
  const later = subs.map(sub => (sub.id === first ? { ...sub, phase: 'delivering', since: BREAK + 1000 } : sub))
  const after = breaks.breakNow(later, BREAK + 5000, routes.WALKS, null, lineups)
  assert.deepEqual([...after.errands.entries()], [...before.errands.entries()])
  // A meeting stays when one of its three leaves
  const three = team(3)
  const m1 = breaks.meetingNow(three, MEETING, routes.WALKS, { state: 'working' }, lineups)
  const m2 = breaks.meetingNow(three.slice(1), MEETING + 2000, routes.WALKS, { state: 'working' }, lineups)
  assert.equal(m2.seats.size, m1.seats.size)
})

test('no break starts round a meeting', () => {
  everything()
  for (let k = 0; k < 10; k++) {
    const start = 1_800_000 * 1000 + k * 180_000 + 20_000
    const pause = breaks.breakNow(team(8), start + 1000, routes.WALKS, null)
    const meetings = [60_000, 660_000, 1_260_000].map(m => 1_800_000 * 1000 + m)
    const isNear = meetings.some(m => start < m + 53_000 && m < start + 61_000)
    assert.equal(pause === null, isNear, `break ${k}`)
  }
})

test('off work, nobody takes a spot a break is using', () => {
  everything()
  const kitchen = plan.roomById('kitchen')
  const spots = plan.spotsIn(kitchen, typeOf(kitchen).standing).concat(plan.spotsIn(plan.roomById('lounge'), typeOf(plan.roomById('lounge')).pingpong))
  const taken = new Set(spots.map(p => `${p.x},${p.y}`))
  for (let k = 0; k < 30; k++) {
    const used = [...idle.idlePlan(team(9, () => ({ phase: 'idle' })), k * idle.IDLE_SLOT_MS + 1, taken).values()]
    assert.ok(used.every(p => !taken.has(`${p.spot.x},${p.spot.y}`)), `slot ${k}`)
    assert.ok(used.every(p => p.kind !== 'pingpong' && p.kind !== 'coffee'))
  }
})

test('a phase that arrives a little late begins when it is seen; one seen long after keeps its time', () => {
  const seen = new Map()
  const at = 1_000_000
  const sessions = [{ key: 's', subs: [helper('a', { phase: 'delivering', since: at - 900 }), helper('b', { phase: 'working', since: at - 60_000 })] }]
  const [first] = routes.settle(sessions, seen, at)
  assert.equal(first.subs[0].since, at, 'late by 0.9 s: starts now')
  assert.equal(first.subs[1].since, at - 60_000, 'seen a minute after: kept')
  const [again] = routes.settle(sessions, seen, at + 3000)
  assert.equal(again.subs[0].since, at, 'the same phase keeps the time it was first seen')
  routes.settle([{ key: 's', subs: [] }], seen, at + 4000)
  assert.equal(seen.size, 0, 'forgotten once gone')
})

test('banter needs two in the kitchen, and only they and their colleagues speak', () => {
  everything()
  const subs = team(4)
  assert.equal(breaks.banterFor(subs.slice(0, 1), subs, 3, new Set()), null)
  for (let slot = 0; slot < 30; slot++) {
    const lines = breaks.banterFor(subs.slice(0, 2), subs, slot, new Set())
    assert.ok(lines.length >= 2)
    for (const [who, text] of lines) {
      assert.ok(subs.includes(who))
      assert.equal(typeof text, 'string')
    }
  }
})

// ── Off work ─────────────────────────────────────────────────────────────

test('helpers off work each get their own spot, and ping-pong is always two', () => {
  everything()
  const subs = team(9, () => ({ phase: 'idle' }))
  for (let k = 0; k < 40; k++) {
    const plan = idle.idlePlan(subs, k * idle.IDLE_SLOT_MS + 1000)
    assert.equal(plan.size, 9)
    const spots = [...plan.values()].map(p => `${p.spot.x},${p.spot.y}`)
    assert.equal(new Set(spots).size, spots.length, `slot ${k}: no two on one spot`)
    const players = [...plan.values()].filter(p => p.kind === 'pingpong').length
    assert.ok(players === 0 || players === 2)
  }
})

test('with nothing bought, helpers off work hang out on the lawn', () => {
  startOffice()
  const plan = idle.idlePlan(team(5, () => ({ phase: 'idle' })), 123_456)
  assert.ok([...plan.values()].every(p => p.kind === 'garden'))
  for (const p of plan.values()) assert.ok(!scenery.isClear(p.spot.x, p.spot.y), 'no tree on the lawn')
})

test('called on again, a helper walks back to its desk from where it was idling', () => {
  startOffice()
  const lawn = GROUNDS.hangout[0]
  const back = helper('z', { phase: 'arriving', from: 'idle', since: 0, seat: 0 })
  const first = routes.poseOf(back, 0, routes.WALKS, lawn)
  assert.deepEqual([first.x, first.y], [lawn.x, lawn.y])
  const home = helper('z', { phase: 'leaving', from: 'idle', since: 0 })
  const out = routes.poseOf(home, 0, routes.WALKS, lawn)
  assert.deepEqual([out.x, out.y], [lawn.x, lawn.y])
  assert.equal(routes.poseOf(helper('z', { phase: 'idle' }), 0).isIdle, true)
})

test('every name has a temperament, and all four are in use', () => {
  const names = ['Freja', 'Oskar', 'Ida', 'Malthe', 'Alma', 'Viggo', 'Clara', 'Emil', 'Karla', 'Storm', 'Lærke', 'Bertil']
  const tempers = new Set(names.map(voices.temperOf))
  assert.equal(tempers.size, 4)
  for (const name of names) assert.equal(typeof voices.grumbleAt(name, 0, 0), 'string')
  assert.equal(voices.grumbleAt('Freja', 5000, 0), null, 'quiet between the grumbles')
})

// ── Outside ──────────────────────────────────────────────────────────────

test('trees grow on the grass, never on the office, the path, the road or the pond', () => {
  const s = GROUNDS.scene
  assert.ok(scenery.TREES.length > 150)
  for (const t of scenery.TREES) {
    assert.ok(scenery.isClear(t.x, t.y), `${Math.round(t.x)},${Math.round(t.y)}`)
    assert.ok(util.isIn(t.x, t.y, [s.x, s.y, s.w, s.h]))
    assert.ok(!util.isIn(t.x, t.y, [WORLD.x - 20, WORLD.y - 20, WORLD.w + 40, WORLD.h + 40]))
  }
  const ys = scenery.TREES.map(t => t.y)
  assert.deepEqual(ys, [...ys].sort((a, b) => a - b), 'drawn back to front')
})

test('the walk to and from the street stays on the path', () => {
  for (const p of routes.homewardRoute('x').slice(0, 3)) assert.ok(!scenery.isClear(p.x, p.y), `${p.x},${p.y} is kept clear`)
})

// ── The activity log ─────────────────────────────────────────────────────

const session = (subs, extra = {}) => ({ key: 's1', project: 'kontor', main: { state: 'working', detail: 'Tænker' }, subs, party: null, ...extra })
const game = (extra = {}) => ({ kroner: 0, bought: [], achievements: [], ...extra })

test('the first state after a load is not news', () => {
  assert.deepEqual(eventsBetween({ sessions: [], game: null }, { sessions: [session([helper('a')])], game: game() }), [])
})

test('the log hears who comes in, hands over and gets stuck', () => {
  const before = { sessions: [session([helper('a'), helper('b')])], game: game() }
  const after = {
    sessions: [session([helper('a', { phase: 'delivering' }), helper('b', { phase: 'delivering', outcome: 'failed' }), helper('c', { phase: 'arriving' })])],
    game: game(),
  }
  const kinds = eventsBetween(before, after, 5).map(e => [e.kind, e.text])
  assert.deepEqual(kinds, [
    ['deliver', 'a afleverede: Opgave a'],
    ['stuck', 'b gik i stå: Opgave b'],
    ['arrive', 'c kom ind: Opgave c'],
  ])
})

test('the log hears of tests, waiting, new sessions, purchases and achievements', () => {
  const before = { sessions: [session([])], game: game({ bought: [{ at: 1, item: 'desk', price: 800 }], achievements: [{ id: 'x', name: 'X', reward: 10, at: null }] }) }
  const after = {
    sessions: [
      session([], { main: { state: 'waiting', detail: 'Venter på din godkendelse' }, party: { kind: 'confetti', label: 'Testene er grønne', who: 'main', at: 9 } }),
      { ...session([]), key: 's2', project: 'andet' },
    ],
    game: game({ bought: [{ at: 1, item: 'desk', price: 800 }, { at: 2, item: 'kitchen', price: 3000 }], achievements: [{ id: 'x', name: 'X', reward: 10, at: 3 }] }),
  }
  const texts = eventsBetween(before, after, 5).map(e => e.text)
  assert.deepEqual(texts, ['Testene er grønne', 'Claude venter på dig: Venter på din godkendelse', 'Ny session: andet', 'Købt: Køkken for 3.000 kr', 'Præstation: X (+10 kr)'])
  assert.deepEqual(eventsBetween(after, after, 6), [], 'nothing twice')
})

test('the log hears when a helper off work is called back or goes home', () => {
  const before = { sessions: [session([helper('a', { phase: 'idle' }), helper('b', { phase: 'idle' })])], game: game() }
  const after = { sessions: [session([helper('a', { phase: 'arriving', from: 'idle' }), helper('b', { phase: 'leaving', from: 'idle' })])], game: game() }
  assert.deepEqual(eventsBetween(before, after, 1).map(e => e.text), ['a er tilbage på arbejde', 'b gik hjem'])
})

test('the log hears of the daily bonus once', () => {
  const before = { sessions: [], game: game({ streak: { count: 1, isToday: false, at: 1 } }) }
  const after = { sessions: [], game: game({ streak: { count: 3, isToday: true, bonus: 45, at: 2 } }) }
  assert.deepEqual(eventsBetween(before, after, 3).map(e => e.text), ['Dagens bonus: +45 kr (3 dage i træk)'])
  assert.deepEqual(eventsBetween(after, after, 4), [])
})

// ── Small helpers ────────────────────────────────────────────────────────

test('kroner are written the Danish way', () => {
  assert.equal(util.kr(12345.9), '12.345 kr')
  assert.equal(util.clip('abcdef', 4), 'abc…')
})

test('helpers with neighbouring ids still look different', () => {
  const picks = Array.from({ length: 6 }, (_, i) => util.stir(util.hashOf(`agent-${i}`), 1) % 6)
  assert.ok(new Set(picks).size >= 3)
})

test('everything the server sells has a name, an icon and a text in the shop', async () => {
  // The names the server has prices for, read from its source.
  const server = (await import('node:fs')).readFileSync(new URL('../server/server.mjs', import.meta.url), 'utf8')
  const keysOf = name => [...new RegExp(`const ${name} = \{([^}]*)\}`).exec(server)[1].matchAll(/'?([\w-]+)'?:/g)].map(m => m[1])
  const prices = ['desk', ...keysOf('ROOM_PRICES'), ...keysOf('DECOR_PRICES')]
  assert.ok(prices.includes('reception') && prices.includes('screens') && prices.includes('team2-3'))
  // The server's chains of steps are the page's
  const chains = new RegExp('const CHAINS = \\[([^\\]]*(?:\\][^\\]]*)*?)\\n\\]').exec(server)[1]
  for (const steps of Object.values(CHAINS)) assert.ok(chains.includes(steps.map(s => `'${s}'`).join(', ')), steps.join(','))
  for (const item of prices) {
    assert.ok(plan.ITEMS[item]?.name && plan.ITEMS[item]?.icon && plan.ITEMS[item]?.about, item)
  }
  // And every room that can be bought is one of them.
  for (const room of PLAN.rooms.filter(r => r.buy)) assert.ok(plan.ITEMS[room.buy], room.id)
})

// ── The cat and Claude's pause ───────────────────────────────────────────

test("the cat's places can all be reached from each other, and Claude's pause spots too", () => {
  for (const rooms of LAYOUTS) {
    owning(rooms, 10)
    const places = cat.catPlaces()
    const pairs = places.flatMap(a => places.filter(b => b !== a).map(b => [`cat ${a.name} to ${b.name}`, a, b]))
    const { spot: watering } = cat.claudePause(0) // any slot: the spots are fixed
    pairs.push(['Claude to the plants', plan.MAIN_SPOT, plan.at(plan.firstRoom('corner'), { x: 376, y: 212 })])
    pairs.push(['Claude to the cat', plan.MAIN_SPOT, plan.at(plan.firstRoom('corner'), { x: 240, y: 224 })])
    pairs.push(['Claude to the pond', plan.MAIN_SPOT, cat.pondSpot()], ['Claude back from the pond', cat.pondSpot(), plan.MAIN_SPOT])
    assert.ok(watering)
    assert.deepEqual(routes.checkRoutes(pairs).problems, [], rooms.join(','))
  }
})

test('the cat walks from place to place, settles in time, and is there only once bought', () => {
  owning(['claude', 'team', 'kitchen', 'lounge'], 0)
  assert.equal(cat.catNow(0), null)
  owning(['claude', 'team', 'kitchen', 'lounge', 'cat'], 0)
  const at = slot => cat.catNow(slot * cat.CAT_SLOT_MS + cat.CAT_SLOT_MS - 1)
  const visited = new Set()
  for (let slot = 1; slot < 60; slot++) {
    const now = at(slot)
    assert.equal(now.isWalking, false, 'there by the end of its slot')
    visited.add(now.place.name)
  }
  assert.equal(visited.size, cat.catPlaces().length, 'every place in time')
  // Half a second into a slot with a new place, it is on its way.
  const moving = Array.from({ length: 59 }, (_, i) => i + 1).find(slot => at(slot).place.name !== at(slot - 1).place.name)
  assert.equal(cat.catNow(moving * cat.CAT_SLOT_MS + 500).isWalking, true)
  assert.deepEqual(cat.catNow(12_345), cat.catNow(12_345), 'the same for every viewer')
})

test("Claude's pause: coffee only with a kitchen, the cat only once bought", () => {
  const kinds = () => new Set(Array.from({ length: 200 }, (_, i) => cat.claudePause(i * cat.PAUSE_SLOT_MS).kind))
  owning(['claude', 'team'], 0)
  assert.deepEqual([...kinds()].sort(), ['plants', 'walk'])
  owning(['claude', 'team', 'kitchen', 'cat'], 0)
  assert.deepEqual([...kinds()].sort(), ['cat', 'kitchen', 'plants', 'walk'])
})

// ── The day's summary ────────────────────────────────────────────────────

test("the day's summary counts the work and lists the tasks in order", async () => {
  const { summaryText } = await import(js('summary'))
  const at = (h, m) => new Date(2026, 9, 16, h, m).getTime()
  const text = summaryText(
    { added: 1200, removed: 40, delivered: 2, tests: 1, commits: 3, prs: 0, tasks: [{ at: at(14, 5), name: 'Ida', task: 'Find fejlen', project: 'b', failed: true }, { at: at(10, 42), name: 'Freja', task: 'Kortlæg API’et', project: 'a' }] },
    at(17, 0),
  )
  assert.match(text, /^Agent-kontor, fredag 16\. oktober/)
  assert.match(text, /1\.200 linjer tilføjet, 40 fjernet/)
  assert.match(text, /1 opgave løst af hjælperne, 1 gik i stå/)
  assert.match(text, /3 commits, grønne tests 1 gang/)
  assert.ok(text.indexOf('10.42 Freja (a): Kortlæg API’et') < text.indexOf('14.05 Ida (b): Find fejlen (gik i stå)'), text)
  assert.doesNotMatch(summaryText({ added: 0, removed: 0, tasks: [] }), /Opgaver/)
})

// ── Small things from the test review (89) ───────────────────────────────

test('a desk not bought yet is no obstacle; a bought one is walked round', () => {
  owning(['claude', 'team'], 0)
  const { cx, dy } = deskSlots()[0]
  const across = () => {
    const points = routes.route({ x: cx - 70, y: dy + 12 }, { x: cx + 70, y: dy + 12 })
    return points.slice(1).reduce((d, p, i) => d + Math.hypot(p.x - points[i].x, p.y - points[i].y), 0)
  }
  const overTheRug = across()
  assert.ok(overTheRug < 150, `about straight over the rug: ${Math.round(overTheRug)}`)
  owning(['claude', 'team'], 1)
  assert.ok(across() > overTheRug + 20, 'round the desk once it stands')
})

test('nobody waits or idles among the trees, however many there are', () => {
  everything()
  const near = p => scenery.TREES.find(t => Math.hypot(t.x - p.x, t.y - p.y) < t.r * 0.8)
  for (let seat = 0; seat < 90; seat++) {
    const { spot, isOutside } = placeOf(seat)
    if (isOutside) assert.equal(near(spot), undefined, `seat ${seat} at ${spot.x},${spot.y}`)
  }
  owning(['claude', 'team'], 0)
  const many = Array.from({ length: 60 }, (_, i) => helper(`h${i}`, { phase: 'idle' }))
  for (const { spot } of idle.idlePlan(many, 0).values()) assert.equal(near(spot), undefined, `lawn ${spot.x},${spot.y}`)
})

test('off work on the lawn, a helper goes home by the path, not up to the front door', () => {
  owning(['claude', 'team'], 2)
  const lawn = GROUNDS.hangout[2]
  const sub = helper('h1', { phase: 'leaving', from: 'idle', since: 0 })
  const door = plan.entrance()
  for (let t = 0; t <= routes.WALKS.leave; t += 250) {
    const p = routes.poseOf(sub, t, routes.WALKS, lawn)
    if (p) assert.ok(p.y > door.y + 20, `at ${Math.round(p.x)},${Math.round(p.y)}`)
  }
  assert.deepEqual(routes.homewardRoute('h1', lawn)[0], routes.pathJoin(lawn))
})

test('nine helpers can hand over side by side', () => {
  everything()
  const spots = new Set(Array.from({ length: 9 }, (_, seat) => JSON.stringify(plan.handoffFor(seat))))
  assert.equal(spots.size, 9)
})

// ── Weather and seasons ──────────────────────────────────────────────────

test('the weather is the same for everyone, never snows in summer, and rains most in the autumn', async () => {
  const weather = await import(js('weather'))
  const at = (month, block) => new Date(2026, month - 1, 1).getTime() + block * weather.BLOCK_MS + weather.BLOCK_MS / 2
  const kinds = month => Array.from({ length: 240 }, (_, b) => weather.weatherAt(at(month, b)).kind)
  const share = (month, kind) => kinds(month).filter(k => k === kind).length / 240
  assert.equal(share(7, 'snow'), 0)
  assert.ok(share(1, 'snow') > 0.05, 'some snow in January')
  assert.ok(share(10, 'rain') > share(7, 'rain'), 'more rain in October than July')
  assert.deepEqual(weather.weatherAt(123_456_789), weather.weatherAt(123_456_789))
  assert.equal(weather.seasonOf(new Date(2026, 9, 16)), 'autumn')
  assert.equal(weather.isChristmasTime(new Date(2026, 11, 20)), true)
  assert.equal(weather.isChristmasTime(new Date(2026, 11, 28)), false)
  const asked = weather.weatherAt(0, { kind: 'snow', month: 12 })
  assert.deepEqual([asked.kind, asked.snowCover, asked.season, asked.isChristmas], ['snow', 1, 'winter', true])
})

test('weather fades in and out at the edges of its three hours, and snow lies a while after', async () => {
  const weather = await import(js('weather'))
  for (let b = 0; b < 500; b++) {
    const start = b * weather.BLOCK_MS
    const before = weather.weatherAt(start - 1000)
    const after = weather.weatherAt(start + 1000)
    if (before.kind !== after.kind) {
      assert.ok(before.intensity < 0.05 && after.intensity < 0.05, `a soft change at block ${b}`)
      if (before.kind === 'snow') assert.ok(after.snowCover > 0.9, 'the snow still lies')
    }
  }
})

test('two walking the same stretch at once go side by side, not through each other', () => {
  const a = { x: 100, y: 300, facing: 'right', isWalking: true }
  const b = { x: 104, y: 300, facing: 'right', isWalking: true }
  const sitting = { x: 102, y: 300, isWalking: false }
  routes.sideBySide([a, b, sitting])
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 11.9, 'apart')
  assert.equal(a.x, 100, 'across the way, not along it')
  assert.deepEqual([sitting.x, sitting.y], [102, 300], 'one standing still is not moved')
  const c = { x: 200, y: 300, facing: 'front', isWalking: true }
  const d = { x: 200, y: 310, facing: 'front', isWalking: true }
  routes.sideBySide([c, d])
  assert.equal(c.y, 300)
  assert.ok(Math.abs(c.x - d.x) > 0, 'one walking down beside the other')
})

test('the log hears when Claude finishes a long turn, not a short or a cut one', () => {
  const session = turn => ({ key: 'k', project: 'p', main: { state: 'idle', detail: 'Holder pause' }, subs: [], ...(turn ? { turn } : {}) })
  const before = { sessions: [session({ endedAt: 1, ms: 300_000, isAborted: false })] }
  const kinds = turn => eventsBetween(before, { sessions: [session(turn)] }).map(e => e.kind)
  assert.deepEqual(kinds({ endedAt: 2, ms: 240_000, isAborted: false }), ['done'])
  assert.deepEqual(kinds({ endedAt: 2, ms: 30_000, isAborted: false }), [])
  assert.deepEqual(kinds({ endedAt: 2, ms: 240_000, isAborted: true }), [])
  assert.deepEqual(kinds({ endedAt: 1, ms: 300_000, isAborted: false }), [], 'the same turn again is no news')
})

test('a teammate that handed in a task walks back from Claude to its desk', () => {
  owning(['claude', 'team'], 3)
  const sub = helper('t1', { seat: 1, phase: 'arriving', from: 'handover', since: 0 })
  const start = routes.poseOf(sub, 1)
  const hand = plan.handoffFor(1)
  assert.ok(Math.hypot(start.x - hand.x, start.y - hand.y) < 3, 'it sets off from beside Claude')
  assert.equal(routes.poseOf(sub, routes.WALKS.arrive).seated, true, 'and sits down at its desk')
})

test('Claude plays ping-pong only with the table free and someone off work to play', () => {
  owning(['claude', 'team', 'lounge', 'pingpong'], 0)
  const lounge = plan.firstRoom('lounge')
  const ends = plan.spotsIn(lounge, plan.typeOf(lounge).pingpong)
  assert.equal(ends.length, 2)
  const kinds = table => new Set(Array.from({ length: 300 }, (_, i) => cat.claudePause(i * cat.PAUSE_SLOT_MS, { table }).kind))
  assert.ok(!kinds(null).has('pingpong'), 'not without a partner')
  assert.ok(kinds(ends).has('pingpong'), 'with one, sometimes')
  const game = Array.from({ length: 300 }, (_, i) => cat.claudePause(i * cat.PAUSE_SLOT_MS, { table: ends })).find(p => p.kind === 'pingpong')
  assert.deepEqual([game.spot.x, game.partnerSpot.x], [ends[0].x, ends[1].x], 'Claude at one end, the partner at the other')
  assert.deepEqual(routes.checkRoutes([['Claude to the table', plan.MAIN_SPOT, ends[0]], ['Claude back from the table', ends[0], plan.MAIN_SPOT]]).problems, [])
})

test('a regular goes by the name it was given; the log says when it comes in, takes a job and goes home', () => {
  const regular = (extra = {}) => ({ id: 'staff-code-reviewer', name: 'code-reviewer', staff: 'code-reviewer', task: '', seat: 0, phase: 'working', since: 0, activity: { state: 'idle', detail: 'Klar til en opgave' }, ...extra })
  const state = subs => ({ sessions: [{ key: 's', project: 'p', main: { state: 'idle', detail: 'x' }, subs }], game: { crew: { names: { 'code-reviewer': 'Rikke' }, removed: [] } } })
  const named = util.crewNamed(state([regular(), { id: 'h', name: 'Ida', task: 't', seat: 1, phase: 'working', since: 0, activity: { state: 'reading', detail: 'x' } }]))
  assert.deepEqual(named.sessions[0].subs.map(s => s.name), ['Rikke', 'Ida'])
  assert.equal(named.sessions[0].subs[0].agentName, 'code-reviewer')

  const lines = (a, b) => eventsBetween(a, b, 1).map(e => e.text)
  assert.deepEqual(lines(state([]), state([regular({ phase: 'arriving' })])), ['code-reviewer møder ind'])
  assert.deepEqual(lines(state([regular()]), state([regular({ isOnJob: true, task: 'Gennemgå diffen' })])), ['code-reviewer går i gang: Gennemgå diffen'])
  assert.deepEqual(lines(state([regular()]), state([regular({ phase: 'leaving' })])), ['code-reviewer gik hjem'])
  // At its desk between jobs, nothing new.
  assert.deepEqual(lines(state([regular()]), state([regular()])), [])
})

test('a regular without a desk has its own grumbles; on the bench the usual ones', () => {
  let regular = null
  let helper = null
  for (let t = 0; t < 90_000 && !(regular && helper); t += 500) {
    regular ??= voices.grumbleAt('code-reviewer', t, 3, false, true)
    helper ??= voices.grumbleAt('code-reviewer', t, 3, false, false)
  }
  assert.ok(regular && helper)
  assert.notEqual(regular, helper)
})
