import { atom, update } from 'claude-code'
import type { GameSummary, Office, Other } from '../types'
import { emptyOffice, WALKS, readOffice, slashed, T } from './office'
import type { $ } from './office'

// The session's office in $.state: the engine wants the reference spelled
// out in every file that reads or writes it, so each file makes its own.
const office = atom({ plugin: 'agent-kontor', key: 'office' } as const, emptyOffice)

// The office outside this session: the status file it writes for the
// server and the page, the other sessions' files, the game as the server
// tells it, and starting, replacing and keeping the server.

// Each session writes what it is doing to a small file, and reads the others'
// for the panel's list. The server reads them all for the page.
export const PORT = 4747
export const ADDRESS = `http://127.0.0.1:${PORT}`
export const WRITE_MS = 500
export const HEARTBEAT_MS = 30_000
export const READ_MS = 3000
export const SERVER_CHECK_MS = 60_000
export const NO_SERVER = 'Kontorets server kunne ikke starte. Prøv igen om lidt; bliver det ved, så sig det til den, der har sat kontoret op.'
export const NO_SERVER_EN = "The office's server could not start. Try again in a moment; if it keeps happening, tell whoever set the office up."
export const STALE_MS = 120_000
export let lastWritten = ''
export let lastWriteAt = 0


export async function sessionsDir($: $) {
  const home = (await $.env.get("USERPROFILE")) ?? (await $.env.get("HOME"))
  return home ? `${slashed(home)}/.claude/agent-kontor/sessions` : null
}

// All the page needs to draw this session; the walks it times itself.
export const statusOf = (o: Office) => ({
  v: 2,
  key: o.sessionKey,
  project: o.project,
  startedAt: o.startedAt,
  main: o.main,
  subs: o.subs,
  party: o.party,
  stats: { linesAdded: o.linesAdded, linesRemoved: o.linesRemoved, costUsd: o.costUsd, fiveHour: o.fiveHour, context: o.context, model: o.model, tools: o.tools, recent: o.recent },
  turn: o.lastTurn,
  earned: o.earned,
  walks: WALKS,
  // Your own agents, for the page's list of regulars.
  agents: o.agents ?? [],
  agentSources: o.agentSources ?? {},
})

// Written when it changes, and now and then besides so the server knows the
// session is still there.
export async function writeStatus($: $) {
  const dir = await sessionsDir($)
  const o = await readOffice($)
  if (!dir || !o.sessionKey) return
  const now = await $.clock.now()
  const status = statusOf(o)
  const text = JSON.stringify(status)
  if (text === lastWritten && now - lastWriteAt < HEARTBEAT_MS) return
  await $.fs.write(`${dir}/${o.sessionKey}.json`, JSON.stringify({ ...status, updatedAt: now }))
  lastWritten = text
  lastWriteAt = now
}

export async function readOthers($: $) {
  const dir = await sessionsDir($)
  const o = await readOffice($)
  if (!dir || !o.sessionKey) return
  const now = await $.clock.now()
  const entries = await $.fs.list(dir).catch(() => [])
  const others: Other[] = []
  for (const entry of entries) {
    if (!entry.name.endsWith('.json') || entry.name === `${o.sessionKey}.json`) continue
    const text = await $.fs.read(`${dir}/${entry.name}`).catch(() => '')
    try {
      const other = JSON.parse(typeof text === 'string' ? text : '') as Partial<Other> & { ended?: boolean; subs?: { staff?: string; isOnJob?: boolean }[] }
      if (!other.ended && other.key && other.main?.state && now - (other.updatedAt ?? 0) < STALE_MS) {
        others.push({ key: other.key, project: other.project ?? '', main: other.main, helpers: other.subs?.filter(x => !x.staff || x.isOnJob).length ?? other.helpers ?? 0, updatedAt: other.updatedAt ?? 0 })
      }
    } catch {
      // A file half-written by another session: next round.
    }
  }
  others.sort((a, b) => a.key.localeCompare(b.key))
  const shown = (list: Other[]) => JSON.stringify(list.map(x => [x.key, x.project, x.main, x.helpers]))
  if (shown(others) !== shown(o.others)) await update($, office, x => ({ ...x, others }))
}

