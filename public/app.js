// Agent-kontor: the office, drawn and animated on a canvas. The server sends
// what each session's status file says; this page works out every step of
// every walk from those timestamps, so nothing reloads and nothing stutters.
'use strict'

// ── The floor plan ───────────────────────────────────────────────────────
// The office is a list of rooms. A room type knows its size and where things
// stand inside it: the desks, Claude's chair, the lamps, what is in the way.
// Those are written in the coordinates of the place the type was first drawn
// for, its home; a room placed elsewhere is shifted by the difference. So a
// room can stand anywhere, a new room only adds to the list, and the world is
// whatever the rooms cover.
const ROOM_TYPES = {
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
    lights: [[176, 120, 44, 0.4]],
    bulbs: [[176, 120]],
    blocks: [[10, 22, 12, 84], [64, 77, 128, 30], [107, 60, 42, 22], [194, 106, 28, 24], [169, 113, 14, 14], [196, 46, 44, 30], [220, 28, 16, 18]],
  },
  kitchen: {
    home: { x: 252, y: 16 },
    w: 222,
    h: 116,
    topWall: 16,
    windows: [290, 390],
    coffee: { x: 318, y: 112 },
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
    plants: [[462, 150, true], [20, 150], [380, 368], [56, 368], [234, 366, true]],
    lights: [[130, 366, 54, 0.42], ...[[166, 200], [314, 200], [166, 300], [314, 300]].map(([x, y]) => [x, y, 66, 0.16, 'ceiling'])],
    bulbs: [[130, 366]],
    blocks: [
      // Desks, and the chairs behind them: walkers go round, not over people
      ...[0, 1, 2, 3, 4, 5].map(i => [50 + (i % 3) * 148, 201 + Math.floor(i / 3) * 102, 84, 30]),
      ...[0, 1, 2, 3, 4, 5].map(i => [71 + (i % 3) * 148, 184 + Math.floor(i / 3) * 102, 42, 22]),
      [8, 178, 14, 76], [14, 356, 30, 18], [138, 346, 84, 31], [290, 349, 52, 28], [452, 334, 16, 24],
    ],
  },
  // Where the other sessions sit
  project: {
    home: { x: 6, y: 384 },
    w: 468,
    h: 118,
    seats: [0, 1, 2, 3].map(i => ({ cx: 72 + i * 112, dy: 440 })),
    lights: [[92, 440], [240, 440], [388, 440]].map(([x, y]) => [x, y, 66, 0.16, 'ceiling']),
    blocks: [0, 1, 2, 3].flatMap(i => [[32 + i * 112, 439, 80, 30], [51 + i * 112, 422, 42, 22]]),
  },
}

const PLAN = {
  rooms: [
    { id: 'claude', type: 'corner', x: 6, y: 16 },
    { id: 'kitchen', type: 'kitchen', x: 252, y: 16 },
    { id: 'team', type: 'team', x: 6, y: 138 },
    { id: 'project', type: 'project', x: 6, y: 384 },
  ],
  // Openings in the walls, in world units, and the front door.
  doors: [
    { x: 246, y: 90, w: 6, h: 32, colour: '#CDB892' },
    { x: 196, y: 132, w: 40, h: 6, colour: '#CDB892' },
    { x: 300, y: 132, w: 40, h: 6, colour: '#D5DAD2' },
    { x: 214, y: 378, w: 48, h: 6, colour: '#C3CCD6' },
    { x: 474, y: 236, w: 6, h: 40, colour: '#8C6B4A', isEntrance: true },
  ],
  entrance: { x: 478, y: 256 },
  doormat: [462, 242, 12, 28],
}

const typeOf = room => ROOM_TYPES[room.type]
const shiftOf = room => ({ dx: room.x - typeOf(room).home.x, dy: room.y - typeOf(room).home.y })
const roomsOf = type => PLAN.rooms.filter(r => r.type === type)
const firstRoom = type => roomsOf(type)[0] ?? null
// A point of a room type, where it stands in this room.
const at = (room, p) => {
  const { dx, dy } = shiftOf(room)
  return 'cx' in p ? { ...p, cx: p.cx + dx, dy: p.dy + dy } : { ...p, x: p.x + dx, y: p.y + dy }
}
const frameOf = room => {
  const t = typeOf(room)
  return { x: room.x - 6, y: room.y - (t.topWall ?? 6), w: t.w + 12, h: t.h + (t.topWall ?? 6) + 6 }
}

// The world: everything the rooms and their walls cover.
const WORLD = (() => {
  const frames = PLAN.rooms.map(frameOf)
  const x = Math.min(...frames.map(f => f.x))
  const y = Math.min(...frames.map(f => f.y))
  return { x, y, w: Math.max(...frames.map(f => f.x + f.w)) - x, h: Math.max(...frames.map(f => f.y + f.h)) - y }
})()
const W = WORLD.w
const H = WORLD.h

// Canvas pixels per world unit at the view that shows everything: set by
// fit() from the window and the screen's pixel density.
let S = 3

// Places, as the floor plan has them now. Every desk the rooms have room
// for, and how many of them are bought (all of them before the server tells).
const deskSlots = () => roomsOf('team').flatMap(room => typeOf(room).desks.map(d => at(room, d)))
const ownedDesks = () => Math.min(deskSlots().length, state.game?.owned?.desks ?? deskSlots().length)
const desks = () => deskSlots().slice(0, ownedDesks())
// Floor spots, the ones that hurt most first: two on the rug of every desk
// not yet bought, then along the walls.
const floorSpots = () => [
  ...deskSlots()
    .slice(ownedDesks())
    .flatMap(({ cx, dy }) => [{ x: cx - 22, y: dy + 28 }, { x: cx + 22, y: dy + 28 }]),
  ...roomsOf('team').flatMap(room => (typeOf(room).floor ?? []).map(p => at(room, p))),
]
const MAIN = (() => {
  const room = firstRoom('corner')
  return at(room, typeOf(room).claude)
})()
const coffeeSpot = () => {
  const room = firstRoom('kitchen')
  return room ? at(room, typeOf(room).coffee) : null
}
const handoffFor = seat => {
  const room = firstRoom('corner')
  return at(room, typeOf(room).handoff(seat))
}
// A helper's place: its desk, or, once the bought desks run out, a spot on
// the floor, where it works on a laptop and lets everyone know.
const placeOf = seat => {
  const list = desks()
  if (seat >= 0 && seat < list.length) {
    const d = list[seat]
    return { isDesk: true, cx: d.cx, dy: d.dy, spot: { x: d.cx, y: d.dy - 6 } }
  }
  const n = Math.max(0, seat - list.length)
  const spots = floorSpots()
  if (n < spots.length) return { isDesk: false, spot: spots[n] }
  // More than the floor holds: in a queue by the door.
  const e = PLAN.entrance
  const k = n - spots.length
  return { isDesk: false, spot: { x: e.x - 30 - (k % 3) * 14, y: e.y - 12 + Math.floor(k / 3) * 16 } }
}

// ── Routes ───────────────────────────────────────────────────────────────
// Walks find their way on a grid of small cells, open where a room's floor
// or a door is and nothing stands in the way, with A*: the fewest steps, and
// a little extra for every turn so a route goes in straight runs. Routes are
// kept until the floor plan changes.
const STEP = 6
const grid = (() => {
  const cols = Math.ceil(W / STEP)
  const rows = Math.ceil(H / STEP)
  const open = new Uint8Array(cols * rows)
  const isIn = (x, y, [rx, ry, rw, rh]) => x >= rx && x <= rx + rw && y >= ry && y <= ry + rh
  const floors = PLAN.rooms.map(r => [r.x + 2, r.y + 2, typeOf(r).w - 4, typeOf(r).h - 4])
  const doors = PLAN.doors.map(d => [d.x, d.y, d.w, d.h])
  // Furniture, with a margin so feet keep clear of it
  const blocks = PLAN.rooms.flatMap(room => {
    const { dx, dy } = shiftOf(room)
    return (typeOf(room).blocks ?? []).map(([x, y, w, h]) => [x + dx - 3, y + dy - 3, w + 6, h + 6])
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
})()

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
  while (queue.length) {
    const i = queue.shift()
    for (const j of [i - 1, i + 1, i - grid.cols, i + grid.cols]) {
      if (j < 0 || j >= grid.open.length || seen.has(j)) continue
      if (grid.open[j]) return j
      seen.add(j)
      queue.push(j)
    }
  }
  return start
}

const TURN = 0.6
const MOVES = [[1, 0], [-1, 0], [0, 1], [0, -1]]

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
  for (let d = 0; d < 4; d++) {
    cost[start * 4 + d] = 0
    push(h(start), start * 4 + d)
  }
  let end = -1
  while (heap.length) {
    const [, s] = pop()
    const i = s >> 2
    const dir = s & 3
    if (i === goal) {
      end = s
      break
    }
    const c = i % cols
    const r = Math.floor(i / cols)
    MOVES.forEach(([mx, my], d) => {
      const nc = c + mx
      const nr = r + my
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) return
      const j = nr * cols + nc
      if (!open[j]) return
      const next = cost[s] + 1 + (d === dir ? 0 : TURN)
      const t = j * 4 + d
      if (next < cost[t]) {
        cost[t] = next
        back[t] = s
        push(next + h(j), t)
      }
    })
  }
  if (end < 0) return [from, to]
  // Back to the start, then only the corners kept.
  const cells = []
  for (let s = end; s >= 0; s = back[s]) cells.push(s >> 2)
  cells.reverse()
  const corners = cells.filter((cell, k) => {
    if (k === 0 || k === cells.length - 1) return true
    const a = cells[k - 1]
    const b = cells[k + 1]
    return b - cell !== cell - a
  })
  const points = corners.map(centreOf)
  return [from, ...points, to].filter((p, k, all) => k === 0 || p.x !== all[k - 1].x || p.y !== all[k - 1].y)
}

const routes = new Map()
const route = (from, to) => {
  const key = `${from.x},${from.y}>${to.x},${to.y}`
  if (!routes.has(key)) routes.set(key, findPath(from, to))
  return routes.get(key)
}
const arriveRoute = seat => route(PLAN.entrance, placeOf(seat).spot)
const deliverRoute = seat => route(placeOf(seat).spot, handoffFor(seat))
const leaveRoute = seat => route(handoffFor(seat), PLAN.entrance)

// ── Walks ────────────────────────────────────────────────────────────────
// Every walk takes as long as the status file says (the mod's WALKS),
// however far it goes: a longer route is a brisker walk.
const WALKS = { arrive: 4000, deliver: 3500, handover: 2600, leave: 4000 }

const facingOf = (a, b) => (Math.abs(b.x - a.x) > Math.abs(b.y - a.y) ? (b.x > a.x ? 'right' : 'left') : b.y > a.y ? 'front' : 'back')
const lengthOf = points => points.slice(1).reduce((d, p, i) => d + Math.hypot(p.x - points[i].x, p.y - points[i].y), 0)

