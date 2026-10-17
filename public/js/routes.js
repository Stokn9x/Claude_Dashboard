// ── Routes ───────────────────────────────────────────────────────────────
// A walk goes room by room: out of a room by its door, along the hall in
// the lane on its right, and in by the next door. Every room opens on the
// hall, so nobody cuts through someone else's room. A door is walked
// straight through, from a step inside one room to a step inside the
// other. Within a room the way round the furniture is found with A* on a
// grid of small cells, the fewest steps with a little extra for every
// turn, and then pulled straight wherever the way is clear, so helpers walk
// in lines, not staircases. Outside is open grass, reached by the front
// door and the path. Routes are kept until the floor plan changes.
import { store, owns } from './store.js'
import { hashOf, isIn } from './util.js'
import { GROUNDS, PLAN, WORLD, MAIN_SPOT, entrance, frameOf, walkway, at, deskBlocksNow, deskSlots, firstRoom, handoffFor, hasNow, isBuilt, isDepot, isOpenDoor, laneOf, placeOf, rectOf, shiftOf, spotsIn, typeOf } from './plan.js'

const STEP = 6
const TURN = 0.6
const MOVES = [[1, 0], [-1, 0], [0, 1], [0, -1]]
// How far into a room a walk goes straight on from a door
const MOUTH = 10

// The grid is built when a route is first needed, and again whenever
// something is bought: only rooms that stand have floor (a depot has none),
// and furniture is in the way only once it stands.
let grid = null
let gridKey = null
const routes = new Map()

const walkable = () => PLAN.rooms.filter(room => isBuilt(room) && !isDepot(room))
const box = r => [r.x, r.y, r.w, r.h]

const buildGrid = () => {
  const cols = Math.ceil(WORLD.w / STEP)
  const rows = Math.ceil(WORLD.h / STEP)
  const open = new Uint8Array(cols * rows)
  const floors = walkable().map(room => {
    const r = rectOf(room)
    return [r.x + 2, r.y + 2, r.w - 4, r.h - 4]
  })
  // Furniture, with a margin so feet keep clear of it. A block that needs
  // something bought stands only once it is, and one beyond the floor the
  // room has now is not there yet.
  const blocks = walkable().flatMap(room => {
    const { dx, dy } = shiftOf(room)
    return (typeOf(room).blocks ?? []).filter(([x, y, w, h, needs]) => owns(needs) && hasNow(room, [x + w / 2, y + h / 2])).map(([x, y, w, h]) => [x + dx - 3, y + dy - 3, w + 6, h + 6])
  }).concat(deskBlocksNow().map(([x, y, w, h]) => [x - 3, y - 3, w + 6, h + 6]))
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = WORLD.x + c * STEP + STEP / 2
      const y = WORLD.y + r * STEP + STEP / 2
      open[r * cols + c] = floors.some(f => isIn(x, y, f)) && !blocks.some(b => isIn(x, y, b)) ? 1 : 0
    }
  }
  return { cols, rows, open }
}

const ensureGrid = () => {
  const key = `${(store.state.game?.owned?.rooms ?? ['*']).join(',')}|${store.state.game?.owned?.desks ?? '*'}`
  if (key === gridKey) return
  grid = buildGrid()
  gridKey = key
  routes.clear()
}

const cellOf = p => {
  const c = Math.min(grid.cols - 1, Math.max(0, Math.floor((p.x - WORLD.x) / STEP)))
  const r = Math.min(grid.rows - 1, Math.max(0, Math.floor((p.y - WORLD.y) / STEP)))
  return r * grid.cols + c
}
const centreOf = i => ({ x: WORLD.x + (i % grid.cols) * STEP + STEP / 2, y: WORLD.y + Math.floor(i / grid.cols) * STEP + STEP / 2 })
// A cell a walk in this room may use: open, and on the room's own floor.
const isUsable = (i, area) => grid.open[i] === 1 && isIn(centreOf(i).x, centreOf(i).y, area)

