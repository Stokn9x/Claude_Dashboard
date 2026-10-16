// ── The office cat, and what Claude does on a pause ──────────────────────
// The cat, once bought, wanders between its favourite places: by the
// armchair in Claude's office, the reception floor, its bowl in the
// kitchen, the lounge sofa and the lawn, as far as they are built. It picks
// a place every forty seconds from the clock alone, walks there along
// the routes everyone uses, and sits, sleeps or eats. Claude, on a pause,
// takes a coffee, waters the plants in its office or comes to stroke the
// cat. No DOM here, so it can be tested without a browser.
import { owns } from './store.js'
import { GROUNDS, at, coffeeSpot, firstRoom, isBuilt, spotsIn, typeOf } from './plan.js'
import { route, walkAt } from './routes.js'
import { stir } from './util.js'

export const CAT_SLOT_MS = 40_000
// A cat strolls: a little slower than the helpers.
const CAT_SPEED = 0.05
// Never more than this of a slot on the way.
const CAT_WALK_MOST = 16_000

// Where the cat likes to be, in its room's own coordinates: what it does
// there, and which way it faces.
const NOOKS = {
  corner: { x: 214, y: 224, kind: 'sit', facing: 'right' },
  reception: { x: 350, y: 446, kind: 'sleep', facing: 'left' },
  kitchen: { x: 818, y: 542, kind: 'eat', facing: 'right' },
}

// The cat's places in the office as it stands now, in a fixed order.
export const catPlaces = () => {
  const places = []
  for (const type of ['corner', 'reception', 'kitchen']) {
    const room = firstRoom(type)
    if (room && isBuilt(room)) places.push({ ...at(room, NOOKS[type]), name: type })
  }
  const lounge = firstRoom('lounge')
  const sofa = spotsIn(lounge, typeOf(lounge)?.hobbies?.sofa)[1]
  if (sofa) places.push({ x: sofa.x + 18, y: sofa.y - 2, kind: 'sleep', facing: 'front', name: 'sofa' })
  const lawn = GROUNDS.hangout[0]
  places.push({ x: lawn.x - 40, y: lawn.y + 12, kind: 'sit', facing: 'right', name: 'lawn' })
  return places
}
// Where the kitchen bowl stands, beside the cat's place there.
export const bowlOf = place => ({ x: place.x + 13, y: place.y + 3 })

// The place for a slot. Now and then it is the same as before, and the cat
// just stays a while longer, as cats do.
const placeIndex = (slot, n) => stir(slot >>> 0, 13) % n

const lengthOf = points => points.slice(1).reduce((d, p, i) => d + Math.hypot(p.x - points[i].x, p.y - points[i].y), 0)
const facingOf = (a, b) => (Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? (b.x > a.x ? 'right' : 'left') : b.y > a.y ? 'front' : 'back')

// Where the cat is now and what it does: walking from its last place, or
// there, sitting, sleeping or eating. Called (when Claude comes to stroke
// it), it goes to the place named, from wherever it was at `since`. Null
// with no cat.
export const catNow = (now, called = null, since = now) => {
  if (!owns('cat')) return null
  const places = catPlaces()
  const slot = Math.floor(now / CAT_SLOT_MS)
  const target = called && places.find(p => p.name === called)
  if (target) return walkOrBe(catNow(since), target, now - since)
  return walkOrBe(places[placeIndex(slot - 1, places.length)], places[placeIndex(slot, places.length)], now - slot * CAT_SLOT_MS)
}

// On the way from `from` (a place, or where the cat stood) to the place `to`,
// `into` ms after setting off, or there.
const walkOrBe = (from, to, into) => {
  const points = route({ x: from.x, y: from.y }, { x: to.x, y: to.y })
  const ms = Math.min(CAT_WALK_MOST, lengthOf(points) / CAT_SPEED)
  const isSame = Math.hypot(from.x - to.x, from.y - to.y) < 1
  if (!isSame && into < ms) {
    const p = walkAt(points, into / ms)
    return { x: p.x, y: p.y, facing: p.facing ?? facingOf(from, to), isWalking: true, kind: 'walk', place: to, there: 0 }
  }
  return { x: to.x, y: to.y, facing: to.facing, isWalking: false, kind: to.kind, place: to, there: isSame ? into : into - ms }
}

// ── Claude's pause ───────────────────────────────────────────────────────
export const PAUSE_SLOT_MS = 60_000
// Beside the big plant in Claude's office, can in hand; and beside the
// armchair, where the cat comes to be stroked.
const WATERING = { x: 376, y: 212, facing: 'right' }
const STROKING = { x: 240, y: 224, facing: 'left' }

// What Claude does on a pause right now: a coffee in the kitchen, the
// plants, or the cat, by turns from the clock among what there is.
export const claudePause = now => {
  const kitchen = coffeeSpot()
  const corner = firstRoom('corner')
  const choices = [...(kitchen ? ['kitchen', 'kitchen'] : []), 'plants', ...(owns('cat') ? ['cat'] : [])]
  const slot = Math.floor(now / PAUSE_SLOT_MS)
  const kind = choices[stir(slot >>> 0, 29) % choices.length]
  if (kind === 'kitchen') return { kind, spot: { ...kitchen, facing: 'front' } }
  return { kind, spot: at(corner, kind === 'plants' ? WATERING : STROKING), slot }
}
