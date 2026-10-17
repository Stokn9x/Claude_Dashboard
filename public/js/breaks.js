// ── Breaks ───────────────────────────────────────────────────────────────
// The helpers are real subagents at work; their breaks are for show. Who
// takes which break, and when, is worked out from their ids and the clock,
// so every viewer sees the same and a reload changes nothing. Every three
// minutes there is a break: some fetch coffee (and talk), some go to the
// toilet, two play ping-pong in the lounge, each only where it is bought.
// Every ten minutes, with three or more helpers in, Claude holds a short
// meeting; no break starts round a meeting. Who goes where is settled when
// a break or meeting begins and kept until it ends (the caller keeps a
// `lineups` map for that), so a helper who finishes or starts waiting
// meanwhile changes nobody else's errand. Nobody leaves while they wait
// for you.
import { L } from './i18n.js'
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
// common pace. Long enough for the far end of a full-grown house.
const ERRAND_WALK = 14_000
const MEETING_WINDOW = () => STAY.meeting + 2 * ERRAND_WALK
const BREAK_WINDOW = () => STAY.pingpong + 2 * ERRAND_WALK + 9000
export const STAY = { coffee: 22_000, toilet: 12_000, pingpong: 24_000, meeting: 25_000 }

// Helpers who can take a break that starts at `start`: at their place well
// before it, and not waiting for you.
const freeFor = (subs, start, walks) =>
  subs
    .filter(s => s.phase === 'working' && s.since + walks.arrive + 5000 < start && s.activity.state !== 'waiting')
    .sort((a, b) => (a.id < b.id ? -1 : 1))

// A line-up settled once, the first time it is asked for: kept in the
// caller's map, which holds only the latest few.
const settled = (lineups, key, make) => {
  if (!lineups) return make()
  if (!lineups.has(key)) {
    lineups.set(key, make())
    while (lineups.size > 8) lineups.delete(lineups.keys().next().value)
  }
  return lineups.get(key)
}

// The meeting going on now, if any: who sits where, from when.
export const meetingNow = (subs, now, walks, main, lineups = null) => {
  const room = firstRoom('meeting')
  if (!room || !isBuilt(room)) return null
  const slot = Math.floor(now / MEETING_EVERY)
  const start = slot * MEETING_EVERY + MEETING_AT
  if (now < start || now > start + MEETING_WINDOW()) return null
  const lineup = settled(lineups, `meeting ${slot}`, () => {
    const people = freeFor(subs, start, walks)
    if (people.length < 3) return null
    const chairs = typeOf(room).chairs.map(c => at(room, c))
    const order = people.slice(0, chairs.length)
    return { order, seats: new Map(order.map((s, i) => [s.id, chairs[i]])) }
  })
  if (!lineup) return null
  // Claude joins when at work; on a break, or waiting for you, it stays put.
  const withClaude = main.state !== 'waiting' && main.state !== 'idle'
  // The order holds the helpers as they were; who they are now is in subs.
  const order = lineup.order.map(o => subs.find(s => s.id === o.id) ?? o)
  return { start, seats: lineup.seats, head: at(room, typeOf(room).head), withClaude, order }
}

// Whether a break that starts at `start` would run into a meeting.
const isNearMeeting = start => {
  const room = firstRoom('meeting')
  if (!room || !isBuilt(room)) return false
  const first = Math.floor(start / MEETING_EVERY) * MEETING_EVERY + MEETING_AT
  return [first - MEETING_EVERY, first, first + MEETING_EVERY].some(m => start < m + MEETING_WINDOW() && m < start + BREAK_WINDOW())
}

// The break going on now: who does what, where.
export const breakNow = (subs, now, walks, meeting, lineups = null) => {
  const slot = Math.floor(now / BREAK_EVERY)
  const start = slot * BREAK_EVERY + BREAK_AT
  if (now < start || now > start + BREAK_WINDOW() || isNearMeeting(start)) return null
  return settled(lineups, `break ${slot}`, () => lineupFor(subs, slot, start, walks, meeting))
}