// The nearest usable cell, for a spot that lies on furniture.
const nearestOpen = (start, area) => {
  if (isUsable(start, area)) return start
  const seen = new Set([start])
  const queue = [start]
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]
    for (const j of [i - 1, i + 1, i - grid.cols, i + grid.cols]) {
      if (j < 0 || j >= grid.open.length || seen.has(j)) continue
      if (isUsable(j, area)) return j
      seen.add(j)
      queue.push(j)
    }
  }
  return start
}

// A binary heap of [priority, state], smallest first.
const makeHeap = () => {
  const heap = []
  const push = (f, s) => {
    heap.push([f, s])
    let k = heap.length - 1
    while (k > 0) {
      const p = (k - 1) >> 1
      if (heap[p][0] <= heap[k][0]) break
      ;[heap[p], heap[k]] = [heap[k], heap[p]]
      k = p
    }
  }
  const pop = () => {
    const top = heap[0]
    const last = heap.pop()
    if (heap.length) {
      heap[0] = last
      let k = 0
      for (;;) {
        const l = 2 * k + 1
        const r = l + 1
        let m = k
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r
        if (m === k) break
        ;[heap[m], heap[k]] = [heap[k], heap[m]]
        k = m
      }
    }
    return top
  }
  return { push, pop, size: () => heap.length }
}

// The way between two points in one room, round its furniture, as corners.
const findPath = (from, to, area) => {
  const { cols, rows } = grid
  const start = nearestOpen(cellOf(from), area)
  const goal = nearestOpen(cellOf(to), area)
  const gc = goal % cols
  const gr = Math.floor(goal / cols)
  const h = i => Math.abs((i % cols) - gc) + Math.abs(Math.floor(i / cols) - gr)
  // States are cell × the direction it was entered by, so a turn can cost.
  const cost = new Float64Array(cols * rows * 4).fill(Infinity)
  const back = new Int32Array(cols * rows * 4).fill(-1)
  const heap = makeHeap()
  for (let d = 0; d < 4; d++) {
    cost[start * 4 + d] = 0
    heap.push(h(start), start * 4 + d)
  }
  let end = -1
  while (heap.size()) {
    const [, s] = heap.pop()
    const i = s >> 2
    const dir = s & 3
    if (i === goal) {
      end = s
      break
    }
    const c = i % cols
    const r = Math.floor(i / cols)
    for (let d = 0; d < 4; d++) {
      const nc = c + MOVES[d][0]
      const nr = r + MOVES[d][1]
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue
      const j = nr * cols + nc
      if (!isUsable(j, area)) continue
      const next = cost[s] + 1 + (d === dir ? 0 : TURN)
      const t = j * 4 + d
      if (next < cost[t]) {
        cost[t] = next
        back[t] = s
        heap.push(next + h(j), t)
      }
    }
  }
  if (end < 0) return [from, to]
  // Back to the start, then only the corners kept.
  const cells = []
  for (let s = end; s >= 0; s = back[s]) cells.push(s >> 2)
  cells.reverse()
  const corners = cells.filter((cell, k) => k === 0 || k === cells.length - 1 || cells[k + 1] - cell !== cell - cells[k - 1])
  return [from, ...corners.map(centreOf), to]
}

// Whether a straight line between two points in a room keeps to its free
// floor. The ends may lie on furniture (a chair, a stall), so the first and
// last few units are not checked.
const isClear = (a, b, area) => {
  const d = Math.hypot(b.x - a.x, b.y - a.y)
  for (let k = 4; k <= d - 4; k += 2) {
    const p = { x: a.x + ((b.x - a.x) * k) / d, y: a.y + ((b.y - a.y) * k) / d }
    if (!isUsable(cellOf(p), area)) return false
  }
  return true
}

// Corners pulled straight: from each point, on to the furthest one that
// can be seen from it.
const straighten = (points, area) => {
  const out = [points[0]]
  for (let i = 0; i < points.length - 1; ) {
    let j = points.length - 1
    while (j > i + 1 && !isClear(points[i], points[j], area)) j--
    out.push(points[j])
    i = j
  }
  return out
}

