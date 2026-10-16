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
  // Set when the helper's loop failed or was stopped instead of finishing.
  outcome?: 'failed'
}

// Another Claude session on this computer, as its own status file says.
export type Other = {
  key: string
  project: string
  main: Activity
  helpers: number
  updatedAt: number
}

// A moment worth marking at someone's desk: green tests, red tests, a commit.
export type Party = {
  kind: 'confetti' | 'rain' | 'balloons'
  who: string
  label: string
  at: number
}

export type Office = {
  sessionKey: string
  party: Party | null
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
  // The office was opened in this session: its server is kept running.
  isOfficeOpen: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'agent-kontor': {
      office: Office
    }
  }
}
