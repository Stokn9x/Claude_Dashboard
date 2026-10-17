import { atom, read } from 'claude-code'
import type { EngineInterface } from 'claude-code'
import type { Activity, Office } from '../types'

// The office as this session keeps it: the walks, the activities everyone
// starts from, the state in `$.state`, and two small helpers every part
// uses.

// How long each walk may take: the page knows the floor plan, walks at one
// pace and fits every walk inside these times, briskly if it is long; this
// module only knows when each walk is over. The status file carries these,
// so the two always agree. The longest walks in a full-grown office fit.
// `idle` is how long a helper stays after handing over, off work, before it
// goes home; called on again in that time, it goes back to work.
export const WALKS = { arrive: 12_000, deliver: 8000, handover: 2600, leave: 9000, idle: 3 * 60_000 }

export const thinking: Activity = { state: 'working', detail: 'Tænker' }
export const pause: Activity = { state: 'idle', detail: 'Holder pause' }
export const offWork: Activity = { state: 'idle', detail: 'Holder fri' }
// A regular between jobs, at its desk (the page's pill says "Ledig").
export const ready: Activity = { state: 'idle', detail: 'Klar til en opgave' }

export const emptyOffice: Office = {
  sessionKey: '',
  party: null,
  others: [],
  project: '',
  startedAt: 0,
  main: pause,
  subs: [],
  model: '',
  tokensOut: 0,
  costUsd: null,
  linesAdded: 0,
  linesRemoved: 0,
  fiveHour: null,
  isOfficeOpen: false,
  tools: 0,
  recent: [],
  earned: { added: 0, removed: 0, delivered: 0, tests: 0, commits: 0, prs: 0 },
  lastTestAt: 0,
  editedSinceCommit: { added: 0, removed: 0 },
  game: null,
  lastTurn: null,
  context: null,
  agents: [],
  removed: [],
  added: [],
  agentSources: {},
}
const office = atom({ plugin: 'agent-kontor', key: 'office' } as const, emptyOffice)

// State outlives a reload of the plugin: an office saved by an older version
// lacks the newer fields. Read it through this, never as it lies.
export const fresh = (o: Partial<Office> | null | undefined): Office => ({ ...emptyOffice, ...(o ?? {}) })
export async function readOffice($: EngineInterface) {
  return fresh(await read($, office))
}

export type $ = EngineInterface

// The office must never get in Claude's way: anything that fails here is dropped.
export const quietly = <T,>(work: Promise<T>) => work.then(() => undefined, () => undefined)

// Forward slashes only: the engine does not read a Windows path's backslashes
// as separators.
export const slashed = (path: string) => path.split(String.fromCharCode(92)).join('/')