// ── Rooms and doors ──────────────────────────────────────────────────────
// Outdoors is anywhere no standing room (with its walls) covers.
export const isOutdoors = p =>
  !PLAN.rooms.some(room => {
    if (!isBuilt(room)) return false
    const f = frameOf(room)
    return isIn(p.x, p.y, [f.x, f.y, f.w, f.h])
  })

// The room a point is in: the one whose floor it is on, or 'out'; a point
// in a wall or a doorway belongs to the nearest room.
const roomAt = p => {
  const rooms = walkable()
  const on = rooms.find(room => isIn(p.x, p.y, box(rectOf(room))))
  if (on) return on.id
  if (isOutdoors(p)) return 'out'
  let best = rooms[0]
  let bestD = Infinity
  for (const room of rooms) {
    const r = rectOf(room)
    const d = Math.hypot(Math.max(r.x - p.x, 0, p.x - r.x - r.w), Math.max(r.y - p.y, 0, p.y - r.y - r.h))
    if (d < bestD) {
      best = room
      bestD = d
    }
  }
  return best.id
}

// The rooms a door joins; the front door joins the reception and outdoors.
const sidesOf = door => (door.isEntrance ? [door.between[0], 'out'] : door.between)

// A step either side of a door, by the room each lies in. Outside the front
// door it is the doorstep itself.
const mouthsOf = door => {
  const isAcross = door.w >= door.h
  const cx = door.x + door.w / 2
  const cy = door.y + door.h / 2
  const one = isAcross ? { x: cx, y: door.y - MOUTH } : { x: door.x - MOUTH, y: cy }
  const two = isAcross ? { x: cx, y: door.y + door.h + MOUTH } : { x: door.x + door.w + MOUTH, y: cy }
  const [a, b] = sidesOf(door)
  const isOneA = roomAt(one) === a
  const mouths = { [a]: isOneA ? one : two, [b]: isOneA ? two : one }
  if (door.isEntrance) mouths.out = entrance()
  return mouths
}

// The doors from one room to another, fewest first.
const roomPath = (a, b) => {
  const doors = PLAN.doors.filter(isOpenDoor)
  const prev = new Map([[a, null]])
  const queue = [a]
  for (let head = 0; head < queue.length; head++) {
    const r = queue[head]
    if (r === b) break
    for (const door of doors) {
      const sides = sidesOf(door)
      if (!sides.includes(r)) continue
      const s = sides[0] === r ? sides[1] : sides[0]
      if (prev.has(s)) continue
      prev.set(s, { from: r, to: s, door })
      queue.push(s)
    }
  }
  if (!prev.has(b)) return null
  const steps = []
  for (let r = b; prev.get(r); r = prev.get(r).from) steps.unshift(prev.get(r))
  return steps
}

// One room's part of a walk, from p to q. Outdoors it is straight over the
// grass, by the corner of the path to or from the front door. In the hall
// it is in the lane on the right. Elsewhere it goes round the furniture.
const leg = (id, p, q) => {
  if (id === 'out') {
    const [door, corner] = walkway()
    const isAtDoor = pt => pt.x === door.x && pt.y === door.y
    return isAtDoor(p) || isAtDoor(q) ? [p, corner, q] : [p, q]
  }
  if (id === 'hall') {
    if (Math.abs(p.x - q.x) < 1) return [p, q]
    const lane = laneOf(q.x > p.x)
    return [p, { x: p.x, y: lane }, { x: q.x, y: lane }, q]
  }
  const room = PLAN.rooms.find(r => r.id === id)
  const r = rectOf(room)
  const area = [r.x + 1, r.y + 1, r.w - 2, r.h - 2]
  return straighten(findPath(p, q, area), area)
}

const withoutRepeats = points => points.filter((p, k) => k === 0 || p.x !== points[k - 1].x || p.y !== points[k - 1].y)

const findRoute = (from, to) => {
  const a = roomAt(from)
  const b = roomAt(to)
  if (a === b) return withoutRepeats(leg(a, from, to))
  const steps = roomPath(a, b)
  if (!steps) return [from, to]
  const points = [from]
  let here = from
  for (const { from: r, to: s, door } of steps) {
    const mouths = mouthsOf(door)
    points.push(...leg(r, here, mouths[r]).slice(1), mouths[s])
    here = mouths[s]
  }
  points.push(...leg(b, here, to).slice(1))
  return withoutRepeats(points)
}

