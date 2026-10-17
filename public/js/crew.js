// ── The regulars ─────────────────────────────────────────────────────────
// Your own agents (the ones /agents lists) are in the office all day. Here
// the page gives one a name of its own, and takes it off the staff or on
// again; the server keeps it in crew.json, and the mod seats who is on.
import { store } from './store.js'

export const crewOf = () => store.state.game?.crew ?? { names: {}, removed: [] }

// Every agent a session here can call on, and those taken off, in name order.
export const knownAgents = () =>
  [...new Set([...(store.state.sessions ?? []).flatMap(s => s.agents ?? []), ...crewOf().removed])].sort((a, b) => a.localeCompare(b))

// An agent's own name, without its plugin.
export const ownName = agent => agent.split(':').pop() || agent

// What the office calls a regular: the name it was given, or its own.
export const shownName = agent => crewOf().names[agent] ?? ownName(agent)

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
