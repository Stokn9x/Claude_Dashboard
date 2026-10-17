import { atom, update } from 'claude-code'
import type { AgentSource, Sub } from '../types'
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
  const dirs: [string, AgentSource][] = [['.claude/agents', 'project'], ...(home ? [[`${slashed(home)}/.claude/agents`, 'user'] as [string, AgentSource]] : [])]
  const found: { agentType: string; source: AgentSource }[] = []
  for (const [dir, source] of dirs) {
    const entries = await $.fs.list(dir).catch(() => [])
    for (const entry of entries) {
      if (entry.kind !== 'file' || !entry.name.endsWith('.md')) continue
      const text = await $.fs.read(`${dir}/${entry.name}`).catch(() => '')
      const name = typeof text === 'string' ? NAME.exec(text.split(/^---\s*$/m)[1] ?? '')?.[1] : undefined
      if (name) found.push({ agentType: name, source })
    }
  }
  return found
}

// Where an agent comes from, in the engine's words, as the page says it.
const SOURCES: Record<string, AgentSource> = { userSettings: 'user', projectSettings: 'project', localSettings: 'project', policySettings: 'org', plugin: 'plugin' }
export const sourceOf = (source: string): AgentSource => SOURCES[source] ?? 'other'

export async function findAgents($: $) {
  let listed: { agentType: string; source: AgentSource }[] = []
  try {
    const usage = await $.session.usage({ breakdown: 'summary' })
    listed = (usage.context.breakdown?.agents ?? []).filter(a => a.agentType).map(a => ({ agentType: a.agentType, source: sourceOf(a.source) }))
  } catch {
    // An engine that cannot break the context down: the files below.
  }
  if (listed.length === 0) listed = await agentFiles($)
  const agents = [...new Set(listed.map(a => a.agentType))].sort((a, b) => a.localeCompare(b))
  const agentSources = Object.fromEntries(listed.map(a => [a.agentType, a.source]))
  const o = await readOffice($)
  if (JSON.stringify([agents, agentSources]) !== JSON.stringify([o.agents, o.agentSources])) await update($, office, x => ({ ...x, agents, agentSources }))
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

// The language chosen on the office page, kept by the server beside crew.json.
export async function readPrefs($: $) {
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
  if (!home) return
  const text = await $.fs.read(`${slashed(home)}/.claude/agent-kontor/prefs.json`).catch(() => null)
  let lang: 'da' | 'en' | null = null
  if (typeof text === 'string') {
    try {
      const saved = (JSON.parse(text) as { lang?: unknown }).lang
      lang = saved === 'da' || saved === 'en' ? saved : null
    } catch {
      return
    }
  }
  const o = await readOffice($)
  if (lang !== o.lang) await update($, office, x => ({ ...x, lang }))
}