// Remembered until the floor plan changes, at most this many: walks from
// wherever someone happened to be add new ones all day.
const ROUTES_KEPT = 3000
export const route = (from, to) => {
  ensureGrid()
  const key = `${from.x},${from.y}>${to.x},${to.y}`
  if (!routes.has(key)) {
    if (routes.size >= ROUTES_KEPT) routes.clear()
    routes.set(key, findRoute(from, to))
  }
  return routes.get(key)
}
// In from the corner of the path outside, through the front door.
const arriveRoute = seat => route(walkway()[1], placeOf(seat).spot)
const deliverRoute = seat => route(placeOf(seat).spot, handoffFor(seat))
const leaveRoute = seat => route(handoffFor(seat), entrance())

// ── Walks ────────────────────────────────────────────────────────────────
// Everyone walks at the same pace. The mod's times (WALKS, sent in the
// status file) are a ceiling: a walk that would take longer is brisker, so
// it still fits. Coming in, a helper walks at once and sits down when it
// gets there. With a result, it finishes up at its desk and sets off so it
// reaches Claude just as the handover begins; going home, it lingers and
// sets off so it steps out of the front door just as its time is up.
export const SPEED = 0.08
export const WALKS = { arrive: 12_000, deliver: 8000, handover: 2600, leave: 9000, idle: 180_000 }

const facingOf = (a, b) => (Math.abs(b.x - a.x) > Math.abs(b.y - a.y) ? (b.x > a.x ? 'right' : 'left') : b.y > a.y ? 'front' : 'back')
const lengthOf = points => points.slice(1).reduce((d, p, i) => d + Math.hypot(p.x - points[i].x, p.y - points[i].y), 0)
// How long a walk takes at the common pace, at most `most` ms.
export const walkMs = (points, most) => Math.max(1, Math.min(most, lengthOf(points) / SPEED))

// Where a walk has got to at the fraction k of its time.
export const walkAt = (points, k) => {
  let left = Math.max(0, k) * lengthOf(points)
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]
    const b = points[i + 1]
    const d = Math.hypot(b.x - a.x, b.y - a.y)
    if (d <= 0) continue
    if (left < d) return { x: a.x + ((b.x - a.x) * left) / d, y: a.y + ((b.y - a.y) * left) / d, facing: facingOf(a, b), isWalking: true }
    left -= d
  }
  const last = points[points.length - 1]
  return { x: last.x, y: last.y, facing: 'front', isWalking: false }
}

// A walk that must end at `end` ms: standing at its start until it sets off.
const walkEndingAt = (points, e, end, facing = 'front') => {
  const ms = walkMs(points, end)
  const off = end - ms
  return e < off ? { x: points[0].x, y: points[0].y, facing, isWalking: false } : walkAt(points, (e - off) / ms)
}

// What a helper is doing at this moment: at its place, or somewhere along a
// walk; null once it is out of the door. A helper off work (idle) is placed
// by the page (see idle.js); `origin` is where it was idling, for the walk
// back to a desk or out of the door.
export const poseOf = (sub, now, walks = WALKS, origin = null) => {
  const e = now - sub.since
  if (sub.phase === 'working') return { seated: true }
  if (sub.phase === 'idle') return { isIdle: true }
  if (sub.phase === 'arriving') {
    // From the lawn or the lounge after time off, from Claude's desk after a
    // teammate handed in a task, or in by the front door.
    const points = sub.from === 'idle' && origin ? route(origin, placeOf(sub.seat).spot) : sub.from === 'handover' ? route(handoffFor(sub.seat), placeOf(sub.seat).spot) : arriveRoute(sub.seat)
    const ms = walkMs(points, walks.arrive)
    return e >= ms ? { seated: true } : walkAt(points, e / ms)
  }
  if (sub.phase === 'delivering') {
    if (e < walks.deliver) {
      const points = deliverRoute(sub.seat)
      // Still finishing up at the desk until it is time to set off
      return e < walks.deliver - walkMs(points, walks.deliver) ? { seated: true } : walkEndingAt(points, e, walks.deliver)
    }
    if (e < walks.deliver + walks.handover) {
      const spot = handoffFor(sub.seat)
      return { x: spot.x, y: spot.y, facing: 'left', isWalking: false, handover: true }
    }
    const e2 = e - walks.deliver - walks.handover
    return e2 < walks.leave ? walkEndingAt(leaveRoute(sub.seat), e2, walks.leave, 'left') : null
  }
  if (e >= walks.leave) return null
  if (sub.from === 'idle' && origin && isOutdoors(origin)) return walkEndingAt([origin, pathJoin(origin)], e, walks.leave)
  return walkEndingAt(sub.from === 'idle' && origin ? route(origin, entrance()) : leaveRoute(sub.seat), e, walks.leave)
}

