// What helpers do while they are off work, between handing over and going
// home: ping-pong in the lounge (two at a time), a coffee in the kitchen, a
// pastime in the lounge (the TV, the sofa, pool, darts, the bar, the arcade
// machine, the guitar, as far as its steps go), or a chat on the lawn by
// the path. Each picks anew every three quarters of a minute, from its id
// and the clock, among what is bought; the lawn is always there. No DOM
// here, so it can be tested without a browser.
import { owns } from './store.js'
import { GROUNDS, firstRoom, spotsIn, typeOf } from './plan.js'
import { hashOf, stir } from './util.js'

export const IDLE_SLOT_MS = 45_000
// The longest the walk to a new idle spot takes; most are shorter, at the
// common pace.
export const IDLE_WALK_MS = 14_000

const HOBBIES = ['gaming', 'sofa', 'pool', 'darts', 'bar', 'arcade', 'guitar']

const spotsFor = kind => {
  if (kind === 'garden') return GROUNDS.hangout
  if (HOBBIES.includes(kind)) {
    const room = firstRoom('lounge')
    return spotsIn(room, typeOf(room).hobbies[kind])
  }
  if (kind === 'pingpong') {
    const lounge = firstRoom('lounge')
    return owns('pingpong') ? spotsIn(lounge, typeOf(lounge).pingpong) : []
  }
  // Coffee: the kitchen's standing spots from the far end, so a break's
  // coffee drinkers and these meet less often.
  const kitchen = firstRoom('kitchen')
  return spotsIn(kitchen, typeOf(kitchen).standing).reverse()
}

// Where each helper off work is now and what it does: id → { kind, spot, index, slot }.
// Spots in `taken` ("x,y") are in use by a break or a meeting; ping-pong
// needs both ends of the table.
export const idlePlan = (idleSubs, now, taken = new Set()) => {
  const slot = Math.floor(now / IDLE_SLOT_MS)
  const free = kind => {
    const spots = spotsFor(kind).filter(p => !taken.has(`${p.x},${p.y}`))
    return kind === 'pingpong' && spots.length < 2 ? [] : spots
  }
  const picks = { pingpong: [], coffee: [], garden: [], ...Object.fromEntries(HOBBIES.map(kind => [kind, []])) }
  const pastimes = HOBBIES.filter(kind => free(kind).length)
  for (const sub of [...idleSubs].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const r = stir(hashOf(sub.id), slot + 31) % 100
    // With a lounge, half of them go to play; which pastime, the id says,
    // among those the lounge's steps have.
    if (pastimes.length && r >= 50) picks[pastimes[stir(hashOf(sub.id), slot + 77) % pastimes.length]].push(sub)
    else if (free('pingpong').length && r < 25) picks.pingpong.push(sub)
    else if (free('coffee').length && r < 50) picks.coffee.push(sub)
    else picks.garden.push(sub)
  }
  // Ping-pong takes two, no more and no fewer; the rest go out on the lawn.
  if (picks.pingpong.length < 2) picks.garden.push(...picks.pingpong.splice(0))
  else picks.garden.push(...picks.pingpong.splice(2))
  const plan = new Map()
  const overflow = []
  for (const kind of ['pingpong', 'coffee', ...HOBBIES]) {
    const spots = free(kind)
    picks[kind].forEach((sub, index) => (index < spots.length ? plan.set(sub.id, { kind, spot: spots[index], index, slot }) : overflow.push(sub)))
  }
  const lawn = spotsFor('garden')
  ;[...picks.garden, ...overflow].forEach((sub, index) => {
    // More than the lawn's spots: a little further out, still in pairs, at
    // most two rings out, where no tree grows (scenery.js).
    const ring = Math.floor(index / lawn.length) % 3
    const base = lawn[index % lawn.length]
    plan.set(sub.id, { kind: 'garden', spot: { ...base, x: base.x + ring * 70, y: base.y + ring * 12 }, index, slot })
  })
  return plan
}

// A regular (one of your own agents, in all day) between jobs takes time
// off too, and keeps its desk. Time runs in stretches of three minutes; in
// about every other one, from its id and the clock, it goes to the lounge,
// the kitchen or the lawn like a helper off work. Only a stretch that began
// once it had sat ready a minute: nobody leaves the moment it sits down.
// When the stretch ends, or a job comes, it walks back to its desk.
export const REGULAR_SLOT_MS = 3 * 60_000
export const READY_FIRST_MS = 60_000

// When its time off began, or null when it is at its desk.
export const offSince = (sub, now, walks) => {
  if (!sub.staff || sub.isOnJob || sub.phase !== 'working') return null
  const slot = Math.floor(now / REGULAR_SLOT_MS)
  const start = slot * REGULAR_SLOT_MS
  const ready = sub.since + (walks?.arrive ?? 12_000)
  if (ready + READY_FIRST_MS > start) return null
  return stir(hashOf(sub.id), slot + 101) % 100 < 50 ? start : null
}

// Off work now: a helper between handing over and going home, or a
// regular on its time off.
export const isOffWork = (sub, now, walks) => sub.phase === 'idle' || offSince(sub, now, walks) !== null