// Where a walk has got to at the fraction k of its time.
const walkAt = (points, k) => {
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
// walk; null once it is out of the door.
const poseOf = (sub, now, walks = WALKS) => {
  const e = now - sub.since
  if (sub.phase === 'working') return { seated: true }
  if (sub.phase === 'arriving') return e < walks.arrive ? walkAt(arriveRoute(sub.seat), e / walks.arrive) : { seated: true }
  if (sub.phase === 'delivering') {
    if (e < walks.deliver) return walkAt(deliverRoute(sub.seat), e / walks.deliver)
    if (e < walks.deliver + walks.handover) {
      const spot = handoffFor(sub.seat)
      return { x: spot.x, y: spot.y, facing: 'left', isWalking: false, handover: true }
    }
    const e2 = e - walks.deliver - walks.handover
    return e2 < walks.leave ? walkAt(leaveRoute(sub.seat), e2 / walks.leave) : null
  }
  return e < walks.leave ? walkAt(leaveRoute(sub.seat), e / walks.leave) : null
}

// ── Look ─────────────────────────────────────────────────────────────────
const OUTLINE = '#2B2230'
const P = 3.5
const FONT = "'Segoe UI', system-ui, -apple-system, sans-serif"
const stateColor = { working: '#8A94A0', reading: '#2BA39A', editing: '#3B8FE0', running: '#D9932B', browsing: '#7B6BDE', waiting: '#E5484D', idle: '#8A94A0' }
const screens = { working: '#5E6B7A', reading: '#E9EEF2', editing: '#1F2A44', running: '#0F1418', browsing: '#D7E9FA', waiting: '#E5484D', idle: '#1B2433' }

// Skin tones from light to deep, evenly spread so an office of six looks
// like a real mix of people.
const skins = ['#F7DCC4', '#EFC39C', '#E0A97A', '#C68A5C', '#A86F45', '#8A5634', '#6B3F25']
const hairs = [['#3A2A22', '#5C4436'], ['#7A4B2A', '#9C6A43'], ['#D9B25C', '#F0D48A'], ['#2B2B33', '#4A4A57'], ['#B5523B', '#D27358'], ['#9AA0A8', '#C3C8CE']]
const shirts = [['#3E7CC9', '#2F5F9C'], ['#2E9E8F', '#21776B'], ['#E07A4F', '#B85E38'], ['#8A6FD6', '#6A52AE'], ['#D6A23C', '#AD7F26'], ['#D45D7A', '#AC4560'], ['#4F9A5B', '#3A7644']]
const hashOf = id => {
  let h = 0
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h
}
// Ids that differ only at the end ("agent-1", "agent-2") hash to neighbouring
// numbers, whose high bits are the same: each trait is picked from the hash
// stirred with its own salt, so neighbours look nothing alike.
const stir = (h, salt) => {
  let x = (h ^ Math.imul(salt, 0x9e3779b1)) >>> 0
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0
  return (x ^ (x >>> 16)) >>> 0
}
const lookFor = id => {
  const h = hashOf(id)
  const [hair, hairLight] = hairs[stir(h, 1) % hairs.length]
  const [shirt, shirtShade] = shirts[stir(h, 2) % shirts.length]
  return { hair, hairLight, skin: skins[stir(h, 3) % skins.length], shirt, shirtShade }
}
const claudeLook = { hair: '#C8643B', hairLight: '#E3875E', skin: '#F6D5B8', shirt: '#2F3A4A', shirtShade: '#222B37' }

const BODY = ['..oooooo..', '.ohhhhhho.', 'ohhHhhhhho', 'ohssssssho', 'ohsessesho', '.osssssso.', '.otttttTo.', 'otttttttTo', 'otttttttTo', 'osttttttso']
const BACK = ['..oooooo..', '.ohhhhhho.', 'ohhHhhhhho', 'ohhhhhhhho', 'ohhhhhhhho', '.ohhhhhho.', '.otttttTo.', 'otttttttTo', 'otttttttTo', 'osttttttso']
const SIDE = ['..ooooo...', '.ohhhhhoo.', 'ohHhhhhhho', 'ohhhsssso.', 'ohhsseso..', '.ohsssso..', '..otttTo..', '.ottttTo..', '.ottttTo..', '..osttso..']
const LEGS = ['.oppppppo.', '.opo..opo.', '.obo..obo.', '.oo....oo.']
const FRONT_WALK = [['.oppppppo.', '.opo..opo.', '.obo..oo..', '.oo.......'], LEGS, ['.oppppppo.', '.opo..opo.', '..oo..obo.', '.......oo.'], LEGS]
const SIDE_STAND = ['..opppo...', '..oppo....', '..obbo....', '..oooo....']
const SIDE_STEP = ['..opppo...', '.op..po...', 'ob....bo..', 'oo....oo..']
const SIDE_WALK = [SIDE_STEP, SIDE_STAND, SIDE_STEP, SIDE_STAND]

// ── Canvas ───────────────────────────────────────────────────────────────
const canvas = document.getElementById('office')
const stage = document.getElementById('stage')
const ctx = canvas.getContext('2d')

// The office as large as its space allows, whole and in proportion. The scene
// keeps its own units (W × H), so a bigger office later only changes those.
const fit = () => {
  const room = stage.getBoundingClientRect()
  const scale = Math.max(0.5, Math.min(room.width / W, room.height / H))
  const dpr = window.devicePixelRatio || 1
  const next = scale * dpr
  canvas.style.width = `${Math.floor(W * scale)}px`
  canvas.style.height = `${Math.floor(H * scale)}px`
  if (Math.abs(next - S) < 0.01 && canvas.width === Math.round(W * S)) return
  S = next
  canvas.width = Math.round(W * S)
  canvas.height = Math.round(H * S)
  background.width = canvas.width
  background.height = canvas.height
  backgroundKey = ''
}

const rect = (x, y, w, h, fill) => {
  ctx.fillStyle = fill
  ctx.fillRect(x, y, w, h)
}
const circle = (x, y, r, fill, stroke) => {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = fill
  ctx.fill()
  if (stroke) {
    ctx.lineWidth = 1
    ctx.strokeStyle = stroke
    ctx.stroke()
  }
}
const rounded = (x, y, w, h, r, fill, stroke, lineWidth = 1.5) => {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.fillStyle = fill
  ctx.fill()
  if (stroke) {
    ctx.lineWidth = lineWidth
    ctx.strokeStyle = stroke
    ctx.stroke()
  }
}
const label = (text, x, y, size, color, weight = 700, align = 'center') => {
  ctx.font = `${weight} ${size}px ${FONT}`
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(text, x, y)
}
const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

const paintRows = (rows, look, x, y, isBlinking = false) => {
  const colour = { o: OUTLINE, h: look.hair, H: look.hairLight, s: look.skin, e: isBlinking ? look.skin : OUTLINE, t: look.shirt, T: look.shirtShade, p: '#3B4A6B', b: OUTLINE }
  rows.forEach((row, r) => {
    let c = 0
    while (c < row.length) {
      const ch = row[c]
      let end = c
      while (end < row.length && row[end] === ch) end++
      if (colour[ch]) rect(x + c * P, y + r * P, (end - c) * P + 0.08, P + 0.08, colour[ch])
      c = end
    }
  })
}

// Everyone blinks now and then, each on their own beat (seed), and someone
// sitting breathes: the body rises half a sprite pixel and settles.
const isBlinking = (t, seed) => (t + seed * 613) % 4300 < 140
const breath = (t, seed) => ((t + seed * 311) % 2600 < 1300 ? 0 : P / 2)

// A person on their feet at (x, y).
const standing = (x, y, look, facing, isWalking, t, seed = 0) => {
  const body = facing === 'back' ? BACK : facing === 'front' ? BODY : SIDE
  const isSide = facing === 'left' || facing === 'right'
  const frames = isWalking ? (isSide ? SIDE_WALK : FRONT_WALK) : [isSide ? SIDE_STAND : LEGS]
  const i = isWalking ? Math.floor(t / 130) % 4 : 0
  // Down a pixel as a foot lands: the bob of a step, body over the waist.
  const sink = isWalking && i % 2 === 0 ? P : 0
  const top = y - (body.length + 4) * P
  shadow(x, y + 1, 9, 2.8)
  ctx.save()
  if (facing === 'left') {
    ctx.translate(x * 2, 0)
    ctx.scale(-1, 1)
  }
  paintRows(body, look, x - 5 * P, top + sink, facing !== 'back' && isBlinking(t, seed))
  paintRows(frames[i], look, x - 5 * P, top + body.length * P)
  ctx.restore()
}

// A person sitting at a desk, feet hidden: the body from (x, y) up.
const sitting = (x, y, look, handUp, t, seed = 0) => {
  const top = y - BODY.length * P - breath(t, seed)
  paintRows(BODY, look, x - 5 * P, top, isBlinking(t, seed))
  if (handUp) {
    const wave = Math.floor(t / 350) % 2
    const left = x + 5 * P + wave
    rect(left, top - wave, 2 * P, 8 * P, OUTLINE)
    rect(left, top + P - wave, P, 2 * P, look.skin)
    rect(left, top + 3 * P - wave, P, 4 * P, look.shirt)
  }
}

// A soft shadow on the floor, under whoever or whatever stands there.
const shadow = (x, y, rx, ry, alpha = 0.2) => {
  ctx.globalAlpha = alpha
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
  ctx.fillStyle = '#000000'
  ctx.fill()
  ctx.globalAlpha = 1
}

// On the floor, legs crossed, laptop on the lap.
const onTheFloor = (x, y, look, t, seed) => {
  shadow(x, y + 1, 12, 3)
  sitting(x, y - 4, look, false, t, seed)
  rect(x - 11, y - 6, 22, 6, OUTLINE)
  rect(x - 10, y - 5, 20, 4, '#3B4A6B')
  // The laptop, its screen towards them
  rect(x - 9, y - 14, 18, 2.5, OUTLINE)
  rect(x - 9, y - 11.5, 18, 6, OUTLINE)
  rect(x - 8, y - 10.5, 16, 4, '#C9CED3')
  rect(x - 6, y - 9.5, 12, 0.8, '#9CA6B0')
  rect(x - 6, y - 8, 12, 0.8, '#9CA6B0')
}

// What a helper on the floor has to say about it, now and then, in turn
// with what it is doing.
const GRUMBLES = [
  'Av, min ryg',
  'Har vi ikke en stol?',
  'Jeg vil også have et skrivebord',
  'Gulvet er koldt',
  'Laptop på skødet, seriøst?',
  'Hvem har taget min plads?',
  'Jeg skriver det her i et klagebrev',
  'Mine ben sover',
]
const grumbleAt = (t, seed) => ((t + seed * 997) % 9000 < 3000 ? GRUMBLES[Math.floor((t + seed * 997) / 9000 + seed) % GRUMBLES.length] : null)

// A desk you can buy next: an outline on the floor where it will stand, and
// a sign over it with the price, drawn above everyone so it is never hidden.
const forSaleOutline = (cx, dy, canAfford) => {
  ctx.setLineDash([3, 3])
  rounded(cx - 42, dy - 18, 84, 48, 4, 'rgba(255,255,255,0.18)', canAfford ? '#2E9E8F' : '#8A94A0', 1.2)
  ctx.setLineDash([])
}
const forSaleSign = (cx, dy, price, canAfford, t) => {
  const bob = canAfford ? Math.sin(t / 300) * 1 : 0
  tag(cx, dy - 32 + bob, canAfford ? `Køb skrivebord: ${kr(price)}` : `Skrivebord: ${kr(price)}`, canAfford ? '#2E9E8F' : '#5B6672')
}

const chair = (cx, dy) => {
  shadow(cx + 2, dy + 4, 22, 5, 0.14)
  rounded(cx - 21, dy - 18, 42, 22, 5, OUTLINE)
  rounded(cx - 19, dy - 16, 38, 18, 4, '#465566')
  rounded(cx - 17, dy - 14, 34, 3, 1.5, '#5A6B7E')
}

const screenArt = (x, y, state, t) => {
  if (state === 'editing') {
    const shift = Math.floor(t / 500) % 2
    ;['#7FB4F0', '#E8A33D', '#9BD58B'].forEach((c, i) => rect(x + 2 + (i % 2) * 2, y + 2 + i * 3 - shift, 8 - i * 2, 1.5, c))
  } else if (state === 'running') {
    rect(x + 2, y + 2, 7, 1.5, '#3DDC84')
    if (Math.floor(t / 400) % 2 === 0) rect(x + 2, y + 6, 2, 2, '#3DDC84')
  } else if (state === 'reading') {
    ;[0, 1, 2].forEach(i => rect(x + 2, y + 2 + i * 3, 10 - (i % 2) * 3, 1.5, '#AEB8C2'))
  } else if (state === 'browsing') {
    rect(x, y, 14, 2.5, '#3E7CC9')
    rect(x + 2, y + 4, 6, 4, '#9CC4EC')
  } else if (state === 'waiting' && Math.floor(t / 450) % 2 === 0) {
    rect(x + 6, y + 2, 2, 5, '#FFFFFF')
    rect(x + 6, y + 8, 2, 2, '#FFFFFF')
  }
}

const monitor = (x, dy, state, t) => {
  rect(x - 1, dy + 1, 22, 16, OUTLINE)
  rect(x, dy + 2, 20, 13, state ? screens[state] : '#141A22')
  if (state) screenArt(x + 2, dy + 4, state, t)
  rect(x + 8, dy + 17, 4, 3, OUTLINE)
}

const desk = (cx, dy, w, state, t, monitors = 1) => {
  const left = cx - w / 2
  ctx.globalAlpha = 0.13
  rounded(left + 3, dy + 4, w, 28, 2, '#000000')
  ctx.globalAlpha = 1
  rounded(left - 1, dy - 1, w + 2, 30, 2, OUTLINE)
  rect(left, dy, w, 22, '#E4C79C')
  rect(left, dy, w, 2, '#F1DBB8')
  rect(left, dy + 22, w, 6, '#B98F5E')
  monitor(cx + w / 2 - 28, dy, state, t)
  if (monitors > 1) monitor(cx - w / 2 + 8, dy, state, t)
  rounded(cx - 12, dy + 12, 24, 7, 1, '#D3D8DD', OUTLINE, 1)
  rect(cx - 9, dy + 14, 18, 1, '#AEB6BF')
  rect(cx - 9, dy + 16, 18, 1, '#AEB6BF')
}

// Little things on a helper's desk, left of the keyboard: two of these,
// chosen by its id, so the same helper always has the same desk.
const deskThings = [
  // a mug
  (x, y) => {
    rect(x, y, 6, 6, OUTLINE)
    rect(x + 1, y + 1, 4, 4, '#FFFFFF')
    rect(x + 1, y + 1, 4, 1.5, '#7A4B2A')
    rect(x + 6, y + 2, 1.5, 2.5, OUTLINE)
  },
  // a little plant
  (x, y) => {
    rect(x + 1, y + 4, 5, 4, '#B5683E')
    circle(x + 3.5, y + 3, 3.4, '#3E8A55', OUTLINE)
    circle(x + 2.5, y + 2, 1.4, '#6CC082')
  },
  // a stack of papers
  (x, y) => {
    rect(x + 1, y + 1, 9, 7, '#C9CED3')
    rect(x, y, 9, 7, '#FFFFFF')
    rect(x + 1.5, y + 2, 6, 0.8, '#AEB6BF')
    rect(x + 1.5, y + 4, 4, 0.8, '#AEB6BF')
  },
  // a rubber duck
  (x, y) => {
    circle(x + 3, y + 4.5, 3, '#F2C94C', OUTLINE)
    circle(x + 5, y + 2, 1.8, '#F2C94C', OUTLINE)
    rect(x + 6.3, y + 1.8, 1.6, 1, '#E07A4F')
  },
  // headphones
  (x, y) => {
    ctx.beginPath()
    ctx.arc(x + 4, y + 4, 3.4, Math.PI, 0)
    ctx.lineWidth = 1.2
    ctx.strokeStyle = OUTLINE
    ctx.stroke()
    rect(x - 0.5, y + 3.5, 2.5, 3.5, OUTLINE)
    rect(x + 6, y + 3.5, 2.5, 3.5, OUTLINE)
  },
  // a framed photo
  (x, y) => {
    rect(x, y, 7, 6, OUTLINE)
    rect(x + 1, y + 1, 5, 4, '#9CC4EC')
    rect(x + 1, y + 3.5, 5, 1.5, '#56A86B')
  },
  // a snack
  (x, y) => {
    rect(x, y + 1, 8, 5, OUTLINE)
    rect(x + 1, y + 2, 6, 3, '#E5484D')
    rect(x + 2.5, y + 2.5, 3, 1, '#FFFFFF')
  },
]
const deskThingsFor = (id, cx, dy) => {
  const h = hashOf(id)
  const first = h % deskThings.length
  const second = (first + 1 + ((h >>> 5) % (deskThings.length - 1))) % deskThings.length
  deskThings[first](cx - 38, dy + 3)
  deskThings[second](cx - 27, dy + 12)
}

const hands = (cx, dy, look, isTyping, t) => {
  const lift = isTyping ? [0, -1.5, 0, -0.5][Math.floor(t / 75) % 4] : 0
  rect(cx - 11, dy + 9 + lift, 7, 5, OUTLINE)
  rect(cx - 10, dy + 10 + lift, 5, 3, look.skin)
  rect(cx + 4, dy + 9 - lift, 7, 5, OUTLINE)
  rect(cx + 5, dy + 10 - lift, 5, 3, look.skin)
}

const bubble = (cx, bottom, text, isAlert, t) => {
  const words = clip(text, 30)
  ctx.font = `600 8.5px ${FONT}`
  const w = Math.round(ctx.measureText(words).width + 14)
  const x = Math.round(cx - w / 2)
  const y = bottom - 16
  ctx.globalAlpha = isAlert ? 0.75 + 0.25 * Math.sin(t / 140) : 1
  const fill = isAlert ? '#E5484D' : '#FFFFFF'
  rounded(x, y, w, 14, 3, fill, OUTLINE)
  ctx.beginPath()
  ctx.moveTo(cx - 3, y + 13.5)
  ctx.lineTo(cx, y + 18)
  ctx.lineTo(cx + 3, y + 13.5)
  ctx.fillStyle = fill
  ctx.fill()
  ctx.lineWidth = 1.5
  ctx.strokeStyle = OUTLINE
  ctx.stroke()
  rect(cx - 2.5, y + 12, 5, 2, fill)
  label(words, cx, y + 10, 8.5, isAlert ? '#FFFFFF' : OUTLINE, 600)
  ctx.globalAlpha = 1
}

// Thinking, with nothing to say yet: a cloud with three dots that bob in
// turn, and two small puffs trailing down to the head.
const thought = (cx, bottom, t) => {
  const y = bottom - 15
  const puff = (x, py, r) => circle(x, py, r, '#FFFFFF', OUTLINE)
  puff(cx + 1, bottom + 1, 1.6)
  puff(cx + 4, bottom - 3, 2.4)
  for (const [dx, dy, r] of [[-9, 7, 6], [9, 7, 6], [-4, 3, 7], [5, 3, 7], [0, 8, 6.5]]) puff(cx + dx, y + dy, r)
  // The outlines inside the cloud, painted over
  for (const [dx, dy, r] of [[-9, 7, 5.2], [9, 7, 5.2], [-4, 3, 6.2], [5, 3, 6.2], [0, 8, 5.7]]) circle(cx + dx, y + dy, r, '#FFFFFF')
  for (let i = 0; i < 3; i++) {
    const lift = Math.max(0, Math.sin(t / 170 - i * 0.9)) * 1.6
    circle(cx - 5 + i * 5, y + 7 - lift, 1.3, '#5B6672')
  }
}

// What someone says: a thought cloud while they are only thinking, the
// words otherwise, red while they wait for you.
const say = (cx, bottom, activity, t) => {
  if (activity.detail === 'Tænker' && activity.state !== 'waiting') thought(cx, bottom, t)
  else bubble(cx, bottom, activity.detail, activity.state === 'waiting', t)
}

const tag = (cx, y, text, colour) => {
  ctx.font = `700 7.5px ${FONT}`
  const w = Math.round(ctx.measureText(text).width + 10)
  ctx.globalAlpha = 0.9
  rounded(cx - w / 2, y, w, 11, 5.5, colour)
  ctx.globalAlpha = 1
  label(text, cx, y + 8, 7.5, '#FFFFFF')
}

const plant = (x, y, big = false) => {
  const r = big ? 9 : 7
  rect(x - 5, y, 10, 8, '#B5683E')
  circle(x, y - 2, r, '#3E8A55', OUTLINE)
  circle(x - r / 2, y - 4, r / 2, '#56A86B')
  circle(x + r / 3, y - r, r / 3, '#6CC082')
}

// ── Things on the walls that change ──────────────────────────────────────
const kr = n => `${Math.floor(n).toLocaleString('da-DK')} kr`

// The day's lines and the money in the bank, in marker on Claude's board.
const board = (stats, kroner) => {
  const room = firstRoom('corner')
  if (!room) return
  const b = at(room, typeOf(room).board)
  const left = b.x + 4
  label('I dag', left, b.y + 7, 5.5, '#5B6672', 700, 'left')
  if (!stats || (!stats.linesAdded && !stats.linesRemoved && typeof kroner !== 'number')) {
    rect(left, b.y + 12, 26, 1.5, '#3E7CC9')
    rect(left, b.y + 17, 18, 1.5, '#E07A4F')
    return
  }
  label(`+${stats.linesAdded ?? 0}`, left, b.y + 15, 7, '#2E9E8F', 700, 'left')
  ctx.font = `700 7px ${FONT}`
  const shift = ctx.measureText(`+${stats.linesAdded ?? 0} `).width
  label(`−${stats.linesRemoved ?? 0}`, left + shift, b.y + 15, 7, '#E5484D', 700, 'left')
  if (typeof kroner === 'number') label(kr(kroner), left, b.y + 24, 7, '#3E7CC9', 700, 'left')
}

// A wall clock showing the time it is.
const clock = date => {
  const room = firstRoom('kitchen')
  if (!room) return
  const { x, y } = at(room, typeOf(room).clock)
  const r = typeOf(room).clock.r
  circle(x, y, r + 1, OUTLINE)
  circle(x, y, r, '#FFFFFF')
  for (let i = 0; i < 12; i += 3) {
    const a = (i / 12) * Math.PI * 2
    rect(x + Math.sin(a) * (r - 1.5) - 0.5, y - Math.cos(a) * (r - 1.5) - 0.5, 1, 1, '#8A94A0')
  }
  const hand = (turn, length, width, colour) => {
    const a = turn * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + Math.sin(a) * length, y - Math.cos(a) * length)
    ctx.lineWidth = width
    ctx.lineCap = 'round'
    ctx.strokeStyle = colour
    ctx.stroke()
  }
  const minutes = date.getMinutes() + date.getSeconds() / 60
  hand(((date.getHours() % 12) + minutes / 60) / 12, r * 0.5, 1.2, OUTLINE)
  hand(minutes / 60, r * 0.8, 0.8, OUTLINE)
  hand(date.getSeconds() / 60, r * 0.85, 0.4, '#E5484D')
}

