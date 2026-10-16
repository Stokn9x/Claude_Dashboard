// ── One frame ────────────────────────────────────────────────────────────
// Everything that moves, drawn over the building 60 times a second: Claude,
// the helpers at their desks, on the floor and on their feet, breaks and
// meetings, signs for what is for sale, building work and celebrations, and
// what everyone says, on top.
import { store, focused, owns } from './store.js'
import { OUTLINE, bubble, canvas, circle, ctx, dashed, label, rect, rounded, say, shadow, tag } from './gfx.js'
import { hashOf, kr } from './util.js'
import { ITEMS, MAIN, MAIN_SPOT, PLAN, ROOM_TYPES, at, coffeeSpot, deskSlots, desks, firstRoom, isBuilt, placeOf, shiftOf, typeOf } from './plan.js'
import { WALKS, poseOf, route, walkAt } from './routes.js'
import { STAY, banterFor, breakNow, errandPose, meetingNow } from './breaks.js'
import { claudeLook, grumbleAt, hands, lookFor, onTheFloor, sitting, sittingBack, standing } from './figures.js'
import { board, chair, clock, desk, deskThingsFor, mug, steam } from './furniture.js'
import { daylight, evening, timeOfDay } from './light.js'
import { applyView, drawMinimap, isInView, stepGlide, visibleRect } from './camera.js'
import { background, drawBuilding } from './building.js'
import { drawLife } from './outdoors.js'

const BUILD_MS = 10_000
const PARTY_AFTER_MS = 5000
const MOVE_MS = 2500
const NAME = '#4A5868'
const CLAUDE = '#C8643B'

const seatedBox = (cx, dy) => ({ x0: cx - 22, y0: dy - 34, x1: cx + 22, y1: dy + 42 })
const standingBox = (x, y) => ({ x0: x - 19, y0: y - 52, x1: x + 19, y1: y + 15 })

// Where each helper last had its place, and the walks to a new one: a helper
// whose place changed while at work (a new desk was bought for it) gets up
// and walks there, rather than appearing at the desk.
const lastPlaces = new Map()
const moves = new Map()

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

// ── For sale and building work ───────────────────────────────────────────
// What is for sale right now, and where its sign stands: a lot's centre,
// the spot a piece of furniture will take, or the next desk.
const forSaleNow = list => {
  const game = store.state.game
  if (!game) return []
  const sales = []
  const slots = deskSlots()
  if (typeof game.next?.desk === 'number' && list.length < slots.length) {
    const { cx, dy } = slots[list.length]
    sales.push({ item: 'desk', price: game.next.desk, isDesk: true, x: cx, y: dy })
  }
  for (const room of PLAN.rooms) {
    if (room.buy && !isBuilt(room)) {
      const price = game.next?.[room.buy]
      if (typeof price === 'number') sales.push({ item: room.buy, price, x: room.x + typeOf(room).w / 2, y: room.y + typeOf(room).h / 2 })
    }
    for (const [item, spot] of Object.entries(typeOf(room).items ?? {})) {
      const price = game.next?.[item]
      if (!owns(item) && typeof price === 'number') sales.push({ item, price, isFurniture: true, ...at(room, spot) })
    }
  }
  return sales.map(sale => ({ ...sale, canAfford: game.kroner >= sale.price }))
}

// The outline on the floor where a desk or a piece of furniture will stand.
const drawSaleOutlines = (sales, hits) => {
  for (const sale of sales) {
    if (sale.isDesk) {
      dashed(sale.x - 42, sale.y - 18, 84, 48, 4, 'rgba(255,255,255,0.18)', sale.canAfford ? '#2E9E8F' : '#8A94A0')
      hits.push({ kind: 'shop', id: 'desk', x0: sale.x - 44, y0: sale.y - 40, x1: sale.x + 44, y1: sale.y - 20 })
    } else if (sale.isFurniture) {
      dashed(sale.x - 34, sale.y - 14, 68, 28, 4, 'rgba(255,255,255,0.18)', sale.canAfford ? '#2E9E8F' : '#8A94A0')
    }
  }
}