// The game as the server tells it, for the panel: saldo, wellbeing, streak,
// achievements. Only once the office is open, when its server runs.
export async function readGame($: $) {
  const o = await readOffice($)
  if (!o.isOfficeOpen) return
  let game: GameSummary | null = null
  try {
    const res = await $.http.fetch(`${ADDRESS}/api/state`)
    const g = (JSON.parse(res.text) as { game?: { kroner?: number; wellbeing?: { score?: number }; streak?: { count?: number }; achievements?: { at: number | null }[] } }).game
    if (g && typeof g.kroner === 'number') {
      game = { kroner: g.kroner, wellbeing: g.wellbeing?.score ?? 0, streak: g.streak?.count ?? 0, unlocked: (g.achievements ?? []).filter(a => a.at).length, achievements: (g.achievements ?? []).length }
    }
  } catch {
    return
  }
  if (JSON.stringify(game) !== JSON.stringify(o.game)) await update($, office, x => ({ ...x, game }))
}

export async function leaveOffice($: $) {
  const dir = await sessionsDir($)
  const o = await readOffice($)
  // The last counts go with it, so the server credits what was earned since
  // it last looked before it lets the file go.
  if (dir && o.sessionKey) await $.fs.write(`${dir}/${o.sessionKey}.json`, JSON.stringify({ key: o.sessionKey, ended: true, earned: o.earned, updatedAt: 0 }))
}

// One server for every session on the computer: the first "Åbn kontor" to
// find none starts it, in the background, and it stops by itself when nobody
// needs it.
export let starting: Promise<boolean> | null = null
export function ensureServer($: $) {
  starting ??= startServer($).finally(() => {
    starting = null
  })
  return starting
}

// Which version of the server answers, or null when none does.
export async function runningVersion($: $) {
  try {
    const res = await $.http.fetch(`${ADDRESS}/health`)
    const health = JSON.parse(res.text) as { app?: string; version?: string }
    return res.ok && health.app === 'agent-kontor' ? (health.version ?? '') : null
  } catch {
    return null
  }
}
export async function isServerUp($: $) {
  return (await runningVersion($)) !== null
}

// This mod's own version, from its plugin.json.
export let ownVersion: string | null = null
export async function myVersion($: $) {
  if (ownVersion === null) {
    try {
      const text = await $.fs.read(`${slashed($.plugin.root)}/.claude-plugin/plugin.json`)
      ownVersion = (JSON.parse(String(text)) as { version?: string }).version ?? ''
    } catch {
      ownVersion = ''
    }
  }
  return ownVersion
}

// 0.13.1 is older than 0.14.0; anything that is not a version is never older.
export const isOlder = (a: string, b: string) => {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  if (!a || !b || [...pa, ...pb].some(Number.isNaN)) return false
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) < (pb[i] ?? 0)
  }
  return false
}

// A server from before an update keeps its old code in memory. It is asked
// to step down, with the token that only the office's own pages and the
// processes on this computer can read, and the new one takes its place.
export async function waitUntilGone($: $) {
  for (let i = 0; i < 10 && (await runningVersion($)) !== null; i++) await new Promise<void>(done => $.clock.after(200, done))
}