// ── Light ────────────────────────────────────────────────────────────────
// The time of day, in hours (14.5 is half past two). ?tid=21:30 in the
// address shows the office at that time instead, to see the evening by day.
const timeOfDay = () => {
  const asked = new URLSearchParams(location.search).get('tid')
  if (asked) {
    const [h, m = '0'] = asked.split(':')
    if (!Number.isNaN(Number(h))) return Number(h) + Number(m) / 60
  }
  const d = new Date()
  return d.getHours() + d.getMinutes() / 60
}

// How dark it is: none in the working day, deepening through the evening.
const NIGHT = 0.55
const darknessAt = h => {
  if (h >= 8 && h <= 17) return 0
  if (h > 17 && h < 20) return ((h - 17) / 3) * NIGHT
  if (h >= 6 && h < 8) return ((8 - h) / 2) * NIGHT
  return NIGHT
}

// The windows of every room, where they are now: in a top wall (x, the top
// of the room) and in side walls (x of the wall, y, height, which way in).
const topWindows = () =>
  PLAN.rooms.flatMap(room => (typeOf(room).windows ?? []).map(x => ({ x: x + shiftOf(room).dx, y: room.y })))
const sideWindows = () =>
  PLAN.rooms.flatMap(room =>
    (typeOf(room).sideWindows ?? []).map(([x, y, h]) => {
      const { dx, dy } = shiftOf(room)
      return { x: x + dx, y: y + dy, h, isLeft: x + dx < room.x }
    }),
  )

