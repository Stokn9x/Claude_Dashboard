// ── Breaks ───────────────────────────────────────────────────────────────
// The helpers are real subagents at work; their breaks are for show. Who
// takes which break, and when, is worked out from their ids and the clock,
// so every viewer sees the same and a reload changes nothing. Every three
// minutes there is a break: some fetch coffee (and talk), some go to the
// toilet, two play ping-pong in the lounge, each only where it is bought. Every ten
// minutes, with three or more helpers in, Claude holds a short meeting.
// Nobody leaves while they wait for you.
import { store, owns } from './store.js'
import { hashOf, kr, stir } from './util.js'
import { at, firstRoom, isBuilt, spotsIn, typeOf } from './plan.js'
import { route, walkAt, walkMs } from './routes.js'
import { voice } from './voices.js'

const BREAK_EVERY = 180_000
const BREAK_AT = 20_000
const MEETING_EVERY = 600_000
const MEETING_AT = 60_000
// The longest an errand's walk takes either way; most are shorter, at the
// common pace.
const ERRAND_WALK = 8000
export const STAY = { coffee: 22_000, toilet: 12_000, pingpong: 24_000, meeting: 25_000 }

// Helpers who can take a break that starts at `start`: at their place well
// before it, and not waiting for you.
const freeFor = (subs, start, walks) =>
  subs
    .filter(s => s.phase === 'working' && s.since + walks.arrive + 5000 < start && s.activity.state !== 'waiting')
    .sort((a, b) => (a.id < b.id ? -1 : 1))

// The meeting going on now, if any: who sits where, from when.
export const meetingNow = (subs, now, walks, main) => {
  const room = firstRoom('meeting')
  if (!room || !isBuilt(room)) return null
  const slot = Math.floor(now / MEETING_EVERY)
  const start = slot * MEETING_EVERY + MEETING_AT
  if (now < start || now > start + STAY.meeting + 2 * ERRAND_WALK) return null
  const people = freeFor(subs, start, walks)
  if (people.length < 3) return null
  const chairs = typeOf(room).chairs.map(c => at(room, c))
  const order = people.slice(0, chairs.length)
  const seats = new Map(order.map((s, i) => [s.id, chairs[i]]))
  // Claude joins when at work; on a break, or waiting for you, it stays put.
  const withClaude = main.state !== 'waiting' && main.state !== 'idle'
  return { start, seats, head: at(room, typeOf(room).head), withClaude, order }
}

// The break going on now: who does what, where.
export const breakNow = (subs, now, walks, meeting) => {
  const slot = Math.floor(now / BREAK_EVERY)
  const start = slot * BREAK_EVERY + BREAK_AT
  if (now < start || now > start + STAY.pingpong + 2 * ERRAND_WALK + 9000) return null
  const picks = { coffee: [], toilet: [], pingpong: [] }
  for (const sub of freeFor(subs, start, walks)) {
    if (meeting?.seats.has(sub.id)) continue
    const r = stir(hashOf(sub.id), slot) % 100
    if (owns('pingpong') && r < 22) picks.pingpong.push(sub)
    else if (owns('toilet') && r < 36) picks.toilet.push(sub)
    else if (owns('kitchen') && r < 75) picks.coffee.push(sub)
  }
  // Ping-pong takes two; the rest go for coffee.
  const extra = picks.pingpong.length >= 2 ? picks.pingpong.splice(2) : picks.pingpong.splice(0)
  if (owns('kitchen')) picks.coffee.push(...extra)
  const kitchen = firstRoom('kitchen')
  const toilet = firstRoom('toilet')
  const lounge = firstRoom('lounge')
  const spotsFor = {
    coffee: spotsIn(kitchen, typeOf(kitchen).standing),
    toilet: spotsIn(toilet, typeOf(toilet).stalls),
    pingpong: owns('pingpong') ? spotsIn(lounge, typeOf(lounge).pingpong) : [],
  }
  const errands = new Map()
  for (const kind of ['coffee', 'toilet', 'pingpong']) {
    picks[kind].slice(0, spotsFor[kind].length).forEach((sub, i) => {
      // Staggered a little, so not everyone gets up at once; ping-pong
      // players start together.
      const stagger = kind === 'pingpong' ? 0 : (stir(hashOf(sub.id), slot + 7) % 9) * 900
      errands.set(sub.id, { kind, start: start + stagger, stay: STAY[kind], dest: spotsFor[kind][i], index: i, slot })
    })
  }
  return { slot, start, errands }
}

// Where someone on an errand is: on the way there, there, or on the way back.
export const errandPose = (home, e, now) => {
  const t = now - e.start
  const there = route(home, e.dest)
  const back = route(e.dest, home)
  const go = walkMs(there, ERRAND_WALK)
  const come = walkMs(back, ERRAND_WALK)
  if (t < 0 || t >= go + e.stay + come) return null
  if (t < go) return { ...walkAt(there, t / go), errand: e }
  if (t < go + e.stay) return { x: e.dest.x, y: e.dest.y, facing: e.dest.facing ?? 'front', isWalking: false, isThere: true, there: t - go, errand: e }
  return { ...walkAt(back, (t - go - e.stay) / come), errand: e }
}

