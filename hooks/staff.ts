import { atom, update } from 'claude-code'
import type { Sub } from '../types'
import { emptyOffice, readOffice, slashed } from './office'
import type { $ } from './office'

// The session's office in $.state: the engine wants the reference spelled
// out in every file that reads or writes it, so each file makes its own.
const office = atom({ plugin: 'agent-kontor', key: 'office' } as const, emptyOffice)

// The regulars: your own agents, the ones /agents lists (a project's, your
// own, an organisation's or a plugin's), are in the office all day instead of
// coming and going. This file finds them and reads which of them were taken
// off the staff on the office page; helpers.ts seats them and gives them work.

// How often the list of agents is looked at again: one made with /agents
// mid-session turns up at work within a minute.
export const AGENTS_MS = 60_000

// Whether a helper is the one an agent loop's events are about: a helper by
// its own id, a regular by the loop it works for (or did last, so an answer
// that comes after the hand-over still finds it).
export const isOf = (s: Sub, id: string | undefined) => !!id && (s.id === id || s.job === id)

// Whether a helper is at work: a regular between jobs is only at its desk.
export const isAtWork = (s: Sub) => !s.staff || !!s.isOnJob

// The agent types the Agent tool tells the model about, built-in ones left
// out: what /agents lists. Should the engine not say, the agent files in the
// project's and your own .claude/agents.
const NAME = /^name:\s*["']?([\w.:-]+)/m
async function agentFiles($: $) {
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
  const dirs = ['.claude/agents', ...(home ? [`${slashed(home)}/.claude/agents`] : [])]
  const found: string[] = []
  for (const dir of dirs) {
    const entries = await $.fs.list(dir).catch(() => [])
    for (const entry of entries) {
      if (entry.kind !== 'file' || !entry.name.endsWith('.md')) continue
      const text = await $.fs.read(`${dir}/${entry.name}`).catch(() => '')
      const name = typeof text === 'string' ? NAME.exec(text.split(/^---\s*$/m)[1] ?? '')?.[1] : undefined
      if (name) found.push(name)
    }
  }
  return found
}

export async function findAgents($: $) {
  let agents: string[] = []
  try {
    const usage = await $.session.usage({ breakdown: 'summary' })
    agents = (usage.context.breakdown?.agents ?? []).map(a => a.agentType).filter(Boolean)
  } catch {
    // An engine that cannot break the context down: the files below.
  }
  if (agents.length === 0) agents = await agentFiles($)
  agents = [...new Set(agents)].sort((a, b) => a.localeCompare(b))
  const o = await readOffice($)
  if (JSON.stringify(agents) !== JSON.stringify(o.agents)) await update($, office, x => ({ ...x, agents }))
}

// A plugin's agent: `<plugin>:<name>`. Your own have no colon in their name.
export const isPluginAgent = (agent: string) => agent.includes(':')

// Which regulars were taken off the staff on the office page, and which
// plugins' agents were put on it. The server keeps it in a small file of its
// own, so it is read here even while no page is open.
const strings = (x: unknown) => (Array.isArray(x) ? x.filter((y): y is string => typeof y === 'string') : [])
export async function readCrew($: $) {
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
  if (!home) return
  const text = await $.fs.read(`${slashed(home)}/.claude/agent-kontor/crew.json`).catch(() => null)
  let removed: string[] = []
  let added: string[] = []
  if (typeof text === 'string') {
    try {
      const crew = JSON.parse(text) as { removed?: unknown; added?: unknown }
      removed = strings(crew.removed)
      added = strings(crew.added)
    } catch {
      return
    }
  }
  const o = await readOffice($)
  if (JSON.stringify([removed, added]) !== JSON.stringify([o.removed, o.added])) await update($, office, x => ({ ...x, removed, added }))
}