// Sunlight through the windows, falling at an angle that follows the sun:
// from the east in the morning, from the west in the afternoon.
const daylight = h => {
  const strength = 1 - darknessAt(h) / NIGHT
  if (strength <= 0) return
  const warm = h < 10 || h > 15
  const colour = warm ? '255, 196, 110' : '255, 232, 160'
  const slant = (12 - h) * 5
  const beam = (points, x0, y0, x1, y1) => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1)
    g.addColorStop(0, `rgba(${colour}, ${0.6 * strength})`)
    g.addColorStop(1, `rgba(${colour}, 0)`)
    ctx.fillStyle = g
    ctx.beginPath()
    points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
    ctx.closePath()
    ctx.fill()
  }
  for (const { x, y } of topWindows()) {
    beam([[x, y], [x + 56, y], [x + 64 + slant, y + 76], [x - 8 + slant, y + 76]], 0, y, 0, y + 76)
  }
  // The low sun reaches in through one side or the other.
  for (const w of sideWindows()) {
    ctx.globalAlpha = w.isLeft ? (h < 12 ? 1 : 0.35) : h >= 12 ? 1 : 0.35
    const inner = w.isLeft ? w.x + 6 : w.x
    const far = w.isLeft ? inner + 84 : inner - 84
    beam([[inner, w.y], [inner, w.y + w.h], [far, w.y + w.h + 18], [far, w.y - 18]], inner, 0, far, 0)
  }
  ctx.globalAlpha = 1
}

// The evening: the room darkens, and what gives light glows: the lamps, the
// pendant over the kitchen table, the ceiling lights and every screen in use.
const evening = (h, screens) => {
  const dark = darknessAt(h)
  if (dark <= 0) return
  ctx.fillStyle = `rgba(12, 18, 42, ${dark})`
  ctx.fillRect(WORLD.x, WORLD.y, W, H)
  const k = dark / NIGHT
  const glow = (x, y, r, colour, alpha) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, `rgba(${colour}, ${alpha * k})`)
    g.addColorStop(1, `rgba(${colour}, 0)`)
    ctx.fillStyle = g
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }
  ctx.globalCompositeOperation = 'lighter'
  for (const room of visibleRooms()) {
    const { dx, dy } = shiftOf(room)
    for (const [x, y, r, alpha, kind] of typeOf(room).lights ?? []) glow(x + dx, y + dy, r, kind === 'ceiling' ? '255, 228, 180' : '255, 196, 120', alpha)
  }
  for (const [x, y] of screens) glow(x, y, 26, '130, 180, 255', 0.3)
  ctx.globalCompositeOperation = 'source-over'
  // The bulbs themselves
  for (const room of visibleRooms()) {
    const { dx, dy } = shiftOf(room)
    for (const [x, y] of typeOf(room).bulbs ?? []) circle(x + dx, y + dy, 1.8, '#FFF3C4')
  }
}

// ── The building, drawn once for each light and view ─────────────────────
const WALL = '#3E4852'
const WALL_TOP = '#5A6672'
const background = document.createElement('canvas')
let backgroundKey = ''

// Each room type's own floor and furniture, in its home coordinates.
const roomDrawers = {
  corner: (g, fill, dot) => {
    // Oak planks
    fill(6, 16, 240, 116, '#DCC194')
    for (let i = 0; i < 11; i++) {
      fill(6, 18 + i * 10, 240, 1, '#C9AC7E')
      fill(20 + ((i * 47) % 210), 18 + i * 10, 1, 10, '#C9AC7E')
    }
    // The rug under Claude's desk
    g.globalAlpha = 0.35
    fill(52, 40, 152, 86, OUTLINE)
    g.globalAlpha = 1
    fill(54, 42, 148, 82, '#6F9C8E')
    g.strokeStyle = '#9CC2B5'
    g.lineWidth = 2
    g.strokeRect(58, 46, 140, 74)
    for (const k of [0, 1]) {
      fill(10, 22 + k * 44, 12, 40, OUTLINE)
      fill(11, 23 + k * 44, 10, 38, '#8B5E3C')
      ;['#D45D7A', '#3E7CC9', '#D6A23C', '#2E9E8F', '#8A6FD6'].forEach((c, i) => fill(12, 25 + k * 44 + i * 7, 8, 5, ['#D45D7A', '#3E7CC9', '#D6A23C', '#2E9E8F', '#8A6FD6'][(i + k) % 5]))
    }
    // An armchair by the door, and a side table with a lamp
    fill(194, 106, 28, 24, OUTLINE)
    fill(195, 107, 26, 6, '#A9512E')
    fill(195, 107, 5, 22, '#B85A33')
    fill(216, 107, 5, 22, '#B85A33')
    fill(200, 113, 16, 15, '#D9744A')
    fill(202, 115, 12, 3, '#E99A73')
    dot(176, 120, 7, OUTLINE)
    dot(176, 120, 5.8, '#B98F5E')
    dot(176, 120, 3.2, '#F6E3A8', '#C9A55A')
    // The whiteboard; board() writes the day's numbers on it
    const b = ROOM_TYPES.corner.board
    fill(b.x - 1, b.y - 1, b.w + 2, b.h + 2, OUTLINE)
    fill(b.x, b.y, b.w, b.h, '#F6F7F8')
    fill(b.x + 2, b.y + b.h - 1, b.w - 4, 2, '#B9C3CC')
    fill(b.x + 6, b.y + b.h - 1.5, 5, 1.5, '#E5484D')
    fill(b.x + 13, b.y + b.h - 1.5, 5, 1.5, '#3E7CC9')
  },

  kitchen: (g, fill, dot) => {
    // Tiles
    fill(252, 16, 222, 116, '#F3F5F6')
    for (let c = 0; c < 19; c++) for (let r = 0; r < 10; r++) if ((c + r) % 2 === 0) fill(252 + c * 12, 16 + r * 12, 12, 12, '#E4E8EB')
    // The counter, with the coffee machine, sink and stove
    fill(256, 18, 150, 16, OUTLINE)
    fill(257, 19, 148, 14, '#F7F7F5')
    fill(257, 31, 148, 2, '#C9CED3')
    fill(266, 20, 14, 12, '#2B2F36')
    dot(273, 26, 2, '#E07A4F')
    fill(300, 21, 22, 9, '#B9C3CC')
    fill(330, 21, 20, 10, '#9CB4C6')
    fill(336, 23, 8, 5, '#D7E9FA')
    dot(386, 26, 4, '#E9EEF2', OUTLINE)
    for (const x of [280, 312, 344, 376]) {
      dot(x, 44, 5, OUTLINE)
      dot(x, 44, 3.8, '#C9A273')
    }
    // The fridge
    fill(440, 18, 28, 34, OUTLINE)
    fill(441, 19, 26, 32, '#E9EEF2')
    fill(441, 33, 26, 1, '#B9C3CC')
    // A round rug under the big table
    dot(368, 92, 34, '#DDE6E0')
    dot(368, 92, 31, '#E8EFEA')
    g.strokeStyle = '#C9D6CD'
    g.lineWidth = 1
    g.beginPath()
    g.arc(368, 92, 26, 0, Math.PI * 2)
    g.stroke()
    dot(368, 92, 20, OUTLINE)
    dot(368, 92, 18.5, '#C9A273')
    dot(368, 92, 15, '#D9B88A')
    dot(368, 92, 6, '#F7F7F5', OUTLINE)
    dot(366, 90, 2, '#E07A4F')
    dot(370, 91, 2, '#D6A23C')
    dot(368, 94, 2, '#56A86B')
    for (const [x, y] of [[368, 64], [396, 92], [368, 120]]) {
      dot(x, y, 7, OUTLINE)
      dot(x, y, 5.5, '#465566')
    }
    // A small bistro table for two in the corner
    for (const y of [74, 108]) {
      dot(276, y, 5.5, OUTLINE)
      dot(276, y, 4.2, '#C9A273')
    }
    dot(276, 91, 9, OUTLINE)
    dot(276, 91, 7.8, '#F7F7F5')
    dot(273, 89, 2, '#FFFFFF', '#B9C3CC')
    dot(279, 93, 1.6, '#7A4B2A')
    // A snack machine under the fridge
    fill(436, 64, 32, 30, OUTLINE)
    fill(437, 65, 30, 28, '#3E7CC9')
    fill(439, 67, 19, 22, '#D7E9FA')
    ;['#E5484D', '#D6A23C', '#2E9E8F', '#E07A4F', '#8A6FD6', '#56A86B'].forEach((c, i) => fill(441 + (i % 3) * 6, 69 + Math.floor(i / 3) * 10, 4, 6, c))
    fill(460, 69, 5, 3, '#2B2F36')
    fill(460, 76, 5, 10, '#2F5F9C')
  },

  team: (g, fill, dot) => {
    // Sage carpet
    fill(6, 138, 468, 240, '#CBD9C7')
    for (let c = 0; c < 20; c++) fill(6 + c * 24, 138, 1, 240, '#BCCBB8')
    for (let r = 0; r < 10; r++) fill(6, 138 + r * 24, 468, 1, '#BCCBB8')
    // A soft rug under each desk, each its own colour
    const rugs = [['#BCD0C4', '#AFC4B7'], ['#CFC6DC', '#C2B8D1'], ['#DDCDB7', '#D1BFA6'], ['#BFD0DD', '#B0C3D2'], ['#DCC7CB', '#D0B7BC'], ['#CBD5B5', '#BDC9A5']]
    ROOM_TYPES.team.desks.forEach(({ cx, dy }, i) => {
      const [base, edge] = rugs[i % rugs.length]
      g.fillStyle = edge
      g.beginPath()
      g.roundRect(cx - 52, dy - 26, 104, 64, 6)
      g.fill()
      g.fillStyle = base
      g.beginPath()
      g.roundRect(cx - 49, dy - 23, 98, 58, 4)
      g.fill()
    })
    // A bookshelf along the left wall
    fill(8, 178, 14, 76, OUTLINE)
    fill(9, 179, 12, 74, '#8B5E3C')
    ;['#D45D7A', '#3E7CC9', '#D6A23C', '#2E9E8F', '#8A6FD6', '#E07A4F', '#56A86B', '#D45D7A', '#3E7CC9', '#D6A23C'].forEach((c, i) => fill(10, 181 + i * 7, 10, 5, c))
    // The printer
    fill(14, 356, 30, 18, OUTLINE)
    fill(15, 357, 28, 16, '#D3D8DD')
    fill(19, 360, 20, 3, '#2B2F36')
    fill(21, 365, 16, 6, '#F6F7F8')
    // The lounge corner: a rug, a sofa against the wall, a coffee table, a lamp
    g.fillStyle = '#E6D3B3'
    g.beginPath()
    g.roundRect(138, 346, 84, 31, 4)
    g.fill()
    g.strokeStyle = '#D2BC97'
    g.lineWidth = 1
    g.strokeRect(141.5, 349.5, 77, 24)
    fill(146, 361, 66, 16, OUTLINE)
    fill(147, 368, 64, 8, '#4F7FA8')
    fill(147, 362, 64, 7, '#3D6A92')
    fill(147, 362, 6, 14, '#3D6A92')
    fill(205, 362, 6, 14, '#3D6A92')
    fill(155, 369, 22, 6, '#6C9BC4')
    fill(181, 369, 22, 6, '#6C9BC4')
    fill(163, 349, 32, 9, OUTLINE)
    fill(164, 350, 30, 7, '#B98F5E')
    fill(167, 351, 8, 4, '#F6F7F8')
    dot(186, 353, 2.2, '#FFFFFF', '#B9C3CC')
    dot(130, 366, 6, OUTLINE)
    dot(130, 366, 4.8, '#F6E3A8')
    dot(130, 366, 1.6, '#D6A23C')
    // A ping-pong table, net across the middle
    fill(290, 350, 52, 26, OUTLINE)
    fill(291, 351, 50, 24, '#2E8B6E')
    fill(291, 362.5, 50, 1, '#FFFFFF')
    fill(315.5, 351, 1, 24, '#E9EEF2')
    fill(315, 349, 2, 28, '#2B2F36')
    dot(300, 356, 1.6, '#FFFFFF')
    dot(286, 358, 3, '#E5484D', OUTLINE)
    dot(346, 368, 3, '#3E7CC9', OUTLINE)
    // The water cooler
    fill(452, 334, 16, 24, OUTLINE)
    fill(453, 335, 14, 10, '#9CC4EC')
    fill(453, 346, 14, 11, '#E9EEF2')
  },

  project: (g, fill) => {
    fill(6, 384, 468, 118, '#D6DCE6')
    for (let r = 0; r < 5; r++) fill(6, 384 + r * 24, 468, 1, '#C7CED9')
    g.font = `700 8.5px ${FONT}`
    g.fillStyle = '#5B6672'
    g.textAlign = 'left'
    g.fillText('Dine andre sessioner', 16, 496)
  },
}

