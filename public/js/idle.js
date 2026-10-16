// What helpers do while they are off work, between handing over and going
// home: ping-pong (two at a time), a coffee in the kitchen, the sofa in the
// lounge corner, a hobby in the hobby room (games, darts, the arcade
// machine, lego, the guitar), or a chat on the lawn by the path. Each picks anew every
// three quarters of a minute, from its id and the clock, among the rooms
// that are bought; the lawn is always there. No DOM here, so it can be
// tested without a browser.
import { owns } from './store.js'
import { GROUNDS, at, firstRoom, isBuilt, typeOf } from './plan.js'
import { hashOf, stir } from './util.js'

export const IDLE_SLOT_MS = 45_000
// How long the walk to a new idle spot takes
export const IDLE_WALK_MS = 4000

// The two seats on the sofa, in the team room's own coordinates
const SOFA = [{ x: 166, y: 376, facing: 'front' }, { x: 192, y: 376, facing: 'front' }]

const HOBBIES = ['gaming', 'darts', 'arcade', 'pool', 'bar', 'guitar', 'sofa']

const spotsFor = kind => {
  if (kind === 'garden') return GROUNDS.hangout
  if (HOBBIES.includes(kind)) {
    const room = firstRoom('hobby')
    return room && isBuilt(room) ? typeOf(room).hobbies[kind].map(p => at(room, p)) : []
  }
  if (kind === 'pingpong') {
    const team = firstRoom('team')
    return team ? typeOf(team).pingpong.map(p => at(team, p)) : []
  }
  if (kind === 'lounge') {
    const team = firstRoom('team')
    return team ? SOFA.map(p => at(team, p)) : []
  }
  // Coffee: the kitchen's standing spots from the far end, so a break's
  // coffee drinkers and these meet less often.
  const kitchen = firstRoom('kitchen')
  return kitchen && isBuilt(kitchen) ? [...typeOf(kitchen).standing].reverse().map(p => at(kitchen, p)) : []
}

// Where each helper off work is now and what it does: id → { kind, spot, index, slot }.
export const idlePlan = (idleSubs, now) => {
  const slot = Math.floor(now / IDLE_SLOT_MS)
  const picks = { pingpong: [], coffee: [], lounge: [], garden: [], ...Object.fromEntries(HOBBIES.map(kind => [kind, []])) }
  for (const sub of [...idleSubs].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const r = stir(hashOf(sub.id), slot + 31) % 100
    // With a hobby room, half of them go to play; which hobby, the id says.
    if (owns('hobby') && r >= 50) picks[HOBBIES[stir(hashOf(sub.id), slot + 77) % HOBBIES.length]].push(sub)
    else if (owns('pingpong') && r < 25) picks.pingpong.push(sub)
    else if (owns('kitchen') && r < 50) picks.coffee.push(sub)
    else if (owns('lounge') && r < 70) picks.lounge.push(sub)
    else picks.garden.push(sub)
  }
  // Ping-pong takes two, no more and no fewer; the rest go out on the lawn.
  if (picks.pingpong.length < 2) picks.garden.push(...picks.pingpong.splice(0))
  else picks.garden.push(...picks.pingpong.splice(2))
  const plan = new Map()
  const overflow = []
  for (const kind of ['pingpong', 'coffee', 'lounge', ...HOBBIES]) {
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