const lineupFor = (subs, slot, start, walks, meeting) => {
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
      [top, L(`Jeg har skrevet ${top.linesAdded} linjer i dag.`, `I’ve written ${top.linesAdded} lines today.`)],
      [people.find(p => p !== top), voice(people.find(p => p !== top), { kæk: L('Imponerende. Hvor mange af dem virker?', 'Impressive. How many of them work?'), tør: L('Mange linjer. Få tests.', 'Lots of lines. Few tests.'), dramatisk: L('Og jeg har knap nok skrevet én!', 'And I’ve barely written one!'), positiv: L('Wauw, det er flot!', 'Wow, that’s great!') })],
      [top, voice(top, { kæk: L('Alle sammen. Næsten.', 'All of them. Almost.'), tør: L('De virker.', 'They work.'), dramatisk: L('Hver eneste én blev skrevet med blod og sved!', 'Every one written in blood and sweat!'), positiv: L('Tak! Vi er et godt hold.', 'Thanks! We’re a good team.') })],
    ],
  ({ people, onFloor }) => {
    const f = people.find(p => onFloor.has(p.id))
    const d = people.find(p => !onFloor.has(p.id))
    return (
      f &&
      d && [
        [f, voice(f, { kæk: L('Fint for jer med jeres skriveborde.', 'Nice for you, with your desks.'), tør: L('Gulvet er hårdt.', 'The floor is hard.'), dramatisk: L('I aner ikke, hvad jeg har været igennem dernede!', 'You’ve no idea what I’ve been through down there!'), positiv: L('Gulvet er faktisk ikke så slemt.', 'The floor isn’t that bad, really.') })],
        [d, voice(d, { kæk: L('Du kan låne min stol, når jeg går hjem.', 'You can borrow my chair when I go home.'), tør: L('Det ved jeg.', 'I know.'), dramatisk: L('Jeg lider med dig. Fra min stol.', 'I suffer with you. From my chair.'), positiv: L('Du får snart et skrivebord, det er jeg sikker på!', 'You’ll get a desk soon, I’m sure of it!') })],
        [f, voice(f, { kæk: L('Du går aldrig hjem!', 'You never go home!'), tør: L('Mm.', 'Mm.'), dramatisk: L('Løfter, løfter!', 'Promises, promises!'), positiv: L('Tak, det håber jeg!', 'Thanks, I hope so!') })],
      ]
    )
  },
  ({ people }) => {
    const busy = people.find(p => (p.tools ?? 0) >= 8)
    const other = people.find(p => p !== busy)
    return busy && other && [[other, L(`${busy.name}, ${busy.tools} værktøjer allerede? Slapper du aldrig af?`, `${busy.name}, ${busy.tools} tools already? Do you ever relax?`)], [busy, L('Det her ER mit kaffepause-ansigt.', 'This IS my coffee-break face.')]]
  },
  ({ people: [a, b] }) => [[a, L('Har nogen set Claude holde fri?', 'Anyone seen Claude take a break?')], [b, L('Claude drikker kun kaffe, når vi er færdige.', 'Claude only has coffee once we’re done.')], [a, L('Så må vi hellere skynde os.', 'Then we’d better hurry.')]],
  ({ people: [a, b] }) => [[a, L('Hvem har spist den sidste kage?', 'Who ate the last cake?')], [b, L('Ikke mig.', 'Not me.')], [a, L('Du har krummer på trøjen.', 'You’ve got crumbs on your jumper.')], [b, L('… det var en meget lille kage.', '… it was a very small cake.')]],
  ({ people: [a, b] }) => owns('pingpong') && [[a, L(`Revanche ved bordtennisbordet, ${b.name}?`, `Ping-pong rematch, ${b.name}?`)], [b, L('Du taber stadig.', 'You’ll still lose.')], [a, L('Det var vinden sidst!', 'It was the wind last time!')], [b, L('Vi er indenfor.', 'We’re indoors.')]],
  ({ people: [a, b], waiting }) =>
    waiting && [[a, L(`${waiting.name} har ventet på godkendelse et stykke tid.`, `${waiting.name} has been waiting for approval a while.`)], [b, L('Mennesker. De er så langsomme.', 'Humans. They’re so slow.')], [a, L('Sig det ikke højt. De læser med.', 'Don’t say it out loud. They’re reading.')]],
  ({ people: [a, b], onFloor, all }) => {
    const game = store.state.game
    const price = game?.next?.desk
    const f = all.find(p => onFloor.has(p.id))
    return f && typeof price === 'number' && (game?.kroner ?? 0) >= price && [[a, L(`Vi har ${kr(game.kroner)}. Hvorfor sidder ${f.name} stadig på gulvet?`, `We have ${kr(game.kroner)}. Why is ${f.name} still on the floor?`)], [b, L('Claude sparer op til en bordtennisbat.', 'Claude’s saving up for a ping-pong bat.')]]
  },
  ({ people: [a, b] }) => owns('meeting') && [[a, voice(a, { kæk: L('Skal vi virkelig til møde igen?', 'Another meeting? Really?'), tør: L('Møde om lidt.', 'Meeting soon.'), dramatisk: L('Ikke ET møde til!', 'Not ANOTHER meeting!'), positiv: L('Jeg glæder mig til mødet!', 'I’m looking forward to the meeting!') })], [b, voice(b, { kæk: L('Ja. Mødet om mødet.', 'Yes. The meeting about the meeting.'), tør: L('Ja.', 'Yes.'), dramatisk: L('Det bliver vores sidste.', 'It will be our last.'), positiv: L('Det bliver hyggeligt.', 'It’ll be nice.') })]],
  ({ people: [a, b] }) => [
    [a, voice(a, { kæk: L('Kaffen er bedre i dag.', 'The coffee’s better today.'), tør: L('Kaffe.', 'Coffee.'), dramatisk: L('Denne kaffe redder mit liv!', 'This coffee is saving my life!'), positiv: L('Mmm, dejlig kaffe i dag!', 'Mmm, lovely coffee today!') })],
    [b, voice(b, { kæk: L('Det er den samme kaffe.', 'It’s the same coffee.'), tør: L('Den samme som i går.', 'Same as yesterday.'), dramatisk: L('Den smager af nederlag.', 'It tastes of defeat.'), positiv: L('Ja, den er rigtig god!', 'Yes, it’s really good!') })],
    [a, L('Så er det mig, der er bedre i dag.', 'Then it’s me who’s better today.')],
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
