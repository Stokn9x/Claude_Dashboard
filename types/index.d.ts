export type Mode = 'none' | 'join' | 'new' | 'name' | 'code'

export type Screen = {
  phase: 'setup' | 'office'
  error: string | null
  isBusy: boolean
  mode: Mode
}

export type AgentState = 'working' | 'reading' | 'editing' | 'running' | 'browsing' | 'waiting' | 'idle'

export type Office = { id: string; name: string; invite_code: string; members: number }

export type Agent = {
  id: string
  parent_id: string | null
  project: string
  state: AgentState
  detail: string
  model: string
  tokens_out: number
  cost_usd: number | null
  lines_added: number
  lines_removed: number
  five_hour: number | null
  seven_day: number | null
  started_at: string
  updated_at: string
}

export type Person = { user_id: string; name: string; agents: Agent[] }

export type Floor = {
  me: string | null
  name: string | null
  offices: Office[]
  officeId: string | null
  people: Person[]
}

export type Activity = { state: AgentState; detail: string }

// What this session reports about itself and its subagents.
export type Mine = {
  sessionId: string | null
  project: string
  main: Activity
  subs: Record<string, Activity>
  model: string
  tokensOut: number
  costUsd: number | null
  linesAdded: number
  linesRemoved: number
  fiveHour: number | null
  sevenDay: number | null
}

declare module 'claude-code' {
  interface PluginState {
    'agent-kontor': {
      screen: Screen
      floor: Floor
      mine: Mine
    }
  }
}