// ── Banter ───────────────────────────────────────────────────────────────
// Two or more at the coffee machine talk. What about is picked for the
// break from what is true today: who wrote the most, who sits on the floor,
// who waits for you, what the office has bought. Each exchange is a few
// lines, said in turn, three seconds apart.
const BANTER = [
  ({ people, top }) =>
    top && top.linesAdded >= 10 && people.length > 1 && [
      [top, `Jeg har skrevet ${top.linesAdded} linjer i dag.`],
      [people.find(p => p !== top), voice(people.find(p => p !== top), { kæk: 'Imponerende. Hvor mange af dem virker?', tør: 'Mange linjer. Få tests.', dramatisk: 'Og jeg har knap nok skrevet én!', positiv: 'Wauw, det er flot!' })],
      [top, voice(top, { kæk: 'Alle sammen. Næsten.', tør: 'De virker.', dramatisk: 'Hver eneste én blev skrevet med blod og sved!', positiv: 'Tak! Vi er et godt hold.' })],
    ],
  ({ people, onFloor }) => {
    const f = people.find(p => onFloor.has(p.id))
    const d = people.find(p => !onFloor.has(p.id))
    return (
      f &&
      d && [
        [f, voice(f, { kæk: 'Fint for jer med jeres skriveborde.', tør: 'Gulvet er hårdt.', dramatisk: 'I aner ikke, hvad jeg har været igennem dernede!', positiv: 'Gulvet er faktisk ikke så slemt.' })],
        [d, voice(d, { kæk: 'Du kan låne min stol, når jeg går hjem.', tør: 'Det ved jeg.', dramatisk: 'Jeg lider med dig. Fra min stol.', positiv: 'Du får snart et skrivebord, det er jeg sikker på!' })],
        [f, voice(f, { kæk: 'Du går aldrig hjem!', tør: 'Mm.', dramatisk: 'Løfter, løfter!', positiv: 'Tak, det håber jeg!' })],
      ]
    )
  },
  ({ people }) => {
    const busy = people.find(p => (p.tools ?? 0) >= 8)
    const other = people.find(p => p !== busy)
    return busy && other && [[other, `${busy.name}, ${busy.tools} værktøjer allerede? Slapper du aldrig af?`], [busy, 'Det her ER mit kaffepause-ansigt.']]
  },
  ({ people: [a, b] }) => [[a, 'Har nogen set Claude holde fri?'], [b, 'Claude drikker kun kaffe, når vi er færdige.'], [a, 'Så må vi hellere skynde os.']],
  ({ people: [a, b] }) => [[a, 'Hvem har spist den sidste kage?'], [b, 'Ikke mig.'], [a, 'Du har krummer på trøjen.'], [b, '… det var en meget lille kage.']],
  ({ people: [a, b] }) => owns('pingpong') && [[a, `Revanche ved bordtennisbordet, ${b.name}?`], [b, 'Du taber stadig.'], [a, 'Det var vinden sidst!'], [b, 'Vi er indenfor.']],
  ({ people: [a, b], waiting }) =>
    waiting && [[a, `${waiting.name} har ventet på godkendelse et stykke tid.`], [b, 'Mennesker. De er så langsomme.'], [a, 'Sig det ikke højt. De læser med.']],
  ({ people: [a, b], onFloor, all }) => {
    const game = store.state.game
    const price = game?.next?.desk
    const f = all.find(p => onFloor.has(p.id))
    return f && typeof price === 'number' && (game?.kroner ?? 0) >= price && [[a, `Vi har ${kr(game.kroner)}. Hvorfor sidder ${f.name} stadig på gulvet?`], [b, 'Claude sparer op til en bordtennisbat.']]
  },
  ({ people: [a, b] }) => owns('meeting') && [[a, voice(a, { kæk: 'Skal vi virkelig til møde igen?', tør: 'Møde om lidt.', dramatisk: 'Ikke ET møde til!', positiv: 'Jeg glæder mig til mødet!' })], [b, voice(b, { kæk: 'Ja. Mødet om mødet.', tør: 'Ja.', dramatisk: 'Det bliver vores sidste.', positiv: 'Det bliver hyggeligt.' })]],
  ({ people: [a, b] }) => [
    [a, voice(a, { kæk: 'Kaffen er bedre i dag.', tør: 'Kaffe.', dramatisk: 'Denne kaffe redder mit liv!', positiv: 'Mmm, dejlig kaffe i dag!' })],
    [b, voice(b, { kæk: 'Det er den samme kaffe.', tør: 'Den samme som i går.', dramatisk: 'Den smager af nederlag.', positiv: 'Ja, den er rigtig god!' })],
    [a, 'Så er det mig, der er bedre i dag.'],
  ],
]

// The exchange for this break in the kitchen: [who, line] in turn.
export const banterFor = (people, all, slot, onFloor) => {
  if (people.length < 2) return null
  const top = [...all].sort((x, y) => (y.linesAdded ?? 0) - (x.linesAdded ?? 0))[0]
  const waiting = all.find(p => p.activity.state === 'waiting')
  const options = BANTER.map(topic => topic({ people, all, top, waiting, onFloor })).filter(Boolean)
  return options.length ? options[stir(slot, 11) % options.length] : null
}