// ── The camera ───────────────────────────────────────────────────────────
// What part of the world is in view: its top-left corner in world units and
// how far in it is zoomed (1 shows everything). glide() moves it smoothly.
const view = { x: WORLD.x, y: WORLD.y, zoom: 1 }
let glideTo = null
const ZOOM_MAX = 4

const clampView = v => {
  v.zoom = Math.min(ZOOM_MAX, Math.max(1, v.zoom))
  v.x = Math.min(WORLD.x + W - W / v.zoom, Math.max(WORLD.x, v.x))
  v.y = Math.min(WORLD.y + H - H / v.zoom, Math.max(WORLD.y, v.y))
  return v
}
// The view centred on a point at a zoom
const centredOn = (x, y, zoom) => clampView({ x: x - W / zoom / 2, y: y - H / zoom / 2, zoom })
const glide = target => {
  glideTo = clampView({ ...target })
}
const stepGlide = () => {
  if (!glideTo) return
  const k = 0.18
  view.x += (glideTo.x - view.x) * k
  view.y += (glideTo.y - view.y) * k
  view.zoom += (glideTo.zoom - view.zoom) * k
  if (Math.abs(glideTo.x - view.x) < 0.2 && Math.abs(glideTo.y - view.y) < 0.2 && Math.abs(glideTo.zoom - view.zoom) < 0.002) {
    Object.assign(view, glideTo)
    glideTo = null
  }
}
const applyView = g => {
  const k = S * view.zoom
  g.setTransform(k, 0, 0, k, -view.x * k, -view.y * k)
}
const isInView = (x, y, w, h) => x < view.x + W / view.zoom && x + w > view.x && y < view.y + H / view.zoom && y + h > view.y
const visibleRooms = () => PLAN.rooms.filter(room => {
  const f = frameOf(room)
  return isInView(f.x, f.y, f.w, f.h)
})

// The walls, floors and furniture: everything that does not move, drawn
// again only when the light or the view changes. Rooms out of view are
// skipped, so a large office costs no more than what is on screen.
const drawBuilding = (project, hour) => {
  const isNight = hour < 7 || hour >= 19
  const key = `${project}|${isNight}|${hour < 9 || hour >= 17}|${canvas.width}x${canvas.height}|${view.x.toFixed(2)},${view.y.toFixed(2)},${view.zoom.toFixed(3)}`
  if (key === backgroundKey) return
  backgroundKey = key
  if (background.width !== canvas.width || background.height !== canvas.height) {
    background.width = canvas.width
    background.height = canvas.height
  }
  const g = background.getContext('2d')
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.clearRect(0, 0, background.width, background.height)
  applyView(g)
  g.imageSmoothingEnabled = false
  const fill = (x, y, w, h, c) => {
    g.fillStyle = c
    g.fillRect(x, y, w, h)
  }
  const dot = (x, y, r, c, s) => {
    g.beginPath()
    g.arc(x, y, r, 0, Math.PI * 2)
    g.fillStyle = c
    g.fill()
    if (s) {
      g.lineWidth = 1
      g.strokeStyle = s
      g.stroke()
    }
  }
  const sky = isNight ? '#16233D' : hour < 9 || hour >= 17 ? '#F4B88A' : '#A9D8F5'
  const rooms = visibleRooms()

  // The ground outside, then each room's walls
  fill(WORLD.x, WORLD.y, W, H, isNight ? '#1C2430' : '#7FB069')
  for (const room of rooms) {
    const f = frameOf(room)
    fill(f.x, f.y, f.w, f.h, WALL)
    if (typeOf(room).topWall) {
      fill(f.x, f.y, f.w, 6, WALL_TOP)
      for (const x of typeOf(room).windows ?? []) {
        const wx = x + shiftOf(room).dx
        fill(wx, f.y + 1, 56, 5, sky)
        fill(wx + 27, f.y + 1, 2, 5, WALL_TOP)
      }
    }
  }
  // Floors and furniture, each room in its own place
  for (const room of rooms) {
    const { dx, dy } = shiftOf(room)
    g.save()
    g.translate(dx, dy)
    roomDrawers[room.type]?.(g, fill, dot)
    for (const [x, y, big] of typeOf(room).plants ?? []) {
      const r = big ? 9 : 7
      fill(x - 5, y, 10, 8, '#B5683E')
      dot(x, y - 2, r, '#3E8A55', OUTLINE)
      dot(x - r / 2, y - 4, r / 2, '#56A86B')
      dot(x + r / 3, y - r, r / 3, '#6CC082')
    }
    g.restore()
  }
  // Doors, the front door's mat, and windows in the side walls
  for (const d of PLAN.doors) fill(d.x, d.y, d.w, d.h, d.colour)
  if (PLAN.doormat) fill(...PLAN.doormat, '#6E5A44')
  for (const w of sideWindows()) {
    fill(w.x, w.y, 6, w.h, sky)
    fill(w.x + 1, w.y + w.h / 2 - 1, 4, 2, WALL_TOP)
  }
  // The name plate over the middle of the building
  const mid = WORLD.x + W / 2
  g.fillStyle = '#20262E'
  g.beginPath()
  g.roundRect(mid - 60, WORLD.y + 3, 120, 11, 2)
  g.fill()
  g.font = `700 8px ${FONT}`
  g.fillStyle = '#E9EEF2'
  g.textAlign = 'center'
  g.fillText(clip(project || 'Kontoret', 26), mid, WORLD.y + 11.5)
}

// ── Clicking on someone ──────────────────────────────────────────────────
const seatedBox = (cx, dy) => ({ x0: cx - 22, y0: dy - 34, x1: cx + 22, y1: dy + 42 })
const standingBox = (x, y) => ({ x0: x - 19, y0: y - 52, x1: x + 19, y1: y + 15 })

