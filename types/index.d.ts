export type AgentState = 'working' | 'reading' | 'editing' | 'running' | 'browsing' | 'waiting' | 'idle'

export type Activity = { state: AgentState; detail: string }

// A subagent's walk through the office: in by the door, at a desk, over to
// the main desk with its result, and out again.
export type Phase = 'arriving' | 'working' | 'delivering' | 'leaving'

export type Sub = {
  id: string
  name: string
  task: string
  seat: number
  phase: Phase
  since: number
  activity: Activity
}

// Another Claude session on this computer, as its own status file says.
export type Other = {
  key: string
  project: string
  main: Activity
  helpers: number
  updatedAt: number
}

export type Office = {
  sessionKey: string
  others: Other[]
  project: string
  startedAt: number
  main: Activity
  subs: Sub[]
  model: string
  tokensOut: number
  costUsd: number | null
  linesAdded: number
  linesRemoved: number
  fiveHour: number | null
}

declare module 'claude-code' {
  interface PluginState {
    'agent-kontor': {
      office: Office
      frame: { office: Office | null; at: number }
    }
  }
}
