// ── Routes ───────────────────────────────────────────────────────────────
// Walks find their way on a grid of small cells, open where a room's floor
// or a door is and nothing stands in the way, with A*: the fewest steps, and
// a little extra for every turn so a route goes in straight runs. Routes are
// kept until the floor plan changes.
import { store, owns } from './store.js'
import { hashOf, isIn } from './util.js'
import { PLAN, WORLD, MAIN_SPOT, entrance, frameOf, walkway, at, deskSlots, firstRoom, handoffFor, isBuilt, isOpenDoor, placeOf, shiftOf, typeOf } from './plan.js'

const STEP = 6
const TURN = 0.6
const MOVES = [[1, 0], [-1, 0], [0, 1], [0, -1]]

// The grid is built when a route is first needed, and again whenever
// something is bought: only rooms that stand have floor, and a door only
// opens between two rooms that stand, so no walk cuts across an empty lot.
let grid = null
let gridKey = null
const routes = new Map()

const buildGrid = () => {
  const cols = Math.ceil(WORLD.w / STEP)
  const rows = Math.ceil(WORLD.h / STEP)
  const open = new Uint8Array(cols * rows)
  const floors = PLAN.rooms.filter(isBuilt).map(r => [r.x + 2, r.y + 2, typeOf(r).w - 4, typeOf(r).h - 4])
  // A door reaches a little into the rooms on both sides, so the floor on
  // one side, the door and the floor on the other always meet in the grid.
  const doors = PLAN.doors.filter(isOpenDoor).map(d => (d.w < d.h ? [d.x - 5, d.y, d.w + 10, d.h] : [d.x, d.y - 5, d.w, d.h + 10]))
  // Furniture, with a margin so feet keep clear of it
  const blocks = PLAN.rooms.flatMap(room => {
    const { dx, dy } = shiftOf(room)
    // A block that needs something bought stands only once it is
    return (typeOf(room).blocks ?? []).filter(b => owns(b[4])).map(([x, y, w, h]) => [x + dx - 3, y + dy - 3, w + 6, h + 6])
  })
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = WORLD.x + c * STEP + STEP / 2
      const y = WORLD.y + r * STEP + STEP / 2
      const isFloor = floors.some(f => isIn(x, y, f)) || doors.some(d => isIn(x, y, d))
      open[r * cols + c] = isFloor && !blocks.some(b => isIn(x, y, b)) ? 1 : 0
    }
  }
  return { cols, rows, open }
}