// ── Celebrations ─────────────────────────────────────────────────────────
const party = (p, spot, t) => {
  const age = (t - p.at) / 1000
  if (age < 0 || age > 5) return
  if (p.kind === 'confetti') {
    const colours = ['#E5484D', '#3E7CC9', '#D6A23C', '#2E9E8F', '#8A6FD6', '#E07A4F']
    for (let i = 0; i < 40; i++) {
      const dur = 1.3 + (i % 5) * 0.18
      const k = ((age + (i % 7) * 0.12) % dur) / dur
      const x = spot.cx + (((i * 37 + 11) % 97) / 97) * 120 - 60 + Math.sin(age * 3 + i) * 3
      ctx.globalAlpha = 1 - k
      rect(x, spot.dy - 60 + k * 75, 3, i % 3 === 0 ? 2 : 3, colours[i % colours.length])
    }
    ctx.globalAlpha = 1
  } else if (p.kind === 'rain') {
    for (let i = 0; i < 9; i++) {
      const k = ((age + (i % 4) * 0.17) % 0.7) / 0.7
      rect(spot.cx - 18 + i * 4.5, spot.dy - 50 + k * 28, 1.5, 4, '#5DA9E9')
    }
    for (const [dx, dy, r] of [[-14, 6, 9], [0, 2, 12], [14, 6, 9], [-6, 10, 9], [8, 10, 9]]) circle(spot.cx + dx, spot.dy - 66 + dy, r, '#8B97A6', OUTLINE)
    rect(spot.cx - 18, spot.dy - 56, 36, 6, '#8B97A6')
  } else {
    ;['#E5484D', '#D6A23C', '#3E7CC9'].forEach((c, i) => {
      const rise = Math.min(1, age / (3 + i * 0.4)) * 80
      const x = spot.cx - 22 + i * 22 + Math.sin(age * 2 + i) * 2
      const y = spot.dy - 10 - rise
      ctx.strokeStyle = OUTLINE
      ctx.lineWidth = 0.8
      ctx.beginPath()
      ctx.moveTo(x, y + 8)
      ctx.quadraticCurveTo(x - 3, y + 16, x, y + 24)
      ctx.stroke()
      ctx.beginPath()
      ctx.ellipse(x, y, 7, 9, 0, 0, Math.PI * 2)
      ctx.fillStyle = c
      ctx.fill()
      ctx.lineWidth = 1
      ctx.stroke()
    })
  }
  tag(spot.cx, spot.dy - 78, p.label, p.kind === 'rain' ? '#5B6B7E' : '#2E9E8F')
}

// ── One frame ────────────────────────────────────────────────────────────
let state = { sessions: [], game: null }
let focusKey = null
try {
  focusKey = localStorage.getItem('agent-kontor:focus')
} catch {}
let isChosen = focusKey !== null

const focused = () => state.sessions.find(s => s.key === focusKey) ?? state.sessions[0] ?? null

// Where each figure stood in the last frame, for clicks: { kind, id, x0, y0, x1, y1 }
// in world units, later entries drawn on top.
let hits = []
let selected = null // { kind: 'claude' | 'sub', id }

const draw = () => {
  const now = Date.now()
  const t = performance.now()
  const s = focused()
  const frameHits = []
  const timeNow = timeOfDay()
  const hour = Math.floor(timeNow)
  stepGlide()
  drawBuilding(s?.project ?? '', hour)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(background, 0, 0)
  applyView(ctx)

  const main = s?.main ?? { state: 'idle', detail: 'Ingen session' }
  const kitchenSpot = coffeeSpot()
  // On a break Claude goes to the kitchen; with no kitchen it stays put.
  const isOut = main.state === 'idle' && !!kitchenSpot
  const subs = s?.subs ?? []
  const walks = { ...WALKS, ...(s?.walks ?? {}) }
  const list = desks()

  daylight(timeNow)
  board(s?.stats, state.game?.kroner)
  clock(new Date())
  // Screens in use, which glow in the dark
  const glowing = []

  // Claude
  chair(MAIN.cx, MAIN.dy)
  if (!isOut) sitting(MAIN.cx, MAIN.dy + 4, claudeLook, main.state === 'waiting', t, 7)
  desk(MAIN.cx, MAIN.dy, 128, isOut ? null : main.state, t, 2)
  if (!isOut) glowing.push([MAIN.cx + 46, MAIN.dy + 8], [MAIN.cx - 46, MAIN.dy + 8])
  if (!isOut) {
    hands(MAIN.cx, MAIN.dy, claudeLook, main.state !== 'waiting', t)
    tag(MAIN.cx, MAIN.dy + 30, 'Claude', '#C8643B')
    frameHits.push({ kind: 'claude', id: 'claude', ...seatedBox(MAIN.cx, MAIN.dy) })
  } else {
    frameHits.push({ kind: 'claude', id: 'claude', ...standingBox(kitchenSpot.x, kitchenSpot.y) })
    standing(kitchenSpot.x, kitchenSpot.y, claudeLook, 'front', false, t, 7)
    // The mug, and its steam
    const mx = kitchenSpot.x + 15
    const my = kitchenSpot.y - 22
    rect(mx + 8, my + 2, 3, 5, OUTLINE)
    rect(mx + 8.5, my + 3, 1.5, 3, '#FFFFFF')
    rect(mx, my, 9, 10, OUTLINE)
    rect(mx + 1, my + 1, 7, 8, '#FFFFFF')
    rect(mx + 1, my + 1, 7, 2, '#7A4B2A')
    ctx.globalAlpha = 0.7
    for (let i = 0; i < 2; i++) rect(mx + 2 + i * 3, my - 3 - ((t / 40 + i * 10) % 12), 1.5, 3, '#C9D2DA')
    ctx.globalAlpha = 1
    tag(kitchenSpot.x, kitchenSpot.y + 3, 'Claude', '#C8643B')
    // The coffee machine on the counter, just used
    const kitchen = firstRoom('kitchen')
    const machine = at(kitchen, typeOf(kitchen).machine)
    ctx.globalAlpha = 0.55
    for (let i = 0; i < 3; i++) {
      const rise = (t / 50 + i * 7) % 18
      rect(machine.x + i * 2.5 + Math.sin(t / 300 + i) * 1.2, machine.y + 14 - rise * 1.4, 1.5, 3, '#E9EEF2')
    }
    ctx.globalAlpha = 1
  }

  // The desks, and who sits at them
  const seatedAt = seat => subs.find(x => x.seat === seat && poseOf(x, now, walks)?.seated)
  list.forEach(({ cx, dy }, seat) => {
    if (!isInView(cx - 60, dy - 60, 120, 120)) return
    const sub = seatedAt(seat)
    chair(cx, dy)
    if (sub) sitting(cx, dy + 4, lookFor(sub.id), sub.activity.state === 'waiting', t, hashOf(sub.id))
    desk(cx, dy, 84, sub ? sub.activity.state : null, t)
    if (sub) {
      deskThingsFor(sub.id, cx, dy)
      glowing.push([cx + 24, dy + 8])
      hands(cx, dy, lookFor(sub.id), sub.activity.state !== 'waiting', t + seat * 37)
      tag(cx, dy + 30, sub.name, '#4A5868')
      frameHits.push({ kind: 'sub', id: sub.id, ...seatedBox(cx, dy) })
    }
  })
  // The next desk, for sale where it will stand
  const nextPrice = state.game?.next?.desk
  const slots = deskSlots()
  if (typeof nextPrice === 'number' && list.length < slots.length) {
    const { cx, dy } = slots[list.length]
    forSaleOutline(cx, dy, (state.game?.kroner ?? 0) >= nextPrice)
    frameHits.push({ kind: 'shop', id: 'desk', x0: cx - 44, y0: dy - 40, x1: cx + 44, y1: dy - 20 })
  }
  // On the floor, with a laptop: those the desks did not stretch to
  const floorSitters = []
  for (const sub of subs) {
    const pose = poseOf(sub, now, walks)
    if (!pose?.seated || sub.seat < list.length) continue
    const { spot } = placeOf(sub.seat)
    floorSitters.push({ sub, spot })
  }
  floorSitters.sort((a, b) => a.spot.y - b.spot.y)
  for (const { sub, spot } of floorSitters) {
    onTheFloor(spot.x, spot.y, lookFor(sub.id), t, hashOf(sub.id))
    glowing.push([spot.x, spot.y - 10])
    tag(spot.x, spot.y + 3, sub.name, '#4A5868')
    frameHits.push({ kind: 'sub', id: sub.id, x0: spot.x - 20, y0: spot.y - 44, x1: spot.x + 20, y1: spot.y + 14 })
  }
  // Everyone on their feet: walking or handing over.
  const walkers = []
  for (const sub of subs) {
    const pose = poseOf(sub, now, walks)
    if (pose && !pose.seated) walkers.push({ sub, pose })
  }
  walkers.sort((a, b) => a.pose.y - b.pose.y)
  for (const { sub, pose } of walkers) {
    standing(pose.x, pose.y, lookFor(sub.id), pose.facing, pose.isWalking, t, hashOf(sub.id))
    tag(pose.x, pose.y + 3, sub.name, '#4A5868')
    frameHits.push({ kind: 'sub', id: sub.id, ...standingBox(pose.x, pose.y) })
  }

  // The project room: the other sessions
  const projectRoom = firstRoom('project')
  const seats = projectRoom ? typeOf(projectRoom).seats.map(p => at(projectRoom, p)) : []
  const others = state.sessions.filter(x => x !== s).slice(0, seats.length)
  seats.forEach(({ cx, dy }, i) => {
    const o = others[i]
    chair(cx, dy)
    if (!o) {
      desk(cx, dy, 80, null, t)
      return
    }
    const look = { ...claudeLook, shirt: shirts[hashOf(o.key) % shirts.length][0], shirtShade: shirts[hashOf(o.key) % shirts.length][1] }
    const away = o.main.state === 'idle'
    if (!away) sitting(cx, dy + 4, look, o.main.state === 'waiting', t, hashOf(o.key))
    desk(cx, dy, 80, away ? null : o.main.state, t)
    if (!away) hands(cx, dy, look, o.main.state !== 'waiting', t + i * 51)
    tag(cx, dy + 30, clip(o.project, 16), '#C8643B')
    if (o.subs?.length) tag(cx + 30, dy + 44, `+${o.subs.length}`, '#4A5868')
    frameHits.push({ kind: 'session', id: o.key, x0: cx - 42, y0: dy - 40, x1: cx + 42, y1: dy + 44 })
  })

  evening(timeNow, glowing)

  // Speech, on top of everyone
  const thanking = walkers.find(w => w.pose.handover)
  if (isOut) {
    const lines = ['Kaffepause', s?.stats?.linesAdded ? `${s.stats.linesAdded} linjer i dag` : 'Klar når du er', 'Godt arbejde, team', 'Hvad nu?']
    bubble(kitchenSpot.x, kitchenSpot.y - 52, lines[Math.floor(t / 3000) % lines.length], false, t)
  } else if (thanking) {
    bubble(MAIN.cx, MAIN.dy - 34, thanking.sub.outcome === 'failed' ? `Øv, ${thanking.sub.name}` : `Tak, ${thanking.sub.name}!`, false, t)
  } else {
    say(MAIN.cx, MAIN.dy - 34, main, t)
  }
  list.forEach(({ cx, dy }, seat) => {
    const sub = seatedAt(seat)
    if (sub) say(cx, dy - 34, sub.activity, t + seat * 230)
  })
  for (const { sub, pose } of walkers) {
    if (pose.handover) bubble(pose.x, pose.y - 52, sub.outcome === 'failed' ? `Gik i stå: ${sub.task}` : `Afleverer: ${sub.task}`, sub.outcome === 'failed', t)
  }
  // On the floor they sit close, so each speaks only now and then: to
  // grumble, or when it waits for you. What they do is in the list.
  for (const { sub, spot } of floorSitters) {
    if (sub.activity.state === 'waiting') say(spot.x, spot.y - 44, sub.activity, t)
    else {
      const grumble = grumbleAt(t, hashOf(sub.id))
      if (grumble) bubble(spot.x, spot.y - 44, grumble, false, t)
    }
  }
  seats.forEach(({ cx, dy }, i) => {
    const o = others[i]
    if (!o) return
    if (o.main.state === 'idle') tag(cx, dy - 26, 'Holder pause', '#8A94A0')
    else say(cx, dy - 34, o.main, t + i * 170)
  })
  if (typeof nextPrice === 'number' && list.length < slots.length) {
    const { cx, dy } = slots[list.length]
    forSaleSign(cx, dy, nextPrice, (state.game?.kroner ?? 0) >= nextPrice, t)
  }
  // The one whose card is open, ringed.
  const ring = selected && frameHits.find(h => h.kind === selected.kind && h.id === selected.id)
  if (ring) {
    ctx.setLineDash([3, 2])
    rounded(ring.x0, ring.y0, ring.x1 - ring.x0, ring.y1 - ring.y0, 6, 'rgba(47,134,214,0.08)', '#2F86D6', 1.2)
    ctx.setLineDash([])
  }
  hits = frameHits

  if (s?.party) {
    const who = subs.find(x => x.id === s.party.who)
    const spot = who && placeOf(who.seat).isDesk ? placeOf(who.seat) : MAIN
    party({ ...s.party, at: performance.now() - (now - s.party.at) }, spot, t)
  }
  // A desk just bought: confetti where it now stands
  const bought = state.game?.bought?.at(-1)
  if (bought?.item === 'desk' && now - bought.at < 5000) {
    const d = list[list.length - 1]
    if (d) party({ kind: 'confetti', label: 'Nyt skrivebord!', at: performance.now() - (now - bought.at) }, d, t)
  }

  drawMinimap()
  requestAnimationFrame(draw)
}

