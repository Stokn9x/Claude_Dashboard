// ── One frame ────────────────────────────────────────────────────────────
// Everything that moves, drawn over the building 60 times a second: Claude,
// the helpers at their desks, on the floor and on their feet, breaks and
// meetings, signs for what is for sale, building work and celebrations, and
// what everyone says, on top.
import { store, focused, owns } from './store.js'
import { OUTLINE, bubble, canvas, circle, ctx, dashed, label, rect, rounded, say, setPixelsPerUnit, shadow, tag } from './gfx.js'
import { hashOf } from './util.js'
import { MAIN, MAIN_SPOT, ROOM_TYPES, at, coffeeSpot, desks, firstRoom, isBuilt, placeOf, shiftOf, typeOf } from './plan.js'
import { HOMEWARD_MS, WALKS, homewardPose, outAt, poseOf, route, walkAt, walkMs } from './routes.js'
import { STAY, banterFor, breakNow, errandPose, meetingNow } from './breaks.js'
import { claudeLook, hands, lookFor, onTheFloor, sitting, sittingBack, standing } from './figures.js'
import { board, chair, clock, desk, deskThingsFor, mug, steam } from './furniture.js'
import { daylight, evening, timeOfDay } from './light.js'
import { chatFor, grumbleAt } from './voices.js'
import { IDLE_WALK_MS, idlePlan } from './idle.js'
import { GROUNDS, handoffFor } from './plan.js'
import { applyView, drawMinimap, isInView, pixelsPerUnit, stepGlide, view, visibleRect } from './camera.js'
import { background, drawBuilding } from './building.js'
import { drawLife } from './outdoors.js'
import { party } from './party.js'
import { forSaleNow, drawSaleOutlines, drawSaleSigns, construction } from './sales.js'

// The longest a walk to a newly bought desk takes; most are shorter
const MOVE_MS = 12_000
const NAME = '#4A5868'
const CLAUDE = '#C8643B'

const seatedBox = (cx, dy) => ({ x0: cx - 22, y0: dy - 34, x1: cx + 22, y1: dy + 42 })
const standingBox = (x, y) => ({ x0: x - 19, y0: y - 52, x1: x + 19, y1: y + 15 })

// Where each helper last had its place, and the walks to a new one: a helper
// whose place changed while at work (a new desk was bought for it) gets up
// and walks there, rather than appearing at the desk.
const lastPlaces = new Map()
const moves = new Map()
// Helpers on their way out, by session and id: { sub, out, key }, kept
// after the status file has let them go, for the walk down the path.
const homeward = new Map()
// Each session's breaks and meetings, settled when they begin (breaks.js)
const lineups = new Map()
const lineupsOf = key => {
  if (!lineups.has(key)) lineups.set(key, new Map())
  return lineups.get(key)
}
// Helpers off work: the walk to their current idle spot, by id
// ({ from, to, start }), and where each was last seen, for the walk back to
// a desk or out of the door once they are called on or go home.
const idleWalks = new Map()
const lastIdle = new Map()

// Where a helper off work is now: walking to its idle spot, or there.
const idlePose = (sub, plan, now) => {
  const target = plan.get(sub.id)
  if (!target) return null
  let walk = idleWalks.get(sub.id)
  const isNewSpot = walk && (walk.to.x !== target.spot.x || walk.to.y !== target.spot.y)
  if (!walk || isNewSpot) {
    // From where it is now, or, the first time, from where it handed over.
    const from = walk ? lastIdle.get(sub.id) ?? walk.to : handoffFor(sub.seat)
    walk = { from: { x: from.x, y: from.y }, to: target.spot, start: walk ? now : sub.since }
    idleWalks.set(sub.id, walk)
  }
  const points = route(walk.from, walk.to)
  const ms = walkMs(points, IDLE_WALK_MS)
  const k = (now - walk.start) / ms
  const pose =
    k < 1
      ? walkAt(points, k)
      : { x: target.spot.x, y: target.spot.y, facing: target.spot.facing ?? 'front', isWalking: false, isThere: true, there: now - walk.start - ms }
  lastIdle.set(sub.id, { x: pose.x, y: pose.y })
  return { ...pose, isIdle: true, errand: { kind: target.kind, dest: target.spot, index: target.index, slot: target.slot } }
}

