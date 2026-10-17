import { atom, update } from 'claude-code'
import type { Activity, AgentState, Phase, Step, Sub } from '../types'
import { emptyOffice, WALKS, pause, offWork, readOffice, quietly, thinking } from './office'
import type { $ } from './office'
import { earn, PARTY_MS, celebrate } from './earnings'

// The session's office in $.state: the engine wants the reference spelled
// out in every file that reads or writes it, so each file makes its own.
const office = atom({ plugin: 'agent-kontor', key: 'office' } as const, emptyOffice)

// The helpers' lives in the office: a name and a seat when they come, what
// they do, the walk to Claude with the result, time off, the walk home; and
// the demo that fills the office.

export const names = ['Freja', 'Oskar', 'Ida', 'Malthe', 'Alma', 'Viggo', 'Clara', 'Emil', 'Karla', 'Storm', 'Lærke', 'Bertil']
export const hashOf = (id: string) => {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h
}

// A helper's place: the lowest number no one else holds. The page turns a
// number into a desk, or into a spot on the floor once the desks run out.
export const freeSeat = (subs: Sub[]) => {
  let seat = 0
  // A helper off work or on its way out holds no place.
  while (subs.some(s => s.seat === seat && s.phase !== 'leaving' && s.phase !== 'idle')) seat++
  return seat
}

export function setMain($: $, activity: Activity) {
  return update($, office, o => (o.main.state === activity.state && o.main.detail === activity.detail ? o : { ...o, main: activity }))
}

// $.state reads one moment per event, so a subagent added earlier in the
// same event is looked up inside update(), which always sees the latest.
export const newSub = (id: string, task: string, activity: Activity, phase: Phase, now: number, subs: Sub[]): Sub => ({
  id,
  name: names[hashOf(id) % names.length] ?? 'Hjælper',
  task,
  seat: freeSeat(subs),
  phase,
  since: now,
  activity,
  startedAt: now,
  tools: 0,
  linesAdded: 0,
  linesRemoved: 0,
  recent: [],
})

export async function setActivity($: $, agentId: string | undefined, activity: Activity) {
  if (!agentId) return setMain($, activity)
  const now = await $.clock.now()
  // A subagent the spawn hook did not see gets a desk now; one that was off
  // work is called on again and goes back to a desk.
  await update($, office, o =>
    o.subs.some(s => s.id === agentId)
      ? {
          ...o,
          subs: o.subs.map(s => {
            if (s.id !== agentId) return s
            if (s.phase === 'arriving' || s.phase === 'working') return { ...s, activity }
            if (s.phase === 'idle') return { ...s, phase: 'arriving' as Phase, since: now, from: 'idle' as const, seat: freeSeat(o.subs.filter(x => x.id !== s.id)), activity, outcome: undefined }
            return s
          }),
        }
      : { ...o, subs: [...o.subs, newSub(agentId, 'Hjælper', activity, 'working', now, o.subs)] },
  )
}

// A tool call, counted and remembered for the details card, on whoever made
// it: a helper by its agent id, or Claude.
export const RECENT = 6
export const remember = (recent: Step[] | undefined, step: Step) => [...(recent ?? []), step].slice(-RECENT)

export async function noteTool($: $, agentId: string | undefined, activity: Activity) {
  const step = { at: await $.clock.now(), detail: activity.detail }
  await update($, office, o =>
    agentId
      ? { ...o, subs: o.subs.map(s => (s.id === agentId ? { ...s, tools: (s.tools ?? 0) + 1, recent: remember(s.recent, step) } : s)) }
      : { ...o, tools: (o.tools ?? 0) + 1, recent: remember(o.recent, step) },
  )
}

// In by the door; tidy() sits it down when its walk is over.
// The spawn's agent type and model come along, for the page to draw.
export async function arrive($: $, id: string, task: string, activity: Activity, kind: { type?: string; model?: string; teammate?: string } = {}) {
  const now = await $.clock.now()
  const extra = { ...(kind.type ? { type: kind.type } : {}), ...(kind.model ? { model: kind.model } : {}), ...(kind.teammate ? { teammate: kind.teammate } : {}) }
  await update($, office, o => (o.subs.some(s => s.id === id) ? o : { ...o, subs: [...o.subs, { ...newSub(id, task, activity, 'arriving', now, o.subs), ...extra }] }))
}