// The signs with the prices, drawn above everyone so they are never hidden.
const drawSaleSigns = (sales, hits, t) => {
  for (const sale of sales) {
    const bob = sale.canAfford ? Math.sin(t / 300 + sale.x) : 0
    if (sale.isDesk) {
      tag(sale.x, sale.y - 32 + bob, sale.canAfford ? `Køb skrivebord: ${kr(sale.price)}` : `Skrivebord: ${kr(sale.price)}`, sale.canAfford ? '#2E9E8F' : '#5B6672')
      continue
    }
    tag(sale.x, sale.y - 6 + bob, `${ITEMS[sale.item].name}: ${kr(sale.price)}`, sale.canAfford ? '#2E9E8F' : '#5B6672')
    if (!sale.isFurniture) label(sale.canAfford ? 'Klik for at bygge' : 'Ledig grund', sale.x, sale.y + 14, 6.5, sale.canAfford ? '#21776B' : '#4E6A3A', 600)
    hits.push({ kind: 'shop', id: sale.item, x0: sale.x - 46, y0: sale.y - 12, x1: sale.x + 46, y1: sale.y + 18 })
  }
}

// Where a bought thing stands, to put up the scaffolding.
const areaOf = item => {
  for (const room of PLAN.rooms) {
    if (room.buy === item) return { x: room.x, y: room.y, w: typeOf(room).w, h: typeOf(room).h }
    const spot = typeOf(room).items?.[item]
    if (spot) {
      const p = at(room, spot)
      return { x: p.x - 44, y: p.y - 18, w: 88, h: 36 }
    }
  }
  return null
}

// For ten seconds after a purchase: scaffolding over the spot, a progress
// bar and the word; then confetti over the new thing.
const construction = (now, t) => {
  for (const bought of store.state.game?.bought ?? []) {
    if (bought.item === 'desk') continue
    const age = now - bought.at
    const area = areaOf(bought.item)
    if (!area || age < 0 || age > BUILD_MS + PARTY_AFTER_MS) continue
    const name = ITEMS[bought.item]?.name ?? 'Nyt'
    const cx = area.x + area.w / 2
    const cy = area.y + area.h / 2
    if (age >= BUILD_MS) {
      party({ kind: 'confetti', label: `${name} er klar!`, at: t - (age - BUILD_MS) }, { cx, dy: cy + 30 }, t)
      continue
    }
    ctx.save()
    ctx.beginPath()
    ctx.rect(area.x, area.y, area.w, area.h)
    ctx.clip()
    ctx.fillStyle = 'rgba(214, 162, 60, 0.18)'
    ctx.fillRect(area.x, area.y, area.w, area.h)
    ctx.strokeStyle = 'rgba(139, 94, 60, 0.85)'
    ctx.lineWidth = 1.4
    for (let x = area.x - area.h; x < area.x + area.w; x += 12) {
      ctx.beginPath()
      ctx.moveTo(x, area.y + area.h)
      ctx.lineTo(x + area.h, area.y)
      ctx.stroke()
    }
    for (let y = area.y + 8; y < area.y + area.h; y += 18) rect(area.x, y, area.w, 2.5, '#8B5E3C')
    ctx.restore()
    tag(cx, cy - 12, `Bygger ${name.toLowerCase()} …`, '#AD7F26')
    rounded(cx - 30, cy + 2, 60, 6, 3, '#F6F1E4', OUTLINE, 1)
    rounded(cx - 29, cy + 3, 58 * Math.min(1, age / BUILD_MS), 4, 2, '#D6A23C')
    // A builder's hammer, going
    ctx.save()
    ctx.translate(cx + 38, cy + 4)
    ctx.rotate(Math.sin(t / 90) * 0.6)
    rect(-1, -9, 2, 10, '#8B5E3C')
    rect(-4, -12, 8, 4, '#5B6672')
    ctx.restore()
  }
}

// ── Things that are always going ─────────────────────────────────────────
const fish = t => {
  const room = firstRoom('quiet')
  if (!owns('aquarium') || !room) return
  const { dx, dy } = shiftOf(room)
  const [x, y, w, h] = ROOM_TYPES.quiet.aquarium
  const colours = ['#F2994A', '#F2C94C', '#EB5757', '#F6F7F8']
  for (let i = 0; i < 4; i++) {
    const k = (((t / (2600 + i * 700) + i * 0.27) % 2) + 2) % 2
    const goingRight = k < 1
    const fx = x + dx + 4 + (w - 12) * (goingRight ? k : 2 - k)
    const fy = y + dy + 4 + ((i * 3) % (h - 7)) + Math.sin(t / 400 + i)
    rect(fx, fy, 5, 3, colours[i])
    rect(goingRight ? fx - 2 : fx + 5, fy + 0.5, 2, 2, colours[i])
  }
}

const espresso = t => {
  const room = firstRoom('kitchen')
  if (!owns('espresso') || !room || !isBuilt(room)) return
  const m = at(room, typeOf(room).machine)
  steam(m.x + 2, m.y, t)
}