const ensureGrid = () => {
  const key = (store.state.game?.owned?.rooms ?? ['*']).join(',')
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

// The nearest open cell, for a spot that lies on furniture or in a wall.
const nearestOpen = start => {
  if (grid.open[start]) return start
  const seen = new Set([start])
  const queue = [start]
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]
    for (const j of [i - 1, i + 1, i - grid.cols, i + grid.cols]) {
      if (j < 0 || j >= grid.open.length || seen.has(j)) continue
      if (grid.open[j]) return j
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

const findPath = (from, to) => {
  const { cols, rows, open } = grid
  const start = nearestOpen(cellOf(from))
  const goal = nearestOpen(cellOf(to))
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
      if (!open[j]) continue
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
  return [from, ...corners.map(centreOf), to].filter((p, k, all) => k === 0 || p.x !== all[k - 1].x || p.y !== all[k - 1].y)
}

const inside = (from, to) => {
  ensureGrid()
  const key = `${from.x},${from.y}>${to.x},${to.y}`
  if (!routes.has(key)) routes.set(key, findPath(from, to))
  return routes.get(key)
}

// Outside the office is open grass: a walk between a place outside (the
// bench, the path) and one inside goes by the corner of the path and the
// front door.
// Outdoors is anywhere no standing room (with its walls) covers.
export const isOutdoors = p =>
  !PLAN.rooms.some(room => {
    if (!isBuilt(room)) return false
    const f = frameOf(room)
    return isIn(p.x, p.y, [f.x, f.y, f.w, f.h])
  })
export const route = (from, to) => {
  const isFromOut = isOutdoors(from)
  const isToOut = isOutdoors(to)
  if (!isFromOut && !isToOut) return inside(from, to)
  const [door, corner] = walkway()
  const points = isFromOut && isToOut ? [from, to] : isFromOut ? [from, corner, ...inside(door, to)] : [...inside(from, door), corner, to]
  return points.filter((p, k) => k === 0 || p.x !== points[k - 1].x || p.y !== points[k - 1].y)
}
// In from the corner of the path outside, through the front door.
const arriveRoute = seat => route(walkway()[1], placeOf(seat).spot)
const deliverRoute = seat => route(placeOf(seat).spot, handoffFor(seat))
const leaveRoute = seat => route(handoffFor(seat), entrance())

// ── Walks ────────────────────────────────────────────────────────────────
// Every walk takes as long as the status file says (the mod's WALKS),
// however far it goes: a longer route is a brisker walk.
export const WALKS = { arrive: 4000, deliver: 3500, handover: 2600, leave: 4000, idle: 180_000 }

const facingOf = (a, b) => (Math.abs(b.x - a.x) > Math.abs(b.y - a.y) ? (b.x > a.x ? 'right' : 'left') : b.y > a.y ? 'front' : 'back')
const lengthOf = points => points.slice(1).reduce((d, p, i) => d + Math.hypot(p.x - points[i].x, p.y - points[i].y), 0)

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

// What a helper is doing at this moment: at its place, or somewhere along a
// walk; null once it is out of the door. A helper off work (idle) is placed
// by the page (see idle.js); `origin` is where it was idling, for the walk
// back to a desk or out of the door.
export const poseOf = (sub, now, walks = WALKS, origin = null) => {
  const e = now - sub.since
  if (sub.phase === 'working') return { seated: true }
  if (sub.phase === 'idle') return { isIdle: true }
  if (sub.phase === 'arriving') {
    if (e >= walks.arrive) return { seated: true }
    return walkAt(sub.from === 'idle' && origin ? route(origin, placeOf(sub.seat).spot) : arriveRoute(sub.seat), e / walks.arrive)
  }
  if (sub.phase === 'delivering') {
    if (e < walks.deliver) return walkAt(deliverRoute(sub.seat), e / walks.deliver)
    if (e < walks.deliver + walks.handover) {
      const spot = handoffFor(sub.seat)
      return { x: spot.x, y: spot.y, facing: 'left', isWalking: false, handover: true }
    }
    const e2 = e - walks.deliver - walks.handover
    return e2 < walks.leave ? walkAt(leaveRoute(sub.seat), e2 / walks.leave) : null
  }
  if (e >= walks.leave) return null
  return walkAt(sub.from === 'idle' && origin ? route(origin, entrance()) : leaveRoute(sub.seat), e / walks.leave)
}

// ── Going home ───────────────────────────────────────────────────────────
// Out of the front door a helper is gone from the status file, but the page
// still sees it walk down the path and away along the pavement, left or
// right as its id says. Only for show: a reload forgets it.
export const HOMEWARD_MS = 9000

// When a helper steps out of the front door, or null if it is not leaving.
export const outAt = (sub, walks = WALKS) =>
  sub.phase === 'leaving' ? sub.since + walks.leave : sub.phase === 'delivering' ? sub.since + walks.deliver + walks.handover + walks.leave : null

export const homewardRoute = id => {
  const [door, corner, street] = walkway()
  const side = hashOf(id) % 2 === 0 ? 1 : -1
  return [door, corner, street, { x: street.x + side * 560, y: street.y }]
}

// Where a helper on its way home is, or null before it is out or once it
// is out of sight.
export const homewardPose = (id, out, now) => {
  const k = (now - out) / HOMEWARD_MS
  return k < 0 || k >= 1 ? null : walkAt(homewardRoute(id), k)
}

// For checking the floor plan after a change: every route a helper or
// Claude can take, walked in small steps; any that crosses a wall, or that A*
// could not find and drew straight, is reported. In the browser console:
// kontorCheckRoutes()
export const checkRoutes = () => {
  ensureGrid()
  const built = PLAN.rooms.filter(isBuilt)
  const floors = built.map(r => [r.x, r.y, typeOf(r).w, typeOf(r).h])
  const doors = PLAN.doors.filter(isOpenDoor).map(d => [d.x - 1, d.y - 1, d.w + 2, d.h + 2])
  // Outside is open ground: arrivals come up the path, and some wait on the bench.
  const isFloor = (x, y) => floors.some(f => isIn(x, y, f)) || doors.some(d => isIn(x, y, d)) || isOutdoors({ x, y })
  const problems = []
  const check = (name, points) => {
    // A straight line indoors means A* found nothing; outdoors it is just a walk across the grass.
    const isIndoors = !isOutdoors(points[0]) || !isOutdoors(points[1])
    if (points.length === 2 && isIndoors && Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y) > 30) problems.push(`${name}: no route found`)
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
  for (const room of built) {
    const t = typeOf(room)
    for (const p of [...(t.standing ?? []), ...(t.stalls ?? []), ...(t.pingpong ?? []), ...(t.chairs ?? []), ...Object.values(t.hobbies ?? {}).flat()]) spots.push(at(room, p))
  }
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
