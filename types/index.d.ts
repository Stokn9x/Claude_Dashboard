export type Limit = { kind: string; percentUsed: number; resetsAt: string | null }

export type Usage = {
  startedAt: number
  contextTokens: number | null
  contextWindow: number
  contextPercent: number | null
  limits: Limit[]
  costUsd: number | null
}

export type Stats = {
  turns: number
  tools: Record<string, number>
  tokensIn: number
  tokensOut: number
  cacheRead: number
  cacheWrite: number
  perTurn: number[]
  model: string | null
  linesAdded: number
  linesRemoved: number
  files: string[]
}

declare module 'claude-code' {
  interface PluginState {
    'session-dashboard': {
      usage: Usage | null
      stats: Stats
      isOpen: boolean
      now: number
    }
  }
}
