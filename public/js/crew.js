// ── The regulars ─────────────────────────────────────────────────────────
// Your own agents (the ones /agents lists) are in the office all day. Here
// the page gives one a name of its own, and takes it off the staff or on
// again; the server keeps it in crew.json, and the mod seats who is on.
import { store } from './store.js'
import { L } from './i18n.js'

export const crewOf = () => ({ names: {}, removed: [], added: [], ...(store.state.game?.crew ?? {}) })

// A plugin's agent (`<plugin>:<name>`) is not one of your own: it is on the
// staff only once put on it. Your own are on it unless taken off.
export const isPluginAgent = agent => agent.includes(':')
export const pluginOf = agent => (isPluginAgent(agent) ? agent.split(':')[0] : null)
export const isOnStaff = agent => (isPluginAgent(agent) ? crewOf().added.includes(agent) : !crewOf().removed.includes(agent))

// Every agent a session here can call on, and those taken off, in name
// order: your own first, then the plugins'.
export const knownAgents = () =>
  [...new Set([...(store.state.sessions ?? []).flatMap(s => s.agents ?? []), ...crewOf().removed, ...crewOf().added])].sort(
    (a, b) => isPluginAgent(a) - isPluginAgent(b) || a.localeCompare(b),
  )

// Where an agent comes from, as the sessions' files say (the engine's
// listing), in words; null when it does not say.
export const originOf = agent => {
  const source = (store.state.sessions ?? []).map(s => s.agentSources?.[agent]).find(Boolean) ?? (isPluginAgent(agent) ? 'plugin' : null)
  if (source === 'plugin') return L(`Fra pluginet ${pluginOf(agent) ?? ''}`, `From the ${pluginOf(agent) ?? ''} plugin`).replace(/\s+/g, ' ').trim()
  return { user: L('Din egen agent', 'Your own agent'), project: L('Fra projektet', 'From the project'), org: L('Fra organisationen', 'From the organisation') }[source] ?? null
}

// An agent's own name, without its plugin.
export const ownName = agent => agent.split(':').pop() || agent

// What the office calls a regular: the name it was given, or its own.
export const shownName = agent => crewOf().names[agent] ?? ownName(agent)

// On the staff or off it: for one of your own, not taken off; for a
// plugin's, put on.
export const setOnStaff = (agent, isOn) => changeCrew(isPluginAgent(agent) ? { agent, isAdded: isOn } : { agent, isRemoved: !isOn })

// The server's answer comes with the next state it sends.
export const changeCrew = async change => {
  if (!store.state.token) return false
  try {
    const res = await fetch('/api/crew', { method: 'POST', headers: { 'content-type': 'application/json', 'x-kontor-token': store.state.token }, body: JSON.stringify(change) })
    return res.ok
  } catch {
    return false
  }
}