// A server from before 0.13.1 has no /api/quit and would stay. It is stopped
// by its process instead: the one listening on the office's port, and only
// if its command line is this server's script.
export async function stopByPort($: $) {
  const isWindows = (await $.env.get('OS')) === 'Windows_NT'
  const argv = isWindows
    ? [
        'powershell.exe',
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `$p = (Get-NetTCPConnection -LocalPort ${PORT} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess; if ($p) { $c = (Get-CimInstance Win32_Process -Filter "ProcessId=$p").CommandLine; if ($c -match 'server[\\\\/]server\\.mjs') { Stop-Process -Id $p -Force } }`,
      ]
    : ['sh', '-c', `for p in $(lsof -ti tcp:${PORT} -sTCP:LISTEN); do ps -o command= -p "$p" | grep -q 'server/server.mjs' && kill "$p"; done`]
  await $.process.run(argv, { timeoutMs: 10_000 }).catch(() => null)
}

export async function retireOldServer($: $) {
  try {
    const state = await $.http.fetch(`${ADDRESS}/api/state`)
    const { token } = JSON.parse(state.text) as { token?: string }
    if (token) await $.http.fetch(`${ADDRESS}/api/quit`, { method: 'POST', headers: { 'x-kontor-token': token } })
  } catch {
    // Already gone, going, or too old to know /api/quit.
  }
  await waitUntilGone($)
  if ((await runningVersion($)) === null) return
  await stopByPort($)
  await waitUntilGone($)
}

// Why the office could not open, in words for the person: Node.js missing,
// too old, or the server would not start for some other reason.
const NODE_MIN = 18
export async function whyNoServer($: $) {
  const o = await readOffice($)
  const run = await $.process.run(['node', '--version'], { timeoutMs: 10_000 }).catch(() => null)
  if (!run || run.exitCode !== 0) {
    return T(
      o,
      'Kontoret kræver Node.js 18 eller nyere, og det er ikke installeret på denne computer. Hent LTS-versionen på https://nodejs.org, og start Claude igen bagefter.',
      'The office needs Node.js 18 or newer, and it is not installed on this computer. Get the LTS version at https://nodejs.org, then start Claude again.',
    )
  }
  const major = Number(/^v?(\d+)/.exec(run.stdout.trim())?.[1])
  if (major && major < NODE_MIN) {
    return T(
      o,
      `Kontoret kræver Node.js 18 eller nyere, og du har ${run.stdout.trim()}. Hent en nyere version på https://nodejs.org, og start Claude igen bagefter.`,
      `The office needs Node.js 18 or newer, and you have ${run.stdout.trim()}. Get a newer version at https://nodejs.org, then start Claude again.`,
    )
  }
  return T(o, NO_SERVER, NO_SERVER_EN)
}

export async function startServer($: $) {
  const running = await runningVersion($)
  if (running !== null) {
    // Only an older server is replaced: a session still on an older mod
    // must not keep stopping a newer one.
    if (!isOlder(running, await myVersion($))) return true
    await retireOldServer($)
  }
  const run = await $.process.run(['node', `${slashed($.plugin.root)}/server/server.mjs`, '--detach'], { timeoutMs: 10_000 }).catch(() => null)
  if (!run || run.exitCode !== 0) return false
  for (let i = 0; i < 10; i++) {
    if (await isServerUp($)) return true
    await new Promise<void>(done => $.clock.after(200, done))
  }
  return false
}

// Starts the server if it is not running, and opens the office in the
// person's own browser.
export async function openOffice($: $) {
  const isUp = await ensureServer($)
  if (!isUp) return false
  const os = await $.env.get("OS")
  const argv = os === 'Windows_NT' ? ['explorer.exe', ADDRESS] : [(await $.env.get("XDG_CURRENT_DESKTOP")) ? 'xdg-open' : 'open', ADDRESS]
  // explorer.exe answers 1 even when it opened the page.
  await $.process.run(argv, { timeoutMs: 10_000 }).catch(() => null)
  await update($, office, o => ({ ...o, isOfficeOpen: true }))
  return true
}

// Once the office is open, its server is started again if it is gone (it
// stopped while the computer slept, or a crash took it), and the page,
// which keeps trying, reconnects by itself.
export async function keepServer($: $) {
  if ((await readOffice($)).isOfficeOpen) await ensureServer($)
}
