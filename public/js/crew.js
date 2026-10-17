// ── The regulars ─────────────────────────────────────────────────────────
// Your own agents (the ones /agents lists) are in the office all day. Here
// the page gives one a name of its own, and takes it off the staff or on
// again; the server keeps it in crew.json, and the mod seats who is on.
import { store } from './store.js'

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
