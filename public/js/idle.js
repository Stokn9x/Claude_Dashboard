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
export const IDLE_WALK_MS = 9000

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
export const idlePlan = (idleSubs, now) => {
  const slot = Math.floor(now / IDLE_SLOT_MS)
  const picks = { pingpong: [], coffee: [], garden: [], ...Object.fromEntries(HOBBIES.map(kind => [kind, []])) }
  const pastimes = HOBBIES.filter(kind => spotsFor(kind).length)
  for (const sub of [...idleSubs].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const r = stir(hashOf(sub.id), slot + 31) % 100
    // With a lounge, half of them go to play; which pastime, the id says,
    // among those the lounge's steps have.
    if (pastimes.length && r >= 50) picks[pastimes[stir(hashOf(sub.id), slot + 77) % pastimes.length]].push(sub)
    else if (owns('pingpong') && r < 25) picks.pingpong.push(sub)
    else if (owns('kitchen') && r < 50) picks.coffee.push(sub)
    else picks.garden.push(sub)
  }
  // Ping-pong takes two, no more and no fewer; the rest go out on the lawn.
  if (picks.pingpong.length < 2) picks.garden.push(...picks.pingpong.splice(0))
  else picks.garden.push(...picks.pingpong.splice(2))
  const plan = new Map()
  const overflow = []
  for (const kind of ['pingpong', 'coffee', ...HOBBIES]) {
    const spots = spotsFor(kind)
    picks[kind].forEach((sub, index) => (index < spots.length ? plan.set(sub.id, { kind, spot: spots[index], index, slot }) : overflow.push(sub)))
  }
  const lawn = spotsFor('garden')
  ;[...picks.garden, ...overflow].forEach((sub, index) => {
    // More than the lawn's spots: a little further out, still in pairs.
    const ring = Math.floor(index / lawn.length)
    const base = lawn[index % lawn.length]
    plan.set(sub.id, { kind: 'garden', spot: { ...base, x: base.x + ring * 70, y: base.y + ring * 12 }, index, slot })
  })
  return plan
}
