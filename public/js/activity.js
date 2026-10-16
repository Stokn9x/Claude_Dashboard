// What happened between two states from the server, as short lines for the
// activity log: who came in, who handed over or got stuck, green or red
// tests, commits, someone waiting for you, purchases and achievements. No
// DOM here, so it can be tested without a browser.
import { ITEMS } from './plan.js'
import { kr } from './util.js'

const isAtWork = sub => sub.phase === 'arriving' || sub.phase === 'working'
// A turn at least this long, finished, is news
export const DONE_AFTER_MS = 2 * 60_000

// One event: when, what kind (for its icon), the line, and which project.
const event = (at, kind, text, project = '') => ({ at, kind, text, project })

const sessionEvents = (before, after, now) => {
  const events = []
  const project = after.project ?? ''
  if (!before) return [event(now, 'session', `Ny session: ${project || 'Kontoret'}`, project)]
  const was = new Map((before.subs ?? []).map(sub => [sub.id, sub]))
  for (const sub of after.subs ?? []) {
    const old = was.get(sub.id)
    if (!old && isAtWork(sub)) events.push(event(now, 'arrive', `${sub.name} kom ind: ${sub.task}`, project))
    else if (old?.phase === 'idle' && isAtWork(sub)) events.push(event(now, 'back', `${sub.name} er tilbage på arbejde`, project))
    else if (old?.phase === 'idle' && sub.phase === 'leaving') events.push(event(now, 'home', `${sub.name} gik hjem`, project))
    else if (old && isAtWork(old) && sub.phase === 'delivering') {
      events.push(sub.outcome === 'failed' ? event(now, 'stuck', `${sub.name} gik i stå: ${sub.task}`, project) : event(now, 'deliver', `${sub.name} afleverede: ${sub.task}`, project))
    }
  }
  if (after.party && after.party.at !== before.party?.at) {
    const who = (after.subs ?? []).find(sub => sub.id === after.party.who)
    events.push(event(now, after.party.kind, who ? `${who.name}: ${after.party.label}` : after.party.label, project))
  }
  if (after.main?.state === 'waiting' && before.main?.state !== 'waiting') events.push(event(now, 'waiting', `Claude venter på dig: ${after.main.detail.replace(/^Venter på dig:\s*/, '')}`, project))
  // A long turn that ended on its own: worth telling you about.
  const turn = after.turn
  if (turn && turn.endedAt !== before.turn?.endedAt && !turn.isAborted && turn.ms >= DONE_AFTER_MS) {
    events.push(event(now, 'done', `Claude er færdig efter ${Math.round(turn.ms / 60_000)} min`, project))
  }
  return events
}

const gameEvents = (before, after, now) => {
  if (!before || !after) return []
  const events = []
  const lastBought = Math.max(0, ...(before.bought ?? []).map(b => b.at))
  for (const b of after.bought ?? []) {
    if (b.at > lastBought) events.push(event(now, 'bought', `Købt: ${ITEMS[b.item]?.name ?? b.item} for ${kr(b.price)}`))
  }
  if (after.streak?.isToday && after.streak.at !== before.streak?.at) {
    events.push(event(now, 'bonus', `Dagens bonus: +${kr(after.streak.bonus)}${after.streak.count > 1 ? ` (${after.streak.count} dage i træk)` : ''}`))
  }
  const had = new Set((before.achievements ?? []).filter(a => a.at).map(a => a.id))
  for (const a of after.achievements ?? []) {
    if (a.at && !had.has(a.id)) events.push(event(now, 'achievement', `Præstation: ${a.name} (+${kr(a.reward)})`))
  }
  return events
}

// The events between the state the page had and the one that came. The
// first state after a load tells nothing new: what is there already happened.
export const eventsBetween = (before, after, now = Date.now()) => {
  if (!before?.game && !(before?.sessions ?? []).length) return []
  const was = new Map((before.sessions ?? []).map(s => [s.key, s]))
  return [...(after.sessions ?? []).flatMap(s => sessionEvents(was.get(s.key), s, now)), ...gameEvents(before.game, after.game, now)]
}
