export type AgentState = 'working' | 'reading' | 'editing' | 'running' | 'browsing' | 'waiting' | 'idle'

export type Activity = { state: AgentState; detail: string }

export type Earned = { added: number; removed: number; delivered: number; tests: number; commits: number; prs: number }

// One step someone took, for the details card: "10:42 Læser api.ts".
export type Step = { at: number; detail: string }

// A subagent's walk through the office: in by the door, at a desk, over to
// the main desk with its result, a while off work (idle), and out again.
// Called on again while idle, it goes back to a desk (arriving, from idle).
export type Phase = 'arriving' | 'working' | 'delivering' | 'idle' | 'leaving'

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
  // Set on a walk that starts where the helper was idling, not at the door.
  from?: 'idle'
  // For the details card. Absent on helpers an older version seated.
  startedAt?: number
  tools?: number
  linesAdded?: number
  linesRemoved?: number
  recent?: Step[]
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
  // Claude's own count of tool calls and latest steps, for its details card.
  tools: number
  recent: Step[]
  // What this session has earned, as running counts; the server turns them
  // into kroner. The rules (a cap per edit, a pause between test runs) are
  // applied here, where each event is seen.
  earned: Earned
  lastTestAt: number
  // Lines Edit and Write have counted since the last commit; a commit earns
  // only the lines beyond these (made some other way, a script, say).
  editedSinceCommit: { added: number; removed: number }
  // The game as the server last told it, for the panel. Null until then.
  game: GameSummary | null
}

export type GameSummary = { kroner: number; wellbeing: number; streak: number; unlocked: number; achievements: number }

declare module 'claude-code' {
  interface PluginState {
    'agent-kontor': {
      office: Office
    }
  }
}