// ── Never a jump ─────────────────────────────────────────────────────────
// Where a figure should be is worked out afresh every frame. When that is
// suddenly far from where it was drawn a moment ago (a helper called away
// mid-errand, one that hands over before it got to its desk, Claude
// leaving the kitchen), it does not jump: it walks there, briskly, along a
// route, and carries on from there.
const JUMP = 6
// A walk over that heads for where the figure was to be, not where it is
// to be now, is laid again from where it stands.
const STRAY = 40
const BRIDGE_PACE = 2.5
const drawnAt = new Map()
const bridges = new Map()
const apart = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
// The pose to draw instead while walking over, or null to draw the target.
const unjumped = (key, target, now) => {
  const last = drawnAt.get(key)
  let bridge = bridges.get(key)
  if (bridge && (now - bridge.start >= bridge.ms || apart(bridge.to, target) > STRAY)) {
    bridges.delete(key)
    bridge = null
  }
  if (!bridge && last && now - last.at < 500 && apart(target, last) > JUMP) {
    const points = route({ x: last.x, y: last.y }, { x: target.x, y: target.y })
    bridge = { points, to: { x: target.x, y: target.y }, start: now, ms: walkMs(points, Infinity) / BRIDGE_PACE }
    bridges.set(key, bridge)
  }
  const pose = bridge ? { ...walkAt(bridge.points, (now - bridge.start) / bridge.ms), isBridging: true } : null
  const at = pose ?? target
  drawnAt.set(key, { x: at.x, y: at.y, at: now })
  return pose
}
const forget = key => {
  drawnAt.delete(key)
  bridges.delete(key)
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

// The receptionist behind the counter: greets helpers coming in by name,
// says goodbye to those going home, answers the phone now and then.
const RECEPTIONIST = { name: 'Bodil', look: lookFor('reception-bodil') }
const receptionist = ({ subs, walkers, hits, t }, now, walks) => {
  const room = firstRoom('reception')
  if (!room || !owns('reception')) return null
  const { cx, dy } = at(room, typeOf(room).receptionist)
  chair(cx, dy - 4)
  sitting(cx, dy, RECEPTIONIST.look, false, t, 3)
  // The counter in front of her, curved, with a screen and a bell
  rounded(cx - 45, dy - 2, 90, 30, 10, OUTLINE)
  rounded(cx - 44, dy - 1, 88, 28, 9, '#2F5F9C')
  rounded(cx - 44, dy - 1, 88, 7, 4, '#E9EEF2')
  rect(cx + 12, dy - 12, 18, 12, OUTLINE)
  rect(cx + 13, dy - 11, 16, 9, '#7FB4F0')
  circle(cx - 28, dy + 2, 2.6, '#D6A23C', OUTLINE)
  tag(cx, dy + 31, RECEPTIONIST.name, '#20262E')
  const arriving = walkers.find(w => w.sub.phase === 'arriving' && w.sub.from !== 'idle' && w.pose.isWalking)?.sub
  const leaving = walkers.find(w => w.pose.isHomeward || (w.sub.phase === 'leaving' && !w.pose.isIdle))
  const line = arriving
    ? `Velkommen, ${arriving.name}!`
    : leaving
      ? `Farvel, ${leaving.sub.name}!`
      : (t % 14_000) < 2600
        ? ['Claude & Co, goddag!', 'Et øjeblik, jeg stiller om.', 'Kaffen er på 2. sal. Spøg.'][Math.floor(t / 14_000) % 3]
        : null
  return line ? { x: cx, y: dy - 34, line } : null
}

// The lounge's screens light up while someone plays.
const hobbyScreens = (walkers, t) => {
  const room = firstRoom('lounge')
  if (!room || !isBuilt(room)) return
  const playing = kind => walkers.some(w => w.pose.isIdle && w.pose.isThere && w.pose.errand.kind === kind)
  const { tv, arcade } = typeOf(room)
  const colours = ['#3E7CC9', '#2E9E8F', '#D6A23C', '#E5484D', '#8A6FD6']
  if (playing('gaming')) {
    rect(tv.x, tv.y, tv.w, tv.h, colours[Math.floor(t / 400) % colours.length])
    rect(tv.x + 6 + ((t / 30) % (tv.w - 14)), tv.y + 3, 4, 4, '#FFFFFF')
  }
  if (playing('arcade')) {
    rect(arcade.x + 3, arcade.y + 3, arcade.w - 6, 9, colours[Math.floor(t / 250) % colours.length])
    rect(arcade.x + 6 + ((t / 90) % (arcade.w - 14)), arcade.y + 6, 3, 3, '#F2C94C')
  }
}

// What they say now and then in the lounge, by pastime.
const HOBBY_LINES = {
  gaming: ['Én runde til!', 'Du snyder!', 'GG', 'Pause? Aldrig.'],
  darts: ["Bull's-eye!", 'Lige ved og næsten', 'Tredobbelt tyve!'],
  arcade: ['Ny highscore!', 'Game over …', 'Insert coin'],
  pool: ['Otte-ballen i hjørnet', 'Flot stød!', 'Din tur', 'Kridt på køen'],
  bar: ['En limonade, tak', 'Skål!', 'Det har været en lang dag'],
  sofa: ['Ahh, endelig', 'Fem minutter mere …', 'Det her er livet'],
  guitar: ['♪ ♫ ♪', '♫ la la la ♫', '♪ Wonderwall ♪'],
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
    const points = route(move.from, move.to)
    const k = (now - move.start) / walkMs(points, MOVE_MS)
    if (k >= 1) moves.delete(sub.id)
    else if (!onErrand.has(sub.id)) onErrand.set(sub.id, walkAt(points, k))
  }
  return onErrand
}