// Where someone outside (on the lawn) joins the path on the way home: beside
// them, below the step down from the front door.
export const pathJoin = origin => {
  const corner = walkway()[1]
  return { x: corner.x, y: Math.max(corner.y, Math.min(GROUNDS.pavement.y - 4, origin.y)) }
}

// ── Side by side ─────────────────────────────────────────────────────────
// Two on the same stretch at the same time (helpers sent off together, a
// walk home beside a walk in) would walk through each other: each pair of
// walkers closer than CLOSE is eased apart, across the way they go, each by
// half of what is missing. A pose that is not walking keeps its place. In
// place, on the poses given; the same for every viewer.
const CLOSE = 12
export const sideBySide = poses => {
  const walking = poses.filter(p => p.isWalking)
  for (let i = 0; i < walking.length; i++) {
    for (let j = i + 1; j < walking.length; j++) {
      const a = walking[i]
      const b = walking[j]
      const d = Math.hypot(b.x - a.x, b.y - a.y)
      if (d >= CLOSE) continue
      const isAcross = a.facing === 'left' || a.facing === 'right'
      // Across the way they go: up and down for a walk east or west, else
      // left and right; the one already on that side stays on it. Enough
      // that, with the gap along the way, they are CLOSE apart.
      const along = Math.abs(isAcross ? b.x - a.x : b.y - a.y)
      const across = isAcross ? b.y - a.y : b.x - a.x
      const push = (Math.sqrt(CLOSE * CLOSE - along * along) - Math.abs(across)) / 2
      if (push <= 0) continue
      const sign = across >= 0 ? 1 : -1
      if (isAcross) {
        a.y -= push * sign
        b.y += push * sign
      } else {
        a.x -= push * sign
        b.x += push * sign
      }
    }
  }
  return poses
}

// ── Late news ────────────────────────────────────────────────────────────
// A new phase reaches the page a moment after it began: the mod notices it,
// writes the status file, the server reads it, which together takes up to a
// second or so. Walked from when it began, the figure would jump ahead by
// that much. So a phase that arrives a little late begins when the page
// first sees it, and the walk starts from where the figure stands. Seen
// long after it began (a reload), it keeps its own time. `seen` remembers
// when each phase was first seen, for the subs there are now.
const LATE_MS = 2500
export const settle = (sessions, seen, now) => {
  const keys = new Set()
  const out = sessions.map(s => ({
    ...s,
    subs: (s.subs ?? []).map(sub => {
      const key = `${s.key}|${sub.id}|${sub.phase}|${sub.since}`
      keys.add(key)
      if (!seen.has(key)) seen.set(key, now)
      const late = seen.get(key) - sub.since
      return late > 0 && late < LATE_MS ? { ...sub, since: seen.get(key) } : sub
    }),
  }))
  for (const key of seen.keys()) if (!keys.has(key)) seen.delete(key)
  return out
}

// ── Going home ───────────────────────────────────────────────────────────
// Out of the front door a helper is gone from the status file, but the page
// still sees it walk down the path and away along the pavement, left or
// right as its id says. Only for show: a reload forgets it.
export const HOMEWARD_MS = 9000

// When a helper steps out of the front door, or null if it is not leaving.
export const outAt = (sub, walks = WALKS) =>
  sub.phase === 'leaving' ? sub.since + walks.leave : sub.phase === 'delivering' ? sub.since + walks.deliver + walks.handover + walks.leave : null

