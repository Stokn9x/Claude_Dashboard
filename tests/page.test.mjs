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
const util = await import(js('util'))

const { PLAN, WORLD, GROUNDS, typeOf, frameOf, deskSlots, desks, placeOf } = plan
const ALL_ROOMS = ['claude', 'team', 'kitchen', 'toilet', 'lounge', 'pingpong', 'meeting', 'plants', 'art', 'neon', 'espresso', 'aquarium', 'chairs', 'screens']
const owning = (rooms, deskCount) => {
  store.state = { sessions: [], game: { owned: { rooms, desks: deskCount }, kroner: 0, next: {} } }
}
const everything = () => owning(ALL_ROOMS, 10)
const startOffice = () => owning(['claude', 'team'], 2)
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
const helper = (id, extra = {}) => ({ id, name: id, task: `Opgave ${id}`, seat: 0, phase: 'working', since: 0, activity: { state: 'working', detail: 'Tænker' }, ...extra })

// ── The floor plan ───────────────────────────────────────────────────────

test('every room lies inside the office, and no two rooms overlap', () => {
  for (const room of PLAN.rooms) {
    const f = frameOf(room)
    assert.ok(f.x >= WORLD.x && f.y >= WORLD.y && f.x + f.w <= WORLD.x + WORLD.w && f.y + f.h <= WORLD.y + WORLD.h, room.id)
  }
  for (const [i, a] of PLAN.rooms.entries()) {
    for (const b of PLAN.rooms.slice(i + 1)) {
      assert.ok(!overlaps({ x: a.x, y: a.y, w: typeOf(a).w, h: typeOf(a).h }, { x: b.x, y: b.y, w: typeOf(b).w, h: typeOf(b).h }), `${a.id} and ${b.id}`)
    }
  }
})

test('every door joins rooms that exist, and the front door opens to the path', () => {
  for (const door of PLAN.doors) for (const id of door.between) assert.ok(plan.roomById(id), id)
  const front = PLAN.doors.find(d => d.isEntrance)
  assert.ok(front)
  assert.deepEqual(GROUNDS.walkway[0], PLAN.entrance)
  assert.ok(util.isIn(GROUNDS.walkway[1].x, GROUNDS.walkway[1].y, GROUNDS.path[0]))
})

test('ten desks in all; only the bought ones are used', () => {
  everything()
  assert.equal(deskSlots().length, 10)
  owning(['claude', 'team'], 4)
  assert.equal(desks().length, 4)
  assert.equal(placeOf(3).isDesk, true)
  assert.equal(placeOf(4).isDesk, false)
})

test('helpers without a desk each get their own spot, then queue by the door', () => {
  startOffice()
  const spots = Array.from({ length: 30 }, (_, seat) => placeOf(seat).spot)
  const keys = spots.map(s => `${s.x},${s.y}`)
  assert.equal(new Set(keys).size, keys.length, 'no two helpers share a spot')
  const last = spots.at(-1)
  assert.ok(Math.hypot(last.x - PLAN.entrance.x, last.y - PLAN.entrance.y) < 120, 'the queue is by the door')
})

// ── Routes and walks ─────────────────────────────────────────────────────

test('no route goes through a wall in the full office', () => {
  everything()
  const result = routes.checkRoutes()
  assert.ok(result.checked > 200)
  assert.deepEqual(result.problems, [])
})

test('no route goes through a wall in the office you start with', () => {
  startOffice()
  assert.deepEqual(routes.checkRoutes().problems, [])
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
  assert.deepEqual([first.x, first.y], [GROUNDS.walkway[1].x, GROUNDS.walkway[1].y], 'starts on the path outside')
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
  assert.equal(late.y, GROUNDS.walkway[2].y, 'on the pavement at the end')
  assert.ok(Math.abs(late.x - GROUNDS.walkway[2].x) > 300, 'well along it')
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
  const home = { x: 100, y: 200 }
  const errand = { kind: 'coffee', start: 0, stay: breaks.STAY.coffee, dest: { x: 330, y: 100 } }
  assert.equal(breaks.errandPose(home, errand, -1), null)
  assert.equal(breaks.errandPose(home, errand, 3000 + 10).isThere, true)
  assert.equal(breaks.errandPose(home, errand, 2 * 3000 + breaks.STAY.coffee), null)
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

// ── Small helpers ────────────────────────────────────────────────────────

test('kroner are written the Danish way', () => {
  assert.equal(util.kr(12345.9), '12.345 kr')
  assert.equal(util.clip('abcdef', 4), 'abc…')
})

test('helpers with neighbouring ids still look different', () => {
  const picks = Array.from({ length: 6 }, (_, i) => util.stir(util.hashOf(`agent-${i}`), 1) % 6)
  assert.ok(new Set(picks).size >= 3)
})