// Claude: at the desk, on the way to or at the meeting, in the kitchen with
// a mug on a break, or walking between them.
const drawClaude = ({ main, where, meetingPose, claudeWalk, kitchenSpot, glowing, hits, t }) => {
  const isAtDesk = where === 'desk'
  chair(MAIN.cx, MAIN.dy)
  if (isAtDesk) sitting(MAIN.cx, MAIN.dy + 4, claudeLook, main.state === 'waiting', t, 7)
  desk(MAIN.cx, MAIN.dy, 128, isAtDesk ? main.state : null, t, 2)
  if (isAtDesk) {
    glowing.push([MAIN.cx + 46, MAIN.dy + 8], [MAIN.cx - 46, MAIN.dy + 8])
    hands(MAIN.cx, MAIN.dy, claudeLook, main.state !== 'waiting', t)
    tag(MAIN.cx, MAIN.dy + 30, 'Claude', CLAUDE)
    hits.push({ kind: 'claude', id: 'claude', ...seatedBox(MAIN.cx, MAIN.dy) })
  } else if (where === 'walking') {
    const p = claudeWalk
    standing(p.x, p.y, claudeLook, p.facing, p.isWalking, t, 7)
    tag(p.x, p.y + 3, 'Claude', CLAUDE)
    hits.push({ kind: 'claude', id: 'claude', ...standingBox(p.x, p.y) })
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
    if (pose.isThere && pose.errand?.dest?.sit) {
      if (pose.errand.dest.facing === 'back') sittingBack(pose.x, pose.y, look)
      else sitting(pose.x, pose.y, look, false, t, hashOf(sub.id))
      if (kind === 'guitar') {
        rect(pose.x - 12, pose.y - 16, 16, 6, '#B85A33')
        rect(pose.x + 3, pose.y - 15, 10, 2, '#6E4B32')
      }
    }
    else if (kind === 'meeting') {
      if (pose.errand.dest.row === 'front') sittingBack(pose.x, pose.y, look)
      else sitting(pose.x, pose.y, look, false, t, hashOf(sub.id))
    } else standing(pose.x, pose.y, look, pose.facing, pose.isWalking, t, hashOf(sub.id))
    if (kind === 'coffee') mug(pose.x + 9, pose.y - 22)
    if (kind === 'pingpong') circle(pose.x + (pose.facing === 'right' ? 10 : -10), pose.y - 18, 3.2, '#E5484D', OUTLINE)
    tag(pose.x, pose.y + 3, sub.name, NAME)
    if (!pose.isHomeward) hits.push({ kind: 'sub', id: sub.id, ...standingBox(pose.x, pose.y) })
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
const drawSpeech = frame => {
  const { s, main, where, meeting, meetingPose, pause, kitchenSpot, list, seatedAt, subs, walkers, players, floorSitters, t } = frame
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
      const grumble = grumbleAt(sub.name, t, hashOf(sub.id), placeOf(sub.seat).isOutside)
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
  // In the lounge each says a line now and then, on its own beat.
  for (const w of walkers) {
    const lines = w.pose.isIdle && w.pose.isThere ? HOBBY_LINES[w.pose.errand.kind] : null
    const beat = (t + hashOf(w.sub.id) % 7000) % 10_000
    if (lines && beat < 2400) bubble(w.pose.x, w.pose.y - (w.pose.errand.dest.sit ? 44 : 52), lines[Math.floor((t + hashOf(w.sub.id)) / 10_000) % lines.length], false, t)
  }
  if (frame.greeting) bubble(frame.greeting.x, frame.greeting.y, frame.greeting.line, false, t)
  // Off work on the lawn: those standing two by two chat, a line every three
  // seconds, a new subject every fifteen.
  const onLawn = walkers.filter(w => w.pose.isIdle && w.pose.isThere && w.pose.errand.kind === 'garden')
  for (const a of onLawn) {
    if (a.pose.errand.index % 2 !== 0) continue
    const b = onLawn.find(w => w.pose.errand.index === a.pose.errand.index + 1)
    if (!b) continue
    const there = Math.min(a.pose.there, b.pose.there)
    const round = Math.floor(there / 15_000)
    const lines = chatFor(a.sub, b.sub, a.pose.errand.slot * 64 + a.pose.errand.index * 8 + round)
    const line = Math.floor((there % 15_000) / 3000)
    if (line < lines.length && there % 3000 < 2600) {
      const [who, text] = lines[line]
      const w = who === a.sub ? a : b
      bubble(w.pose.x, w.pose.y - 52, text, false, t, 44)
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
  // A window with no size (minimised, or a hidden pane) has nothing to draw on.
  if (!canvas.width || !canvas.height || !background.width || !background.height) return
  const now = Date.now()
  const t = performance.now()
  const s = focused()
  const game = store.state.game
  const hits = []
  const glowing = []
  const timeNow = timeOfDay()
  stepGlide()
  setPixelsPerUnit(pixelsPerUnit(), pixelsPerUnit() / view.zoom)
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
  const settledHere = s ? lineupsOf(s.key) : null
  const meeting = meetingNow(subs, now, walks, main, settledHere)
  const pause = breakNow(subs, now, walks, meeting, settledHere)
  const onErrand = errandsNow(subs, now, meeting, pause)
  const meetingPose = meeting?.withClaude && !isReceiving ? errandPose(MAIN_SPOT, { kind: 'meeting', start: meeting.start, stay: STAY.meeting, dest: meeting.head }, now) : null
  // On a break Claude goes to the kitchen; with no kitchen it stays put.
  const claudeWhere = meetingPose ? 'meeting' : main.state === 'idle' && kitchenSpot && !isReceiving ? 'kitchen' : 'desk'
  const claudeWalk = unjumped(`${s?.key}|claude`, claudeWhere === 'meeting' ? meetingPose : claudeWhere === 'kitchen' ? kitchenSpot : MAIN_SPOT, now)
  const where = claudeWalk ? 'walking' : claudeWhere

  // Off work, a helper keeps clear of the spots a break or the meeting uses.
  const taken = new Set([...(pause?.errands.values() ?? [])].map(e => `${e.dest.x},${e.dest.y}`).concat([...(meeting?.seats.values() ?? [])].map(p => `${p.x},${p.y}`)))
  const plan = idlePlan(subs.filter(sub => sub.phase === 'idle'), now, taken)
  const poses = new Map(
    subs.map(sub => [sub.id, sub.phase === 'idle' ? idlePose(sub, plan, now) : poseOf(sub, now, walks, sub.from === 'idle' ? lastIdle.get(sub.id) ?? GROUNDS.hangout[0] : null)]),
  )
  // Forget the idle walks of those no longer off work, and where helpers
  // idled once they are in no session at all.
  const everyone = new Set(store.state.sessions.flatMap(x => (x.subs ?? []).map(sub => sub.id)))
  for (const id of idleWalks.keys()) if (!subs.some(sub => sub.id === id && sub.phase === 'idle')) idleWalks.delete(id)
  for (const id of lastIdle.keys()) if (!everyone.has(id)) lastIdle.delete(id)
  // Nobody jumps: a helper far from where it was drawn walks over first.
  const bridged = new Map()
  for (const sub of subs) {
    const pose = onErrand.get(sub.id) ?? poses.get(sub.id)
    const key = `${s.key}|${sub.id}`
    if (!pose || pose.isIdle === true && pose.x === undefined) {
      forget(key)
      continue
    }
    const walk = unjumped(key, pose.seated ? placeOf(sub.seat).spot : pose, now)
    if (walk) bridged.set(sub.id, walk)
  }
  const isSeated = sub => poses.get(sub.id)?.seated && !onErrand.has(sub.id) && !bridged.has(sub.id)
  const bySeat = new Map(subs.filter(isSeated).map(sub => [sub.seat, sub]))
  const seatedAt = seat => bySeat.get(seat)
  const floorSitters = subs
    .filter(sub => isSeated(sub) && sub.seat >= list.length)
    .map(sub => ({ sub, spot: placeOf(sub.seat).spot }))
    .sort((a, b) => a.spot.y - b.spot.y)
  for (const sub of subs) {
    const out = outAt(sub, walks)
    if (out !== null) homeward.set(`${s.key}|${sub.id}`, { sub, out, key: s.key })
  }
  const goingHome = []
  for (const [id, { sub, out, key }] of homeward) {
    if (now > out + HOMEWARD_MS) homeward.delete(id)
    else if (key === s?.key && now >= out && !subs.some(x => x.id === sub.id && x.phase !== 'leaving' && x.phase !== 'delivering')) {
      const pose = homewardPose(sub.id, out, now)
      if (pose) goingHome.push({ sub, pose: { ...pose, isHomeward: true } })
    }
  }
  const walkers = subs
    .map(sub => ({ sub, pose: bridged.get(sub.id) ?? onErrand.get(sub.id) ?? poses.get(sub.id) }))
    .filter(w => w.pose && !w.pose.seated)
    .concat(goingHome)
    .sort((a, b) => a.pose.y - b.pose.y)
  const players = walkers.filter(w => w.pose.isThere && w.pose.errand.kind === 'pingpong')
  const sales = forSaleNow(list)
  const frame = { s, main, where, meeting, meetingPose, claudeWalk, pause, kitchenSpot, list, seatedAt, subs, walkers, players, floorSitters, glowing, hits, t }

  const headlights = drawLife(now, t, visibleRect())
  daylight(timeNow)
  board(s?.stats, game?.kroner)
  fish(t)
  espresso(t)
  clock(new Date())
  hobbyScreens(walkers, t)
  frame.greeting = receptionist(frame, now, walks)
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