// From the front door, or for one who left from the lawn, from where it
// joined the path.
export const homewardRoute = (id, origin = null) => {
  const [door, corner, street] = walkway()
  const side = hashOf(id) % 2 === 0 ? 1 : -1
  const start = origin && isOutdoors(origin) ? [pathJoin(origin)] : [door, corner]
  return [...start, street, { x: street.x + side * 560, y: street.y }]
}

// Where a helper on its way home is, or null before it is out or once it
// is out of sight.
export const homewardPose = (id, out, now, origin = null) => {
  const k = (now - out) / HOMEWARD_MS
  return k < 0 || k >= 1 ? null : walkAt(homewardRoute(id, origin), k)
}

// For checking the floor plan after a change: every route a helper or
// Claude can take, walked in small steps; any that crosses a wall or a
// depot, or that could not be found and was drawn straight, is reported.
// In the browser console: kontorCheckRoutes()
// `extra` adds walks of its own: [name, from, to].
export const checkRoutes = (extra = []) => {
  ensureGrid()
  const floors = walkable().map(room => box(rectOf(room)))
  const doors = PLAN.doors.filter(isOpenDoor).map(d => [d.x - 1, d.y - 1, d.w + 2, d.h + 2])
  // Outside is open ground: arrivals come up the path, and some wait on the bench.
  const isFloor = (x, y) => floors.some(f => isIn(x, y, f)) || doors.some(d => isIn(x, y, d)) || isOutdoors({ x, y })
  const problems = []
  const check = (name, points) => {
    // A straight line indoors means no route was found; outdoors it is just a walk across the grass.
    const isIndoors = !isOutdoors(points[0]) || !isOutdoors(points[1])
    if (points.length === 2 && isIndoors && Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y) > 30 && roomAt(points[0]) !== roomAt(points[1])) problems.push(`${name}: no route found`)
    for (let i = 0; i + 1 < points.length; i++) {
      const a = points[i]
      const b = points[i + 1]
      const d = Math.hypot(b.x - a.x, b.y - a.y)
      for (let k = 0; k <= d; k += 2) {
        const x = a.x + ((b.x - a.x) * k) / d
        const y = a.y + ((b.y - a.y) * k) / d
        if (!isFloor(x, y) && Math.hypot(x - entrance().x, y - entrance().y) > 8) return problems.push(`${name}: through a wall at ${Math.round(x)},${Math.round(y)}`)
      }
    }
  }
  // Every desk, every spot along the walls, and the bench outside
  const seats = deskSlots().length + 10 + 6
  let count = 0
  const spots = []
  for (const room of walkable()) {
    const t = typeOf(room)
    spots.push(...spotsIn(room, [...(t.standing ?? []), ...(t.stalls ?? []), ...(t.chairs ?? []), ...(owns('pingpong') ? t.pingpong ?? [] : []), ...Object.values(t.hobbies ?? {}).flat()]))
  }
  spots.push(GROUNDS.hangout[0])
  for (let seat = 0; seat < seats; seat++) {
    const home = placeOf(seat).spot
    check(`arrive ${seat}`, arriveRoute(seat))
    check(`deliver ${seat}`, deliverRoute(seat))
    check(`leave ${seat}`, leaveRoute(seat))
    count += 3
    for (const spot of spots) {
      check(`seat ${seat} to ${spot.x},${spot.y}`, route(home, spot))
      check(`${spot.x},${spot.y} to seat ${seat}`, route(spot, home))
      count += 2
    }
  }
  for (const [name, from, to] of extra) {
    check(name, route(from, to))
    count += 1
  }
  const meeting = firstRoom('meeting')
  if (meeting && isBuilt(meeting)) {
    const head = at(meeting, typeOf(meeting).head)
    check('Claude to the meeting', route(MAIN_SPOT, head))
    check('Claude back from the meeting', route(head, MAIN_SPOT))
    count += 2
  }
  return { checked: count, problems }
}
globalThis.kontorCheckRoutes = checkRoutes
