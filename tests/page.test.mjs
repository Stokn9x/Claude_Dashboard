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

const { PLAN, WORLD, GROUNDS, CHAINS, typeOf, frameOf, fullFrameOf, rectOf, deskSlots, desks, placeOf } = plan
const STEPS = Object.values(CHAINS).flat()
const ALL_ROOMS = ['claude', 'team', ...STEPS, 'pingpong', 'meeting', 'plants', 'art', 'neon', 'espresso', 'aquarium', 'chairs', 'screens', 'reception']
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

// A time inside a break (every three minutes, from 20 s in) and one inside
// a meeting (every ten minutes, from a minute in).
const BREAK = 180_000 * 50_000 + 20_000 + 4000
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
  const go = routes.walkMs(routes.route(home, dest), 8000)
  const come = routes.walkMs(routes.route(dest, home), 8000)
  assert.equal(breaks.errandPose(home, errand, -1), null)
  assert.equal(breaks.errandPose(home, errand, go - 10).isThere, undefined)
  assert.equal(breaks.errandPose(home, errand, go + 10).isThere, true)
  assert.equal(breaks.errandPose(home, errand, go + breaks.STAY.coffee + come), null)
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