// ── Who is where ─────────────────────────────────────────────────────────
// Everyone's errand right now: a break, the meeting, or a walk to a new
// place. Keyed by helper id; those not in it are at their place.
const errandsNow = (subs, now, meeting, pause) => {
  const onErrand = new Map()
  for (const sub of subs) {
    const seat = meeting?.seats.get(sub.id)
    const e = seat ? { kind: 'meeting', start: meeting.start, stay: STAY.meeting, dest: seat } : pause?.errands.get(sub.id)
    const pose = e && sub.phase === 'working' && sub.activity.state !== 'waiting' ? errandPose(placeOf(sub.seat).spot, e, now) : null
    if (pose) onErrand.set(sub.id, pose)
  }
  for (const sub of subs) {
    if (sub.phase !== 'working') {
      lastPlaces.delete(sub.id)
      continue
    }
    const spot = placeOf(sub.seat).spot
    const before = lastPlaces.get(sub.id)
    if (before && (before.x !== spot.x || before.y !== spot.y)) moves.set(sub.id, { from: before, to: spot, start: now })
    lastPlaces.set(sub.id, spot)
    const move = moves.get(sub.id)
    if (!move) continue
    const k = (now - move.start) / MOVE_MS
    if (k >= 1) moves.delete(sub.id)
    else if (!onErrand.has(sub.id)) onErrand.set(sub.id, walkAt(route(move.from, move.to), k))
  }
  return onErrand
}

// Claude: at the desk, on the way to or at the meeting, or in the kitchen
// with a mug on a break.
const drawClaude = ({ main, where, meetingPose, kitchenSpot, glowing, hits, t }) => {
  const isAtDesk = where === 'desk'
  chair(MAIN.cx, MAIN.dy)
  if (isAtDesk) sitting(MAIN.cx, MAIN.dy + 4, claudeLook, main.state === 'waiting', t, 7)
  desk(MAIN.cx, MAIN.dy, 128, isAtDesk ? main.state : null, t, 2)
  if (isAtDesk) {
    glowing.push([MAIN.cx + 46, MAIN.dy + 8], [MAIN.cx - 46, MAIN.dy + 8])
    hands(MAIN.cx, MAIN.dy, claudeLook, main.state !== 'waiting', t)
    tag(MAIN.cx, MAIN.dy + 30, 'Claude', CLAUDE)
    hits.push({ kind: 'claude', id: 'claude', ...seatedBox(MAIN.cx, MAIN.dy) })
  } else if (where === 'meeting') {
    const p = meetingPose
    if (p.isThere) sitting(p.x, p.y, claudeLook, false, t, 7)
    else standing(p.x, p.y, claudeLook, p.facing, p.isWalking, t, 7)
    tag(p.x, p.y + 3, 'Claude', CLAUDE)
    hits.push({ kind: 'claude', id: 'claude', ...standingBox(p.x, p.y) })
  } else {
    const { x, y } = kitchenSpot
    standing(x, y, claudeLook, 'front', false, t, 7)
    mug(x + 15, y - 22, true)
    steam(x + 17, y - 25, t, { puffs: 2, speed: 40, height: 12, alpha: 0.7, colour: '#C9D2DA' })
    tag(x, y + 3, 'Claude', CLAUDE)
    hits.push({ kind: 'claude', id: 'claude', ...standingBox(x, y) })
    // The coffee machine on the counter, just used
    const kitchen = firstRoom('kitchen')
    const machine = at(kitchen, typeOf(kitchen).machine)
    steam(machine.x, machine.y + 14, t, { gap: 2.5, speed: 50, height: 25, alpha: 0.55 })
  }
}

// The desks, and whoever sits at them.
const drawDesks = ({ list, seatedAt, glowing, hits, t }) => {
  list.forEach(({ cx, dy }, seat) => {
    if (!isInView(cx - 60, dy - 60, 120, 120)) return
    const sub = seatedAt(seat)
    chair(cx, dy)
    if (sub) sitting(cx, dy + 4, lookFor(sub.id), sub.activity.state === 'waiting', t, hashOf(sub.id))
    desk(cx, dy, 84, sub ? sub.activity.state : null, t)
    if (!sub) return
    deskThingsFor(sub.id, cx, dy)
    glowing.push([cx + 24, dy + 8])
    hands(cx, dy, lookFor(sub.id), sub.activity.state !== 'waiting', t + seat * 37)
    tag(cx, dy + 30, sub.name, NAME)
    hits.push({ kind: 'sub', id: sub.id, ...seatedBox(cx, dy) })
  })
}