// ── Moving the camera ────────────────────────────────────────────────────
// Drag to move, scroll or pinch to zoom, double-click for everything. The
// minimap shows where the view is once it is zoomed in, and takes you
// anywhere with a click.
const minimap = document.getElementById('minimap')
const fitAllButton = document.getElementById('fit-all')
const mini = minimap.getContext('2d')

const drawMinimap = () => {
  const isZoomed = view.zoom > 1.01 || glideTo?.zoom > 1.01
  minimap.hidden = !isZoomed
  fitAllButton.hidden = !isZoomed
  if (!isZoomed) return
  const dpr = window.devicePixelRatio || 1
  // A quarter of the picture's width, at most 132 pixels
  const width = Math.round(Math.min(132, canvas.offsetWidth * 0.26))
  const height = Math.round((width * H) / W)
  if (minimap.width !== width * dpr) {
    minimap.width = width * dpr
    minimap.height = height * dpr
    minimap.style.width = `${width}px`
    minimap.style.height = `${height}px`
  }
  // In the picture's own corners, wherever it sits in its space
  minimap.style.left = `${canvas.offsetLeft + canvas.offsetWidth - width - 10}px`
  minimap.style.top = `${canvas.offsetTop + canvas.offsetHeight - height - 10}px`
  fitAllButton.style.left = `${canvas.offsetLeft + canvas.offsetWidth - fitAllButton.offsetWidth - 10}px`
  fitAllButton.style.top = `${canvas.offsetTop + 10}px`
  const k = (width * dpr) / W
  mini.setTransform(k, 0, 0, k, -WORLD.x * k, -WORLD.y * k)
  mini.fillStyle = '#2A323B'
  mini.fillRect(WORLD.x, WORLD.y, W, H)
  const colours = { corner: '#DCC194', kitchen: '#F3F5F6', team: '#CBD9C7', project: '#D6DCE6' }
  for (const room of PLAN.rooms) {
    mini.fillStyle = colours[room.type] ?? '#C9CED3'
    mini.fillRect(room.x, room.y, typeOf(room).w, typeOf(room).h)
  }
  mini.lineWidth = 3 / k
  mini.strokeStyle = '#2F86D6'
  mini.strokeRect(view.x, view.y, W / view.zoom, H / view.zoom)
}

const worldAt = e => {
  const box = canvas.getBoundingClientRect()
  return { x: view.x + ((e.clientX - box.left) / box.width) * (W / view.zoom), y: view.y + ((e.clientY - box.top) / box.height) * (H / view.zoom) }
}

const zoomAt = (e, zoom) => {
  const box = canvas.getBoundingClientRect()
  const p = worldAt(e)
  const fx = (e.clientX - box.left) / box.width
  const fy = (e.clientY - box.top) / box.height
  glideTo = null
  Object.assign(view, clampView({ x: p.x - (fx * W) / zoom, y: p.y - (fy * H) / zoom, zoom }))
}

canvas.addEventListener(
  'wheel',
  e => {
    e.preventDefault()
    zoomAt(e, view.zoom * Math.exp(-e.deltaY * 0.0015))
  },
  { passive: false },
)

// Pointers down on the picture: one drags, two pinch.
const pointers = new Map()
let drag = null
let pinch = null
let hasDragged = false
canvas.addEventListener('pointerdown', e => {
  pointers.set(e.pointerId, e)
  canvas.setPointerCapture(e.pointerId)
  hasDragged = false
  if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY, view: { ...view } }
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()]
    pinch = { distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), zoom: view.zoom }
    drag = null
  }
})
canvas.addEventListener('pointermove', e => {
  if (!pointers.has(e.pointerId)) {
    canvas.style.cursor = hitAt(e) ? 'pointer' : view.zoom > 1.01 ? 'grab' : 'default'
    return
  }
  pointers.set(e.pointerId, e)
  if (pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()]
    const middle = { clientX: (a.clientX + b.clientX) / 2, clientY: (a.clientY + b.clientY) / 2 }
    zoomAt(middle, (pinch.zoom * Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)) / pinch.distance)
    hasDragged = true
    return
  }
  if (!drag) return
  const dx = e.clientX - drag.x
  const dy = e.clientY - drag.y
  if (!hasDragged && Math.hypot(dx, dy) < 4) return
  hasDragged = true
  canvas.style.cursor = 'grabbing'
  const box = canvas.getBoundingClientRect()
  glideTo = null
  Object.assign(
    view,
    clampView({ x: drag.view.x - (dx / box.width) * (W / view.zoom), y: drag.view.y - (dy / box.height) * (H / view.zoom), zoom: view.zoom }),
  )
})
const release = e => {
  pointers.delete(e.pointerId)
  if (pointers.size < 2) pinch = null
  if (pointers.size === 0) drag = null
}
canvas.addEventListener('pointerup', release)
canvas.addEventListener('pointercancel', release)
canvas.addEventListener('dblclick', () => glide({ x: WORLD.x, y: WORLD.y, zoom: 1 }))
fitAllButton.addEventListener('click', () => glide({ x: WORLD.x, y: WORLD.y, zoom: 1 }))
minimap.addEventListener('click', e => {
  const box = minimap.getBoundingClientRect()
  const x = WORLD.x + ((e.clientX - box.left) / box.width) * W
  const y = WORLD.y + ((e.clientY - box.top) / box.height) * H
  glide(centredOn(x, y, view.zoom))
})

// Up close to whoever waits for you: the alert under the picture takes you there.
const lookAtWaiting = () => {
  const s = focused()
  if (!s) return
  if (s.main.state === 'waiting') return glide(centredOn(MAIN.cx, MAIN.dy - 10, 2.5))
  const sub = (s.subs ?? []).find(x => x.activity.state === 'waiting')
  const h = sub && hits.find(x => x.kind === 'sub' && x.id === sub.id)
  if (h) glide(centredOn((h.x0 + h.x1) / 2, (h.y0 + h.y1) / 2, 2.5))
}

document.documentElement.style.setProperty('--office', String(W / H))
fit()
new ResizeObserver(fit).observe(stage)
// Dragged to a screen with another pixel density: draw sharp for that one.
window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener('change', fit)
requestAnimationFrame(draw)

// ── The page around the picture ──────────────────────────────────────────
const tabs = document.getElementById('tabs')
const people = document.getElementById('people')
const alertBox = document.getElementById('alert')
const statusLine = document.getElementById('status')
const saldo = document.getElementById('saldo')
alertBox.addEventListener('click', lookAtWaiting)

const el = (tagName, props = {}, children = []) => {
  const node = Object.assign(document.createElement(tagName), props)
  for (const child of children) node.append(child)
  return node
}
const dot = state => el('span', { className: 'dot', style: `background:${stateColor[state] ?? '#8A94A0'}` })

const renderPage = () => {
  renderShop()
  const s = focused()
  saldo.hidden = typeof state.game?.kroner !== 'number'
  if (!saldo.hidden) saldo.textContent = kr(state.game.kroner)
  tabs.replaceChildren(
    ...state.sessions.map(x =>
      el('button', { className: 'tab', type: 'button', onclick: () => choose(x.key), ariaPressed: String(x === s) }, [dot(x.main.state), x.project || 'Session']),
    ),
  )
  if (!s) {
    people.replaceChildren(el('li', { className: 'empty' }, ['Ingen Claude-sessioner kører lige nu. Start en session med Agent-kontor installeret, så sætter Claude sig her.']))
    alertBox.textContent = ''
    return
  }
  const waiting = [s, ...state.sessions.filter(x => x !== s)].filter(x => x.main.state === 'waiting')
  alertBox.textContent = waiting.map(x => `Claude i ${x.project} venter på dig: ${x.main.detail}`).join(' · ')

  const stats = s.stats ?? {}
  const facts = [
    stats.linesAdded || stats.linesRemoved ? `+${stats.linesAdded} −${stats.linesRemoved} linjer` : null,
    typeof stats.costUsd === 'number' ? `$${stats.costUsd.toFixed(2)}` : null,
    typeof stats.fiveHour === 'number' ? `${Math.round(stats.fiveHour)} % af 5-timers-grænsen` : null,
  ].filter(Boolean)
  const row = (name, what, stateName, note) =>
    el('li', {}, [dot(stateName), el('span', { className: 'name' }, [name]), el('span', { className: 'what', style: `color:${stateColor[stateName]}` }, [what]), ...(note ? [el('span', { className: 'note' }, [note])] : [])])
  people.replaceChildren(
    row('Claude', s.main.detail, s.main.state, facts.join(', ') || null),
    ...(s.subs ?? []).map(sub => row(sub.name, sub.activity.detail, sub.activity.state, sub.task)),
  )
}

