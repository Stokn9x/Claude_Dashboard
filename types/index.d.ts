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
  // Set on a walk that starts where the helper was idling, not at the door,
  // or (a teammate) at Claude's desk after handing in a task.
  from?: 'idle' | 'handover'
  // A teammate handing in a task goes back to its desk afterwards.
  isBack?: boolean
  // For the details card. Absent on helpers an older version seated.
  startedAt?: number
  tools?: number
  linesAdded?: number
  linesRemoved?: number
  recent?: Step[]
  // The agent type it was spawned as (Explore, Plan, general-purpose, …) and
  // the model it runs on, when the spawn said; the page draws them.
  type?: string
  model?: string
  // The start of its final answer, once its loop has finished, for the card.
  answer?: string
  // A teammate of an agent team: its name in the team. It stays at its desk
  // between turns, hands in each task it completes and walks back.
  teammate?: string
  // A regular: one of your own agents (from /agents), by its type. It is in
  // the office all day, at the lowest seats, and takes the jobs of its type:
  // `job` is the agent loop it works for now (or did last), `isOnJob` whether
  // it is at it, `jobAt` when it began. Between jobs it is ready at its desk.
  staff?: string
  job?: string
  isOnJob?: boolean
  jobAt?: number
}

// Claude's last finished turn: when it ended, how long it took, and whether
// it was cut short. The page tells you when a long one is done.
export type LastTurn = { endedAt: number; ms: number; isAborted: boolean }

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
  lastTurn: LastTurn | null
  // How full the context window is, in per cent, as the engine last said.
  context: number | null
  // The agents this session can call on (their types), the ones taken off
  // the staff on the office page, and the plugins' agents put on it (the
  // server's crew.json). A plugin's agent (`<plugin>:<name>`) is not one of
  // your own: it is on the staff only when put on it.
  agents: string[]
  removed: string[]
  added: string[]
}

export type GameSummary = { kroner: number; wellbeing: number; streak: number; unlocked: number; achievements: number }

declare module 'claude-code' {
  interface PluginState {
    'agent-kontor': {
      office: Office
    }
  }
}