// Done: walk the result over to Claude, hand it over, then out of the door;
// tidy() moves it on. A helper whose loop failed or was stopped walks the
// same way, empty-handed.
export async function deliver($: $, id: string, outcome?: 'failed') {
  const now = await $.clock.now()
  await update($, office, o => ({
    ...o,
    subs: o.subs.map(s => {
      if (s.id !== id || (s.phase !== 'arriving' && s.phase !== 'working')) return s
      const detail = outcome === 'failed' ? `Gik i stå: ${s.task}` : `Afleverer: ${s.task}`
      return { ...s, phase: 'delivering' as Phase, since: now, outcome, activity: { state: 'working' as AgentState, detail } }
    }),
    // A finished task earns; a failed one, the demo's, or a teammate leaving
    // (each task it handed in has earned already) does not.
    earned:
      outcome !== 'failed' && !id.startsWith('demo-') && o.subs.some(s => s.id === id && !s.teammate && (s.phase === 'arriving' || s.phase === 'working'))
        ? earn(o.earned, { delivered: 1 })
        : o.earned,
  }))
}

// A teammate's task done (the team's task list says so): over to Claude with
// it, then back to its desk. It earns as a delivered task.
export async function handIn($: $, teammate: string, subject: string) {
  const now = await $.clock.now()
  await update($, office, o => {
    const sub = o.subs.find(s => s.teammate === teammate && (s.phase === 'arriving' || s.phase === 'working'))
    if (!sub) return o
    const task = subject.trim().slice(0, 100) || sub.task
    return {
      ...o,
      subs: o.subs.map(s => (s === sub ? { ...s, task, phase: 'delivering' as Phase, since: now, isBack: true, outcome: undefined, activity: { state: 'working' as AgentState, detail: `Afleverer: ${task}` } } : s)),
      earned: earn(o.earned, { delivered: 1 }),
    }
  })
}

// A turn begins in a helper's loop (a teammate woken by a message): it starts
// thinking, if the office knows it already; its spawn seats a new one.
export async function wakes($: $, id: string) {
  await update($, office, o => ({ ...o, subs: o.subs.map(s => (s.id === id && (s.phase === 'arriving' || s.phase === 'working') ? { ...s, activity: thinking } : s)) }))
}

// Between its turns a teammate waits at its desk for a message.
const waitingForWord: Activity = { state: 'idle', detail: 'Venter på en besked' }
export async function teammateWaits($: $, id: string) {
  await update($, office, o => ({ ...o, subs: o.subs.map(s => (s.id === id && s.teammate && (s.phase === 'arriving' || s.phase === 'working') ? { ...s, activity: waitingForWord } : s)) }))
}

// Every walk is worked out from when it began, never from a timer, so a
// reload of the mod or a sleeping computer cannot leave anyone stuck: a walk
// that is over is over.
export const TIDY_MS = 500

export const nextPhase = (s: Sub, now: number): Sub | null => {
  const elapsed = now - s.since
  if (s.phase === 'arriving') return elapsed >= WALKS.arrive ? { ...s, phase: 'working', from: undefined } : s
  if (s.phase === 'delivering') {
    const handedOver = WALKS.deliver + WALKS.handover
    if (elapsed < handedOver) return s
    // A teammate that handed in a task walks back to its desk.
    if (s.isBack) return { ...s, phase: 'arriving', since: s.since + handedOver, from: 'handover', isBack: undefined, activity: thinking }
    // A finished helper stays a while off work; one that got stuck goes home.
    return s.outcome === 'failed'
      ? { ...s, phase: 'leaving', since: s.since + handedOver }
      : { ...s, phase: 'idle', since: s.since + handedOver, activity: offWork, from: undefined }
  }
  if (s.phase === 'idle') return elapsed >= WALKS.idle ? { ...s, phase: 'leaving', since: s.since + WALKS.idle, from: 'idle' } : s
  if (s.phase === 'leaving') return elapsed >= WALKS.leave ? null : s
  return s
}