// On the floor, with a laptop: those the desks did not stretch to.
const drawFloorSitters = ({ floorSitters, glowing, hits, t }) => {
  for (const { sub, spot } of floorSitters) {
    onTheFloor(spot.x, spot.y, lookFor(sub.id), t, hashOf(sub.id))
    glowing.push([spot.x, spot.y - 10])
    tag(spot.x, spot.y + 3, sub.name, NAME)
    hits.push({ kind: 'sub', id: sub.id, x0: spot.x - 20, y0: spot.y - 44, x1: spot.x + 20, y1: spot.y + 14 })
  }
}

// Everyone on their feet: walking, handing over, or on a break.
const drawWalkers = ({ walkers, players, hits, t }) => {
  for (const { sub, pose } of walkers) {
    const look = lookFor(sub.id)
    const kind = pose.isThere ? pose.errand.kind : null
    if (kind === 'toilet') {
      // In the stall: the door says so
      tag(pose.x, pose.y - 26, 'Optaget', '#E5484D')
      continue
    }
    if (kind === 'meeting') {
      if (pose.errand.dest.row === 'front') sittingBack(pose.x, pose.y, look)
      else sitting(pose.x, pose.y, look, false, t, hashOf(sub.id))
    } else standing(pose.x, pose.y, look, pose.facing, pose.isWalking, t, hashOf(sub.id))
    if (kind === 'coffee') mug(pose.x + 9, pose.y - 22)
    if (kind === 'pingpong') circle(pose.x + (pose.facing === 'right' ? 10 : -10), pose.y - 18, 3.2, '#E5484D', OUTLINE)
    tag(pose.x, pose.y + 3, sub.name, NAME)
    hits.push({ kind: 'sub', id: sub.id, ...standingBox(pose.x, pose.y) })
  }
  // The ping-pong ball, while both players are at the table
  if (players.length === 2) {
    const [left, right] = players[0].pose.x < players[1].pose.x ? players : [players[1], players[0]]
    const k = (Math.sin(t / 420) + 1) / 2
    const bx = left.pose.x + 14 + (right.pose.x - left.pose.x - 28) * k
    const by = left.pose.y - 6 - Math.abs(Math.sin(t / 210)) * 8
    shadow(bx, left.pose.y - 2, 2, 1, 0.25)
    circle(bx, by, 1.6, '#FFFFFF', OUTLINE)
  }
}

