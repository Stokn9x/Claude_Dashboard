import type { Activity } from '../types'
import { thinking } from './office'

// What an agent is doing, in a few Danish words, from the tool it calls:
// "Læser api.ts", "Kører npm test". Never a command's arguments.

export const base = (path: unknown) => (typeof path === 'string' ? (path.split(/[\\/]/).pop() ?? path) : '')
export const host = (url: unknown) => (typeof url === 'string' ? (/^https?:\/\/([^/:?#]+)/i.exec(url)?.[1] ?? 'nettet') : 'nettet')

// The program a shell command runs, never its arguments: `npm test`, `git status`.
// A change of folder first (`cd x && npm test`) is skipped: the work is what
// comes after it.
export const MOVES = /^\s*(cd|chdir|pushd|Set-Location|sl|Push-Location)\b[^;&|\n]*(&&|;|\n)\s*/i
export const program = (command: unknown) => {
  if (typeof command !== 'string') return 'en kommando'
  let rest = command
  while (MOVES.test(rest)) rest = rest.replace(MOVES, '')
  const words = rest.trim().split(/\s+/).filter(w => !w.includes('='))
  const first = base(words[0] ?? '').replace(/\.(exe|cmd|ps1)$/i, '')
  const second = words[1] ?? ''
  return /^[a-z][a-z0-9:-]{1,14}$/.test(second) ? `${first} ${second}` : first || 'en kommando'
}

export const activityFor = (tool: string, args: Record<string, unknown>): Activity => {
  switch (tool) {
    case 'Read':
      return { state: 'reading', detail: `Læser ${base(args.file_path)}` }
    case 'Grep':
      return { state: 'reading', detail: 'Søger i koden' }
    case 'Glob':
      return { state: 'reading', detail: 'Finder filer' }
    case 'Edit':
    case 'Write':
    case 'NotebookEdit':
      return { state: 'editing', detail: `Skriver ${base(args.file_path ?? args.notebook_path)}` }
    case 'Bash':
    case 'PowerShell':
      return { state: 'running', detail: `Kører ${program(args.command)}` }
    case 'WebSearch':
      return { state: 'browsing', detail: 'Søger på nettet' }
    case 'WebFetch':
      return { state: 'browsing', detail: `Læser ${host(args.url)}` }
    case 'Agent':
      return { state: 'working', detail: 'Sender en hjælper afsted' }
    case 'AskUserQuestion':
      return { state: 'waiting', detail: 'Har et spørgsmål til dig' }
    default:
      if (/^mcp__ccd_|^(TodoWrite|ToolSearch|Skill)$/.test(tool)) return thinking
      if (/browser/i.test(tool)) return { state: 'browsing', detail: 'Bruger browseren' }
      return { state: 'working', detail: `Bruger ${tool.startsWith('mcp__') ? (tool.split('__').pop() ?? tool) : tool}` }
  }
}