export async function tidy($: $) {
  const now = await $.clock.now()
  await update($, office, o => {
    let subs = o.subs.map(s => nextPhase(s, now)).filter((s): s is Sub => s !== null)
    // Helpers an older version left waiting by the door, without a place.
    for (const waiting of subs.filter(s => s.seat < 0)) {
      const seat = freeSeat(subs)
      subs = subs.map(s => (s.id === waiting.id ? { ...s, seat } : s))
    }
    // A party whose timer a reload lost ends all the same.
    const party = o.party && now - o.party.at > PARTY_MS ? null : o.party
    const isSame = party === o.party && subs.length === o.subs.length && subs.every((s, i) => s === o.subs[i])
    return isSame ? o : { ...o, subs, party }
  })
}

// Some ends raise no event: a subagent that fails (a rate limit, a stall) or
// is stopped. The engine's list of agents says how each loop stands; one that
// has ended goes home, and so does one the list does not have (it drops ended
// loops after a while, a reload forgets the rest, and a workflow's agents and
// the engine's own forks are never on it) once it has been quiet for a minute:
// one that is still making tool calls is still at work.
export const ENDED = new Set(['completed', 'failed', 'killed'])
export const UNLISTED_MS = 60_000

export async function sweepAgents($: $) {
  const o = await readOffice($)
  const desks = o.subs.filter(s => (s.phase === 'arriving' || s.phase === 'working') && !s.id.startsWith('demo-'))
  if (desks.length === 0) return
  const agents = await $.agent.list()
  const now = await $.clock.now()
  for (const s of desks) {
    const agent = agents.find(a => a.id === s.id)
    if (agent && ENDED.has(agent.status)) await deliver($, s.id, agent.status === 'completed' ? undefined : 'failed')
    else if (!agent && now - Math.max(s.since, s.recent?.at(-1)?.at ?? 0) > UNLISTED_MS) await deliver($, s.id)
  }
}

// Six helpers through the whole walk, to see the office full.
export const demoTasks: [string, Activity][] = [
  ['Kortlæg API’et', { state: 'reading', detail: 'Læser api.ts' }],
  ['Skriv tests', { state: 'editing', detail: 'Skriver kontor.test.ts' }],
  ['Kør testsuiten', { state: 'running', detail: 'Kører npm test' }],
  ['Find gammel kode', { state: 'reading', detail: 'Søger i koden' }],
  ['Læs dokumentationen', { state: 'browsing', detail: 'Læser docs.claude.com' }],
  ['Opdatér README', { state: 'editing', detail: 'Skriver README.md' }],
]

// The demo's helpers come in each kind and on each model.
const DEMO_KINDS = [
  { type: 'Explore', model: 'claude-haiku-5-5' },
  { type: 'general-purpose', model: 'claude-sonnet-5-5' },
  { type: 'general-purpose', model: 'claude-opus-5-5' },
  { type: 'Explore', model: 'claude-sonnet-5-5' },
  { type: 'Plan', model: 'claude-opus-5-5' },
  { type: 'general-purpose', model: 'claude-haiku-5-5' },
]

export async function runDemo($: $) {
  await setMain($, { state: 'working', detail: 'Fordeler opgaver' })
  demoTasks.forEach(([task, activity], i) => {
    const id = `demo-${i + 1}`
    $.clock.after(i * 700, () => void quietly(arrive($, id, task, activity, DEMO_KINDS[i % DEMO_KINDS.length])))
    $.clock.after(24_000 + i * 2600, () => void quietly(deliver($, id)))
  })
  $.clock.after(24_000 + demoTasks.length * 2600 + 12_000, () => void quietly(celebrate($, 'main', { kind: 'confetti', label: 'Testene er grønne' })))
  $.clock.after(24_000 + demoTasks.length * 2600 + 18_000, () => void quietly(setMain($, pause)))
}