// ── The details card ─────────────────────────────────────────────────────
const card = document.getElementById('card')

const hitAt = e => {
  const { x, y } = worldAt(e)
  for (let i = hits.length - 1; i >= 0; i--) {
    const h = hits[i]
    if (x >= h.x0 && x <= h.x1 && y >= h.y0 && y <= h.y1) return h
  }
  return null
}

const ago = (now, at) => {
  const minutes = Math.floor((now - at) / 60_000)
  if (minutes < 1) return 'under et minut'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  return `${hours} t ${minutes % 60} min`
}
const clockTime = at => new Date(at).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' })
const phaseNote = sub =>
  sub.outcome === 'failed' && (sub.phase === 'delivering' || sub.phase === 'leaving')
    ? 'Gik i stå'
    : { arriving: 'På vej ind', working: sub.seat < 0 ? 'Venter ved døren' : null, delivering: 'Afleverer', leaving: 'Går igen' }[sub.phase] ?? null

// Who the card is about, as the newest state says; null once they are gone.
const subject = () => {
  const s = focused()
  if (!selected || !s) return null
  if (selected.kind === 'claude') {
    const stats = s.stats ?? {}
    return {
      name: 'Claude',
      task: s.project,
      activity: s.main,
      startedAt: s.startedAt,
      tools: stats.tools,
      linesAdded: stats.linesAdded,
      linesRemoved: stats.linesRemoved,
      note: typeof stats.costUsd === 'number' ? `$${stats.costUsd.toFixed(2)} i denne session` : null,
      recent: stats.recent,
    }
  }
  const sub = (s.subs ?? []).find(x => x.id === selected.id)
  if (!sub) return null
  return { ...sub, note: phaseNote(sub) }
}

const renderCard = () => {
  const who = subject()
  if (!who) {
    selected = null
    card.hidden = true
    return
  }
  const now = Date.now()
  const facts = [
    who.startedAt ? `I gang i ${ago(now, who.startedAt)}` : null,
    typeof who.tools === 'number' ? `${who.tools} ${who.tools === 1 ? 'værktøj' : 'værktøjer'}` : null,
    who.linesAdded || who.linesRemoved ? `+${who.linesAdded ?? 0} −${who.linesRemoved ?? 0} linjer` : null,
  ].filter(Boolean)
  const steps = [...(who.recent ?? [])].reverse()
  card.replaceChildren(
    el('div', { className: 'card-head' }, [
      dot(who.activity.state),
      el('strong', {}, [who.name]),
      el('button', { className: 'card-close', type: 'button', ariaLabel: 'Luk', onclick: () => select(null) }, ['×']),
    ]),
    ...(who.task ? [el('div', { className: 'card-task' }, [who.task])] : []),
    el('div', { className: 'card-now', style: `color:${stateColor[who.activity.state] ?? 'inherit'}` }, [who.activity.detail]),
    ...(who.note ? [el('div', { className: 'card-note' }, [who.note])] : []),
    ...(facts.length ? [el('div', { className: 'card-facts' }, [facts.join(' · ')])] : []),
    ...(steps.length
      ? [
          el('div', { className: 'card-label' }, ['Seneste']),
          el('ol', { className: 'card-steps' }, steps.map(step => el('li', {}, [el('time', {}, [clockTime(step.at)]), step.detail]))),
        ]
      : []),
  )
  card.hidden = false
  placeCard()
}

// Beside the figure, inside the picture; above it when there is no room below.
const placeCard = () => {
  const h = selected && hits.find(x => x.kind === selected.kind && x.id === selected.id)
  if (!h || card.hidden) return
  const box = canvas.getBoundingClientRect()
  const stageBox = stage.getBoundingClientRect()
  // World units to canvas pixels, through the camera
  const scale = box.width / (W / view.zoom)
  const left = box.left - stageBox.left
  const top = box.top - stageBox.top
  const sx = v => (v - view.x) * scale
  const sy = v => (v - view.y) * scale
  const cardWidth = card.offsetWidth
  const cardHeight = card.offsetHeight
  const right = left + sx(h.x1) + 8
  const leftSide = left + sx(h.x0) - cardWidth - 8
  let x
  let y
  if (right + cardWidth <= left + box.width || leftSide >= left) {
    x = right + cardWidth <= left + box.width ? right : leftSide
    y = top + sy(h.y0)
  } else {
    // No room beside it (a narrow window): under the figure, over it if
    // there is room there, or else on under the picture, but never over it.
    x = left + sx((h.x0 + h.x1) / 2) - cardWidth / 2
    const below = top + sy(h.y1) + 6
    const above = top + sy(h.y0) - cardHeight - 6
    y = below + cardHeight <= top + box.height || above < top ? below : above
    card.style.transform = `translate(${Math.round(Math.max(left + 4, Math.min(x, left + box.width - cardWidth - 4)))}px, ${Math.round(y)}px)`
    return
  }
  x = Math.max(left + 4, Math.min(x, left + box.width - cardWidth - 4))
  y = Math.max(top + 4, Math.min(y, top + box.height - cardHeight - 4))
  card.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`
}

const select = next => {
  selected = next
  renderCard()
}

canvas.addEventListener('click', e => {
  // The end of a drag is no click.
  if (hasDragged) {
    hasDragged = false
    return
  }
  const h = hitAt(e)
  if (h?.kind === 'session') {
    select(null)
    choose(h.id)
  } else if (h?.kind === 'shop') {
    select(null)
    showPanel('shop')
    if ((state.game?.kroner ?? 0) >= (state.game?.next?.[h.id] ?? Infinity)) void buyItem(h.id)
  } else {
    select(h && !(selected && selected.kind === h.kind && selected.id === h.id) ? { kind: h.kind, id: h.id } : null)
  }
})
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') select(null)
})
// Times move on, and walkers move the card with them.
setInterval(() => selected && renderCard(), 1000)
const follow = () => {
  placeCard()
  requestAnimationFrame(follow)
}
requestAnimationFrame(follow)

// ── The shop ─────────────────────────────────────────────────────────────
// Beside the list: what you have, what the next thing costs, how kroner are
// earned. The server holds the prices and the money; a buy is asked of it.
const shop = document.getElementById('shop')
const panelButtons = document.querySelectorAll('[data-panel]')
let shopMessage = ''
let isBuying = false

const showPanel = name => {
  for (const button of panelButtons) button.ariaPressed = String(button.dataset.panel === name)
  people.hidden = name !== 'people'
  shop.hidden = name !== 'shop'
  try {
    localStorage.setItem('agent-kontor:panel', name)
  } catch {}
}
for (const button of panelButtons) button.addEventListener('click', () => showPanel(button.dataset.panel))

const buyItem = async item => {
  if (isBuying || !state.token) return
  isBuying = true
  shopMessage = ''
  renderShop()
  try {
    const res = await fetch('/api/buy', { method: 'POST', headers: { 'content-type': 'application/json', 'x-kontor-token': state.token }, body: JSON.stringify({ item }) })
    const answer = await res.json()
    if (answer.game) state.game = answer.game
    shopMessage = res.ok ? 'Købt! Den næste hjælper uden plads sætter sig ved det.' : answer.error ?? 'Det gik ikke'
  } catch {
    shopMessage = 'Kontoret svarer ikke lige nu'
  }
  isBuying = false
  renderPage()
}

const RATE_TEXT = { added: 'linje tilføjet', removed: 'linje fjernet', delivered: 'opgave afleveret af en hjælper', tests: 'grønne tests (højst hvert 10. minut)', commits: 'commit', prs: 'pull request' }

const renderShop = () => {
  const g = state.game
  if (!g) {
    shop.replaceChildren(el('p', { className: 'empty' }, ['Butikken åbner, når kontoret er forbundet.']))
    return
  }
  const price = g.next?.desk
  const canAfford = typeof price === 'number' && g.kroner >= price
  const deskItem = el('li', { className: 'item' }, [
    el('div', { className: 'item-head' }, [el('strong', {}, ['Skrivebord']), el('span', { className: 'item-count' }, [`${g.owned.desks} af ${g.maxDesks}`])]),
    el('p', { className: 'hint' }, ['Hjælpere uden skrivebord sidder på gulvet med en laptop og brokker sig.']),
    typeof price === 'number'
      ? el('button', { className: 'buy', type: 'button', disabled: !canAfford || isBuying, onclick: () => buyItem('desk') }, [isBuying ? 'Køber…' : `Køb nr. ${g.owned.desks + 1} for ${kr(price)}`])
      : el('p', { className: 'hint' }, ['Teamrummet er fuldt. Flere pladser kommer med teamrum 2.']),
    ...(typeof price === 'number' && !canAfford ? [el('p', { className: 'hint' }, [`Mangler ${kr(price - g.kroner)}`])] : []),
  ])
  const rates = Object.entries(g.rates ?? {}).map(([k, v]) => el('li', {}, [el('span', { className: 'rate' }, [`${String(v).replace('.', ',')} kr`]), RATE_TEXT[k] ?? k]))
  shop.replaceChildren(
    el('div', { className: 'shop-saldo' }, [el('span', { className: 'hint' }, ['Saldo']), el('strong', {}, [kr(g.kroner)])]),
    ...(shopMessage ? [el('p', { className: 'shop-message' }, [shopMessage])] : []),
    el('ul', { className: 'items' }, [deskItem]),
    el('p', { className: 'hint' }, ['Kommer snart: køkken, toilet, sofahjørne, bordtennis og mødelokale.']),
    el('h3', {}, ['Sådan tjener du kroner']),
    el('ul', { className: 'rates' }, rates),
  )
}

try {
  showPanel(localStorage.getItem('agent-kontor:panel') === 'shop' ? 'shop' : 'people')
} catch {
  showPanel('people')
}

const choose = key => {
  focusKey = key
  isChosen = true
  try {
    localStorage.setItem('agent-kontor:focus', key)
  } catch {}
  renderPage()
}

const receive = next => {
  state = next
  if (selected) renderCard()
  // A session picked by hand stays in view while it lives. Until then the
  // view follows the work: away from a session on a break to one that isn't.
  const current = state.sessions.find(x => x.key === focusKey)
  const busy = state.sessions.find(x => x.main.state !== 'idle')
  if (!current) focusKey = (busy ?? state.sessions[0])?.key ?? null
  else if (!isChosen && current.main.state === 'idle' && busy) focusKey = busy.key
  renderPage()
}

const connect = () => {
  const events = new EventSource('/api/events')
  events.onopen = () => {
    statusLine.textContent = 'Live'
    statusLine.classList.remove('lost')
  }
  events.onmessage = e => receive(JSON.parse(e.data))
  // The browser tries again by itself every two seconds; a session that has
  // the office open starts the server again within a minute.
  events.onerror = () => {
    statusLine.textContent = 'Forbindelsen er tabt. Prøver igen… Er Claude lukket, så tryk på 🏢 Åbn kontor i Claude.'
    statusLine.classList.add('lost')
  }
}
connect()