// What everyone says, on top of everything.
const drawSpeech = ({ s, main, where, meeting, meetingPose, pause, kitchenSpot, list, seatedAt, subs, walkers, players, floorSitters, t }) => {
  const thanking = walkers.find(w => w.pose.handover)
  if (where === 'kitchen') {
    const lines = ['Kaffepause', s?.stats?.linesAdded ? `${s.stats.linesAdded} linjer i dag` : 'Klar når du er', 'Godt arbejde, team', 'Hvad nu?']
    bubble(kitchenSpot.x, kitchenSpot.y - 52, lines[Math.floor(t / 3000) % lines.length], false, t)
  } else if (thanking) {
    bubble(MAIN.cx, MAIN.dy - 34, thanking.sub.outcome === 'failed' ? `Øv, ${thanking.sub.name}` : `Tak, ${thanking.sub.name}!`, false, t)
  } else if (where === 'desk') {
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
  // On a break: banter in the kitchen
  const onFloor = new Set(subs.filter(x => x.seat >= list.length).map(x => x.id))
  const inKitchen = walkers.filter(w => w.pose.isThere && w.pose.errand.kind === 'coffee')
  const banter = pause && banterFor(inKitchen.map(w => w.sub), subs, pause.slot, onFloor)
  if (banter) {
    const there = Math.min(...inKitchen.map(w => w.pose.there))
    const line = Math.floor(there / 3000)
    if (line < banter.length && there % 3000 < 2600) {
      const [who, text] = banter[line]
      const w = walkers.find(x => x.sub === who)
      if (w) bubble(w.pose.x, w.pose.y - 52, text, false, t, 48)
    }
  }
  // Ping and pong
  if (players.length === 2) {
    const hitter = Math.sin(t / 420) > 0 ? players[1] : players[0]
    if (Math.abs(Math.sin(t / 420)) > 0.97) bubble(hitter.pose.x, hitter.pose.y - 52, hitter === players[0] ? 'Ping!' : 'Pong!', false, t)
  }
  // At the meeting Claude opens, then each says what they are on, in turn
  if (meeting && meetingPose?.isThere) {
    const round = Math.floor(meetingPose.there / 3000)
    if (round === 0) bubble(meetingPose.x, meetingPose.y - 44, 'Kort status, alle sammen', false, t)
    else {
      const sub = meeting.order[(round - 1) % meeting.order.length]
      const w = walkers.find(x => x.sub.id === sub.id && x.pose.isThere)
      const status = sub.activity.detail === 'Tænker' ? 'Jeg tænker stadig over min opgave' : sub.activity.detail
      if (w && meetingPose.there % 3000 < 2600) bubble(w.pose.x, w.pose.y - 44, status, false, t, 40)
    }
  }
}

export const draw = () => {
  const now = Date.now()
  const t = performance.now()
  const s = focused()
  const game = store.state.game
  const hits = []
  const glowing = []
  const timeNow = timeOfDay()
  stepGlide()
  drawBuilding(s?.project ?? '', Math.floor(timeNow))
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(background, 0, 0)
  applyView(ctx)

  const main = s?.main ?? { state: 'idle', detail: 'Ingen session' }
  const subs = s?.subs ?? []
  const walks = { ...WALKS, ...(s?.walks ?? {}) }
  const list = desks()
  const kitchenSpot = coffeeSpot()
  // A helper on its way with a result finds Claude at the desk, not an
  // empty chair: Claude leaves the kitchen or the meeting to take it.
  const isReceiving = subs.some(x => x.phase === 'delivering')
  const meeting = meetingNow(subs, now, walks, main)
  const pause = breakNow(subs, now, walks, meeting)
  const onErrand = errandsNow(subs, now, meeting, pause)
  const meetingPose = meeting?.withClaude && !isReceiving ? errandPose(MAIN_SPOT, { kind: 'meeting', start: meeting.start, stay: STAY.meeting, dest: meeting.head }, now) : null
  // On a break Claude goes to the kitchen; with no kitchen it stays put.
  const where = meetingPose ? 'meeting' : main.state === 'idle' && kitchenSpot && !isReceiving ? 'kitchen' : 'desk'

  const poses = new Map(subs.map(sub => [sub.id, poseOf(sub, now, walks)]))
  const bySeat = new Map(subs.filter(sub => poses.get(sub.id)?.seated && !onErrand.has(sub.id)).map(sub => [sub.seat, sub]))
  const seatedAt = seat => bySeat.get(seat)
  const floorSitters = subs
    .filter(sub => poses.get(sub.id)?.seated && sub.seat >= list.length && !onErrand.has(sub.id))
    .map(sub => ({ sub, spot: placeOf(sub.seat).spot }))
    .sort((a, b) => a.spot.y - b.spot.y)
  const walkers = subs
    .map(sub => ({ sub, pose: onErrand.get(sub.id) ?? poses.get(sub.id) }))
    .filter(w => w.pose && !w.pose.seated)
    .sort((a, b) => a.pose.y - b.pose.y)
  const players = walkers.filter(w => w.pose.isThere && w.pose.errand.kind === 'pingpong')
  const sales = forSaleNow(list)
  const frame = { s, main, where, meeting, meetingPose, pause, kitchenSpot, list, seatedAt, subs, walkers, players, floorSitters, glowing, hits, t }

  const headlights = drawLife(now, t, visibleRect())
  daylight(timeNow)
  board(s?.stats, game?.kroner)
  fish(t)
  espresso(t)
  clock(new Date())
  drawClaude(frame)
  drawDesks(frame)
  drawSaleOutlines(sales, hits)
  drawFloorSitters(frame)
  drawWalkers(frame)
  evening(timeNow, glowing, headlights)
  drawSaleSigns(sales, hits, t)
  construction(now, t)
  drawSpeech(frame)

  // The one whose card is open, ringed.
  const selected = store.selected
  const ring = selected && hits.find(h => h.kind === selected.kind && h.id === selected.id)
  if (ring) dashed(ring.x0, ring.y0, ring.x1 - ring.x0, ring.y1 - ring.y0, 6, 'rgba(47,134,214,0.08)', '#2F86D6')
  store.hits = hits

  if (s?.party) {
    const who = subs.find(x => x.id === s.party.who)
    const spot = who && placeOf(who.seat).isDesk ? placeOf(who.seat) : MAIN
    party({ ...s.party, at: t - (now - s.party.at) }, spot, t)
  }
  // A desk just bought: confetti where it now stands
  const bought = game?.bought?.at(-1)
  if (bought?.item === 'desk' && now - bought.at < 5000) {
    const d = list[list.length - 1]
    if (d) party({ kind: 'confetti', label: 'Nyt skrivebord!', at: t - (now - bought.at) }, d, t)
  }
  drawMinimap()
}
