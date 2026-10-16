import { atom, update } from 'claude-code'
import type { Earned, Party } from '../types'
import { emptyOffice, quietly, slashed } from './office'
import type { $ } from './office'

// The session's office in $.state: the engine wants the reference spelled
// out in every file that reads or writes it, so each file makes its own.
const office = atom({ plugin: 'agent-kontor', key: 'office' } as const, emptyOffice)

// What the work earns: lines from Edit and Write and from commits, tests,
// commits and pull requests recognised by the command, each by its rules.
// The server turns the counts into kroner.

// One edit counts at most this many lines, so a generated file of ten
// thousand lines does not buy the whole office; green tests count once in
// this long.
export const LINES_PER_EDIT = 100
export const TESTS_EVERY_MS = 10 * 60_000

export const earn = (earned: Earned | undefined, more: Partial<Earned>): Earned => {
  const now = { ...emptyOffice.earned, ...(earned ?? {}) }
  for (const [k, v] of Object.entries(more) as [keyof Earned, number][]) now[k] += v
  return now
}

// Tests, commits and pull requests, recognised by the command that ran them.
export const TESTS = /\b(npm|pnpm|yarn|bun)\s+(run\s+)?test\b|\bnpx\s+(jest|vitest|playwright)\b|\b(pytest|jest|vitest)\b|\b(cargo|go|dotnet)\s+test\b|\bplugin\s+test\b|\bnode\s+--test\b|\bdeno\s+test\b/
// `git commit`, also with git's own options first (`git -C ../x commit`).
export const COMMIT = /\bgit(?:\s+-[cC]\s+(?:"[^"]*"|\S+))*\s+commit\b/
export const PULL = /\bgh\s+pr\s+create\b/
export const PARTY_MS = 5000

// A command with its quoted text blanked out (the same length, so a place in
// it is a place in the command): a commit message such as "Fix jest config"
// names no test run, and a quoted path no commit.
export const QUOTED = /"(?:[^"\\]|\\.)*"|'[^']*'/g
export const unquoted = (command: string) => command.replace(QUOTED, q => `"${' '.repeat(q.length - 2)}"`)

// What a command did, in the order it is celebrated: tests first, then a
// commit, then a pull request, so `npm test && git commit` pays for both. A
// command that failed only rains on its tests.
export const partiesFor = (command: string, isOk: boolean): Pick<Party, 'kind' | 'label'>[] => {
  const bare = unquoted(command)
  const parties: Pick<Party, 'kind' | 'label'>[] = []
  if (TESTS.test(bare)) parties.push(isOk ? { kind: 'confetti', label: 'Testene er grønne' } : { kind: 'rain', label: 'Testene fejler' })
  if (!isOk) return parties
  if (COMMIT.test(bare)) parties.push({ kind: 'balloons', label: 'Committet' })
  if (PULL.test(bare)) parties.push({ kind: 'balloons', label: 'Pull request åbnet' })
  return parties
}

// A commit earns the lines in it that Edit and Write did not count: made
// by a script, a formatter, sed. At most this many each way per commit, so
// committing a generated file does not buy the office. Edits the commit left
// out (a partial commit) stay counted for the next one.
export const COMMIT_LINES_MAX = 400

// Where a commit ran: the last change of folder before `git commit` in the
// command (`cd`, `pushd`, PowerShell's `Set-Location`), and git's own `-C`.
// Undefined for the session's own folder. Git Bash's /c/… is the engine's C:/….
export const PATH = String.raw`(?:"([^"]+)"|'([^']+)'|([^\s;&|]+))`
export const CHANGE_DIR = new RegExp(String.raw`(?:^|&&|\|\||;|\n)\s*(?:cd|chdir|pushd|Set-Location|sl|Push-Location)\s+(?:/d\s+)?(?:-(?:Literal)?Path\s+)?${PATH}`, 'gi')
export const GIT_DIR = new RegExp(String.raw`\bgit(?:\s+-c\s+\S+)*\s+-C\s+${PATH}(?:\s+-[cC]\s+\S+)*\s+commit\b`)
export const pathOf = (m: RegExpExecArray | null) => {
  const dir = m ? (m[1] ?? m[2] ?? m[3]) : undefined
  return dir ? slashed(dir).replace(/^\/([a-z])\//i, '$1:/') : undefined
}
export const commandDir = (command: string) => {
  const at = unquoted(command).search(COMMIT)
  const before = at < 0 ? command : command.slice(0, at)
  return [...before.matchAll(CHANGE_DIR)].map(m => pathOf(m)).at(-1)
}
export const gitDir = (command: string) => pathOf(GIT_DIR.exec(command))

// Added and removed lines in the commit just made, from git itself. An
// amended commit counts only what the amend changed.
export async function commitLines($: $, command: string) {
  const cwd = commandDir(command)
  const repo = gitDir(command)
  const what = /--amend\b/.test(unquoted(command)) ? ['diff', '--numstat', 'HEAD@{1}', 'HEAD'] : ['show', '--numstat', '--format=', 'HEAD']
  const run = await $.process.run(['git', ...(repo ? ['-C', repo] : []), ...what], { timeoutMs: 10_000, ...(cwd ? { cwd } : {}) }).catch(() => null)
  if (!run || run.exitCode !== 0) return null
  let added = 0
  let removed = 0
  for (const line of run.stdout.split('\n')) {
    const [a, r] = line.split('\t')
    // Binary files say "-": they hold no lines.
    if (/^\d+$/.test(a ?? '') && /^\d+$/.test(r ?? '')) {
      added += Number(a)
      removed += Number(r)
    }
  }
  return { added, removed }
}

export async function creditCommit($: $, command: string) {
  const lines = await commitLines($, command)
  if (!lines) return
  await update($, office, o => {
    const before = o.editedSinceCommit ?? { added: 0, removed: 0 }
    const added = Math.min(COMMIT_LINES_MAX, Math.max(0, lines.added - before.added))
    const removed = Math.min(COMMIT_LINES_MAX, Math.max(0, lines.removed - before.removed))
    const left = { added: Math.max(0, before.added - lines.added), removed: Math.max(0, before.removed - lines.removed) }
    return { ...o, linesAdded: o.linesAdded + added, linesRemoved: o.linesRemoved + removed, earned: earn(o.earned, { added, removed }), editedSinceCommit: left }
  })
}

export async function celebrate($: $, who: string, party: Pick<Party, 'kind' | 'label'>) {
  const at = await $.clock.now()
  await update($, office, o => {
    const isGreen = party.kind === 'confetti'
    const isTestPaid = isGreen && at - (o.lastTestAt ?? 0) >= TESTS_EVERY_MS
    const earned =
      party.label === 'Pull request åbnet' ? earn(o.earned, { prs: 1 })
      : party.label === 'Committet' ? earn(o.earned, { commits: 1 })
      : isTestPaid ? earn(o.earned, { tests: 1 })
      : o.earned
    return { ...o, party: { ...party, who, at }, earned, lastTestAt: isTestPaid ? at : o.lastTestAt }
  })
  $.clock.after(PARTY_MS, () => void quietly(update($, office, o => (o.party?.at === at ? { ...o, party: null } : o))))
}

export type Patch = { lines: string[] }[]
export const countPatch = (patch: Patch | undefined) => {
  let added = 0
  let removed = 0
  for (const hunk of patch ?? []) {
    for (const line of hunk.lines) {
      if (line.startsWith('+')) added += 1
      else if (line.startsWith('-')) removed += 1
    }
  }
  return { added, removed }
}
export const countLines = (text: string) => (text ? text.replace(/\n$/, '').split('\n').length : 0)
