import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement } from 'claude-code'

import type { Activity, AgentState, Office, Other, Party, Phase, Sub } from '../types'

// A pixel office, seen from above: Claude at the big desk, its subagents at
// the six desks of the team room. This module keeps track of who is where and
// writes it to a status file; a small server on this computer streams every
// session's file to a page that draws and animates the office. Nothing leaves
// the machine.

const PANE = 'kontor'
const SEATS = 6
// Walking pace, in scene units a second, and how long a helper stands at
// Claude's desk with its result.
const SPEED = 90
const HANDOVER_MS = 2600

const thinking: Activity = { state: 'working', detail: 'Tænker' }
const pause: Activity = { state: 'idle', detail: 'Holder pause' }

const emptyOffice: Office = {
  sessionKey: '',
  party: null,
  others: [],
  project: '',
  startedAt: 0,
  main: pause,
  subs: [],
  model: '',
  tokensOut: 0,
  costUsd: null,
  linesAdded: 0,
  linesRemoved: 0,
  fiveHour: null,
  isOfficeOpen: false,
}
const office = atom({ plugin: 'agent-kontor', key: 'office' } as const, emptyOffice)

// State outlives a reload of the plugin: an office saved by an older version
// lacks the newer fields. Read it through this, never as it lies.
const fresh = (o: Partial<Office> | null | undefined): Office => ({ ...emptyOffice, ...(o ?? {}) })
const readOffice = async ($: EngineInterface) => fresh(await read($, office))

type $ = EngineInterface

// ─── What an agent is doing ─────────────────────────────────────────────

const base = (path: unknown) => (typeof path === 'string' ? (path.split(/[\\/]/).pop() ?? path) : '')
const host = (url: unknown) => (typeof url === 'string' ? (/^https?:\/\/([^/:?#]+)/i.exec(url)?.[1] ?? 'nettet') : 'nettet')

// The program a shell command runs, never its arguments: `npm test`, `git status`.
const program = (command: unknown) => {
  if (typeof command !== 'string') return 'en kommando'
  const words = command.trim().split(/\s+/).filter(w => !w.includes('='))
  const first = base(words[0] ?? '').replace(/\.(exe|cmd|ps1)$/i, '')
  const second = words[1] ?? ''
  return /^[a-z][a-z0-9:-]{1,14}$/.test(second) ? `${first} ${second}` : first || 'en kommando'
}

const activityFor = (tool: string, args: Record<string, unknown>): Activity => {
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

// ─── Keeping the office ─────────────────────────────────────────────────

// The office must never get in Claude's way: anything that fails here is dropped.
const quietly = <T,>(work: Promise<T>) => work.then(() => undefined, () => undefined)

const names = ['Freja', 'Oskar', 'Ida', 'Malthe', 'Alma', 'Viggo', 'Clara', 'Emil', 'Karla', 'Storm', 'Lærke', 'Bertil']
const hashOf = (id: string) => {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h
}

const freeSeat = (subs: Sub[]) => {
  for (let seat = 0; seat < SEATS; seat++) {
    if (!subs.some(s => s.seat === seat && s.phase !== 'leaving')) return seat
  }
  return -1
}

const setMain = ($: $, activity: Activity) =>
  update($, office, o => (o.main.state === activity.state && o.main.detail === activity.detail ? o : { ...o, main: activity }))

// $.state reads one moment per event, so a subagent added earlier in the
// same event is looked up inside update(), which always sees the latest.
const newSub = (id: string, task: string, activity: Activity, phase: Phase, now: number, subs: Sub[]): Sub => ({
  id,
  name: names[hashOf(id) % names.length] ?? 'Hjælper',
  task,
  seat: freeSeat(subs),
  phase,
  since: now,
  activity,
})

const setActivity = async ($: $, agentId: string | undefined, activity: Activity) => {
  if (!agentId) return setMain($, activity)
  const now = await $.clock.now()
  // A subagent the spawn hook did not see gets a desk now.
  await update($, office, o =>
    o.subs.some(s => s.id === agentId)
      ? { ...o, subs: o.subs.map(s => (s.id === agentId && (s.phase === 'arriving' || s.phase === 'working') ? { ...s, activity } : s)) }
      : { ...o, subs: [...o.subs, newSub(agentId, 'Hjælper', activity, 'working', now, o.subs)] },
  )
}

const arrive = async ($: $, id: string, task: string, activity: Activity) => {
  const now = await $.clock.now()
  const after = await update($, office, o => (o.subs.some(s => s.id === id) ? o : { ...o, subs: [...o.subs, newSub(id, task, activity, 'arriving', now, o.subs)] }))
  const seat = after.subs.find(s => s.id === id)?.seat ?? -1
  const sitDown = () => void quietly(update($, office, o => ({ ...o, subs: o.subs.map(s => (s.id === id && s.phase === 'arriving' ? { ...s, phase: 'working' as Phase } : s)) })))
  // A helper with no free desk waits by the door; it does not walk.
  if (seat < 0) return sitDown()
  $.clock.after(walkMs(arrivePath(seat)), sitDown)
}

// Done: walk the result over to Claude, hand it over, then out of the door.
// A helper whose loop failed or was stopped walks the same way, empty-handed.
const deliver = async ($: $, id: string, outcome?: 'failed') => {
  const now = await $.clock.now()
  let seat: number | null = null
  await update($, office, o => ({
    ...o,
    subs: o.subs.map(s => {
      if (s.id !== id || (s.phase !== 'arriving' && s.phase !== 'working')) return s
      seat = s.seat
      const detail = outcome === 'failed' ? `Gik i stå: ${s.task}` : `Afleverer: ${s.task}`
      return { ...s, phase: 'delivering' as Phase, since: now, outcome, activity: { state: 'working' as AgentState, detail } }
    }),
  }))
  if (seat === null) return
  const gone = () => void quietly(update($, office, x => ({ ...x, subs: x.subs.filter(s => s.id !== id) })))
  if (seat < 0) {
    $.clock.after(HANDOVER_MS, gone)
    return
  }
  $.clock.after(walkMs(deliverPath(seat)) + HANDOVER_MS, () => {
    void quietly(
      (async () => {
        const later = await $.clock.now()
        await update($, office, o => ({ ...o, subs: o.subs.map(s => (s.id === id ? { ...s, phase: 'leaving' as Phase, since: later } : s)) }))
        $.clock.after(walkMs(leavePath(seat as number)), gone)
      })(),
    )
  })
}

// Some ends raise no event: a subagent that fails (a rate limit, a stall) or
// is stopped. The engine's list of agents says how each loop stands; one that
// has ended goes home, and so does one the list no longer has (it drops ended
// loops after a while, and a reload forgets the rest) once it has had a minute
// to appear there.
const ENDED = new Set(['completed', 'failed', 'killed'])
const UNLISTED_MS = 60_000

const sweepAgents = async ($: $) => {
  const o = await readOffice($)
  const desks = o.subs.filter(s => (s.phase === 'arriving' || s.phase === 'working') && !s.id.startsWith('demo-'))
  if (desks.length === 0) return
  const agents = await $.agent.list()
  const now = await $.clock.now()
  for (const s of desks) {
    const agent = agents.find(a => a.id === s.id)
    if (agent && ENDED.has(agent.status)) await deliver($, s.id, agent.status === 'completed' ? undefined : 'failed')
    else if (!agent && now - s.since > UNLISTED_MS) await deliver($, s.id)
  }
}

// Tests, commits and pull requests, recognised by the command that ran them.
const TESTS = /\b(npm|pnpm|yarn|bun)\s+(run\s+)?test\b|\bnpx\s+(jest|vitest|playwright)\b|\b(pytest|jest|vitest)\b|\b(cargo|go|dotnet)\s+test\b|\bplugin\s+test\b/
const COMMIT = /\bgit\s+commit\b/
const PULL = /\bgh\s+pr\s+create\b/
const PARTY_MS = 5000

const partyFor = (command: string, isOk: boolean): Pick<Party, 'kind' | 'label'> | null => {
  if (TESTS.test(command)) return isOk ? { kind: 'confetti', label: 'Testene er grønne' } : { kind: 'rain', label: 'Testene fejler' }
  if (!isOk) return null
  if (PULL.test(command)) return { kind: 'balloons', label: 'Pull request åbnet' }
  if (COMMIT.test(command)) return { kind: 'balloons', label: 'Committet' }
  return null
}

const celebrate = async ($: $, who: string, party: Pick<Party, 'kind' | 'label'>) => {
  const at = await $.clock.now()
  await update($, office, o => ({ ...o, party: { ...party, who, at } }))
  $.clock.after(PARTY_MS, () => void quietly(update($, office, o => (o.party?.at === at ? { ...o, party: null } : o))))
}

type Patch = { lines: string[] }[]
const countPatch = (patch: Patch | undefined) => {
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
const countLines = (text: string) => (text ? text.replace(/\n$/, '').split('\n').length : 0)

// Six helpers through the whole walk, to see the office full.
const demoTasks: [string, Activity][] = [
  ['Kortlæg API’et', { state: 'reading', detail: 'Læser api.ts' }],
  ['Skriv tests', { state: 'editing', detail: 'Skriver kontor.test.ts' }],
  ['Kør testsuiten', { state: 'running', detail: 'Kører npm test' }],
  ['Find gammel kode', { state: 'reading', detail: 'Søger i koden' }],
  ['Læs dokumentationen', { state: 'browsing', detail: 'Læser docs.claude.com' }],
  ['Opdatér README', { state: 'editing', detail: 'Skriver README.md' }],
]

const runDemo = async ($: $) => {
  await setMain($, { state: 'working', detail: 'Fordeler opgaver' })
  demoTasks.forEach(([task, activity], i) => {
    const id = `demo-${i + 1}`
    $.clock.after(i * 700, () => void quietly(arrive($, id, task, activity)))
    $.clock.after(14_000 + i * 2600, () => void quietly(deliver($, id)))
  })
  $.clock.after(14_000 + demoTasks.length * 2600 + 12_000, () => void quietly(celebrate($, 'main', { kind: 'confetti', label: 'Testene er grønne' })))
  $.clock.after(14_000 + demoTasks.length * 2600 + 18_000, () => void quietly(setMain($, pause)))
}

// ─── Walks ──────────────────────────────────────────────────────────────

// The page draws every walk; the office only needs to know how long each one
// takes, to sit a helper down and see it out of the door. The floor plan is
// public/app.js's, and the two must agree.
type Point = { x: number; y: number }

const seatAt = (seat: number) => ({ cx: 92 + (seat % 3) * 148, dy: 202 + Math.floor(seat / 3) * 102 })
const DOOR = { x: 478, y: 256 }
const handoffFor = (seat: number) => ({ x: 206 + (seat % 3) * 13, y: 96 + Math.floor(seat / 3) * 16 })

const arrivePath = (seat: number): Point[] => {
  const { cx, dy } = seatAt(seat)
  const lane = dy - 52
  return [DOOR, { x: DOOR.x, y: 256 }, { x: cx + 74, y: 256 }, { x: cx + 74, y: lane }, { x: cx, y: lane }, { x: cx, y: dy - 6 }]
}
const deliverPath = (seat: number): Point[] => {
  const { cx, dy } = seatAt(seat)
  const lane = dy - 52
  const spot = handoffFor(seat)
  return [{ x: cx, y: dy - 6 }, { x: cx, y: lane }, { x: cx + 74, y: lane }, { x: cx + 74, y: 148 }, { x: 214, y: 148 }, { x: 214, y: spot.y }, spot]
}
const leavePath = (seat: number): Point[] => {
  const spot = handoffFor(seat)
  return [spot, { x: 214, y: spot.y }, { x: 214, y: 148 }, { x: 446, y: 148 }, { x: 446, y: 256 }, DOOR]
}

const legSeconds = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y) / SPEED
const walkMs = (points: Point[]) => Math.round(points.slice(1).reduce((t, p, i) => t + legSeconds(points[i] as Point, p), 0) * 1000) + 150

// ─── Panel ──────────────────────────────────────────────────────────────

const stateColor: Record<AgentState, string> = {
  working: '#8A94A0',
  reading: '#2BA39A',
  editing: '#3B8FE0',
  running: '#D9932B',
  browsing: '#7B6BDE',
  waiting: '#E5484D',
  idle: '#8A94A0',
}
const phaseText: Record<Phase, string> = {
  arriving: 'På vej ind',
  working: '',
  delivering: 'Afleverer',
  leaving: 'Går igen',
}

// ─── The office server ──────────────────────────────────────────────────

// Each session writes what it is doing to a small file, and reads the others'
// for the panel's list. The server reads them all for the page.
const PORT = 4747
const ADDRESS = `http://127.0.0.1:${PORT}`
const WRITE_MS = 500
const HEARTBEAT_MS = 30_000
const READ_MS = 3000
const SERVER_CHECK_MS = 60_000
const NO_SERVER = 'Kontorets server kunne ikke starte. Den kræver Node.js 18 eller nyere.'
const STALE_MS = 120_000
let lastWritten = ''
let lastWriteAt = 0

// Forward slashes only: the engine does not read a Windows path's backslashes
// as separators.
const slashed = (path: string) => path.split(String.fromCharCode(92)).join('/')

const sessionsDir = async ($: $) => {
  const home = (await $.env.get("USERPROFILE")) ?? (await $.env.get("HOME"))
  return home ? `${slashed(home)}/.claude/agent-kontor/sessions` : null
}

// All the page needs to draw this session; the walks it times itself.
const statusOf = (o: Office) => ({
  v: 2,
  key: o.sessionKey,
  project: o.project,
  startedAt: o.startedAt,
  main: o.main,
  subs: o.subs,
  party: o.party,
  stats: { linesAdded: o.linesAdded, linesRemoved: o.linesRemoved, costUsd: o.costUsd, fiveHour: o.fiveHour, model: o.model },
})

// Written when it changes, and now and then besides so the server knows the
// session is still there.
const writeStatus = async ($: $) => {
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

const readOthers = async ($: $) => {
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
      const other = JSON.parse(typeof text === 'string' ? text : '') as Partial<Other> & { ended?: boolean; subs?: unknown[] }
      if (!other.ended && other.key && other.main?.state && now - (other.updatedAt ?? 0) < STALE_MS) {
        others.push({ key: other.key, project: other.project ?? '', main: other.main, helpers: other.subs?.length ?? other.helpers ?? 0, updatedAt: other.updatedAt ?? 0 })
      }
    } catch {
      // A file half-written by another session: next round.
    }
  }
  others.sort((a, b) => a.key.localeCompare(b.key))
  const shown = (list: Other[]) => JSON.stringify(list.map(x => [x.key, x.project, x.main, x.helpers]))
  if (shown(others) !== shown(o.others)) await update($, office, x => ({ ...x, others }))
}

const leaveOffice = async ($: $) => {
  const dir = await sessionsDir($)
  const o = await readOffice($)
  if (dir && o.sessionKey) await $.fs.write(`${dir}/${o.sessionKey}.json`, JSON.stringify({ key: o.sessionKey, ended: true, updatedAt: 0 }))
}

const isServerUp = async ($: $) => {
  try {
    const res = await $.http.fetch(`${ADDRESS}/health`)
    return res.ok && (JSON.parse(res.text) as { app?: string }).app === 'agent-kontor'
  } catch {
    return false
  }
}

// One server for every session on the computer: the first "Åbn kontor" to
// find none starts it, in the background, and it stops by itself when nobody
// needs it.
let starting: Promise<boolean> | null = null
const ensureServer = ($: $) => {
  starting ??= startServer($).finally(() => {
    starting = null
  })
  return starting
}

const startServer = async ($: $) => {
  if (await isServerUp($)) return true
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
const openOffice = async ($: $) => {
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
const keepServer = async ($: $) => {
  if ((await readOffice($)).isOfficeOpen) await ensureServer($)
}

// ─── Hooks ──────────────────────────────────────────────────────────────

export const register: Register = on => {
  // spawn tool_use_id → the subagent, to see it out when its call ends. A
  // background one's call returns at once, so it waits for SubagentStop.
  const spawned = new Map<string, { agentId: string; isBackground: boolean }>()

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'kontor', description: 'Åbn kontoret i browseren, se det fyldt med /kontor demo, eller listen med /kontor panel', argumentHint: '[demo|panel]' })
    const now = await $.clock.now()
    const key = `s${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}`
    await update($, office, o => ({ ...o, sessionKey: o.sessionKey || key, project: base(e.cwd) || 'Kontoret', startedAt: o.startedAt || now, main: pause, subs: [] }))
    $.clock.every(WRITE_MS, () => void quietly(writeStatus($)))
    $.clock.every(READ_MS, () => void quietly(readOthers($)))
    $.clock.every(READ_MS, () => void quietly(sweepAgents($)))
    $.clock.every(SERVER_CHECK_MS, () => void quietly(keepServer($)))
    return next(e)
  })

  on('command.run', { command: 'kontor' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'panel') {
      await $.ui.open({ id: PANE, title: '🏢 Kontor', focus: true })
      return { text: 'Listen over hvem der laver hvad står i panelet.' }
    }
    const where = (await openOffice($)) ? `Kontoret er åbent i din browser på ${ADDRESS}.` : NO_SERVER
    if (arg === 'demo') {
      await runDemo($)
      return { text: `${where} Seks hjælpere er på vej ind.` }
    }
    return { text: `${where} Prøv /kontor demo for at se det fyldt.` }
  })

  on('session.end', async ($, e, next) => {
    await quietly(leaveOffice($))
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    await quietly(setMain($, thinking))
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId) return result
    const u = e.usage
    if (u) await quietly(update($, office, o => ({ ...o, tokensOut: o.tokensOut + u.output_tokens, model: u.model })))
    await quietly(setMain($, pause))
    return result
  })

  on('session.measure', async ($, e, next) => {
    const five = e.rateLimits.find(l => l.kind === 'five_hour')
    await quietly(update($, office, o => ({ ...o, costUsd: e.cost?.usd ?? o.costUsd, fiveHour: five?.percentUsed ?? o.fiveHour })))
    return next(e)
  })

  // Raised only when a permission dialog is put to the person. A tool check
  // that answers `ask` is not enough: in Auto mode the classifier decides it.
  on('classic.PermissionRequest', async ($, e, next) => {
    const agentId = (e as { agent_id?: string }).agent_id
    await quietly(setActivity($, agentId, { state: 'waiting', detail: 'Venter på din godkendelse' }))
    return next(e)
  })

  // The subagent's own loop has ended: its work is done, whatever its call did.
  on('classic.SubagentStop', async ($, e, next) => {
    await quietly(deliver($, e.agent_id))
    return next(e)
  })

  // (2) No event says "approved"; a denial does, and so does the next step.
  on('classic.PermissionDenied', async ($, e, next) => {
    await quietly(setActivity($, (e as { agent_id?: string }).agent_id, thinking))
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    if ('agentId' in r && r.agentId) {
      spawned.set(e.tool_use_id, { agentId: r.agentId, isBackground: e.background })
      await quietly(arrive($, r.agentId, e.description || 'En opgave', { state: 'working', detail: e.description || 'Går i gang' }))
    }
    return r
  })

  on('tool.call', async ($, e, next) => {
    await quietly(setActivity($, e.agentId, activityFor(e.tool, e as unknown as Record<string, unknown>)))
    const ran = await next(e)

    const sub = spawned.get(e.tool_use_id)
    if (sub) {
      spawned.delete(e.tool_use_id)
      if (!sub.isBackground) await quietly(deliver($, sub.agentId))
    }
    if (!('deny' in ran && ran.deny) && 'result' in ran && ran.result && !ran.isError && (e.tool === 'Edit' || e.tool === 'Write')) {
      const r = ran.result as { structuredPatch?: Patch; staged?: boolean; type?: string; content?: string; originalFile?: string | null }
      if (!r.staged) {
        const counted = e.tool === 'Write' && (r.type === 'create' || (r.structuredPatch?.length === 0 && r.originalFile === null))
          ? { added: countLines(r.content ?? ''), removed: 0 }
          : countPatch(r.structuredPatch)
        await quietly(update($, office, o => ({ ...o, linesAdded: o.linesAdded + counted.added, linesRemoved: o.linesRemoved + counted.removed })))
      }
    }
    if ((e.tool === 'Bash' || e.tool === 'PowerShell') && 'result' in ran && ran.result) {
      const result = ran.result as { interrupted?: boolean; backgroundTaskId?: string }
      const command = String((e as unknown as { command?: unknown }).command ?? '')
      const party = result.backgroundTaskId || result.interrupted ? null : partyFor(command, !ran.isError)
      if (party) await quietly(celebrate($, e.agentId ?? 'main', party))
    }
    if (!sub) await quietly(setActivity($, e.agentId, thinking))

    return ran
  })

  // A button above the chat box: starts the server and opens the office.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    try {
      const { Box, Button, Text } = $.ui.resolve(e)
      const o = await readOffice($)
      const helpers = o.subs.length
      const note =
        o.main.state === 'waiting' ? 'Claude venter på dig' : helpers ? `${helpers} ${helpers === 1 ? 'hjælper' : 'hjælpere'} i kontoret` : null
      return (
        <Box flexDirection="row" gap={1}>
          <Button key="kontor" label="🏢 Åbn kontor" onPress={() => void quietly(openOffice($))} />
          {note ? <Text color={o.main.state === 'waiting' ? '#E5484D' : undefined} dimColor={o.main.state !== 'waiting'}>{note}</Text> : null}
        </Box>
      )
    } catch {
      return next(e)
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    try {
      const { Box, Text, Button } = $.ui.resolve(e)
      const o = await readOffice($)
      const working = o.subs.filter(s => s.phase === 'working').length

      const row = (key: string, name: string, line: string, state: AgentState, note: string | null) => (
        <Box key={key} flexDirection="row" gap={2} paddingX={1}>
          <Box width={2} flexShrink={0}>
            <Text color={stateColor[state]} bold>
              ●
            </Text>
          </Box>
          <Box flexDirection="column" flexGrow={1} flexShrink={1}>
            <Text bold>{name}</Text>
            <Text color={stateColor[state]} wrap="truncate-end">
              {line}
            </Text>
            {note ? <Text dimColor wrap="truncate-end">{note}</Text> : null}
          </Box>
        </Box>
      )

      const figures = [
        o.linesAdded || o.linesRemoved ? `+${o.linesAdded} −${o.linesRemoved} linjer` : null,
        o.costUsd !== null ? `$${o.costUsd.toFixed(2)}` : null,
        o.fiveHour !== null ? `${Math.round(o.fiveHour)} % af 5-timers-grænsen` : null,
      ].filter(Boolean) as string[]

      const subRows = o.subs.map(s => {
        const isBusy = s.phase === 'working' || s.phase === 'arriving'
        return row(
          `s-${s.id}`,
          s.name,
          isBusy ? s.activity.detail : s.outcome === 'failed' ? `Gik i stå: ${s.task}` : `${phaseText[s.phase]}: ${s.task}`,
          isBusy ? s.activity.state : 'working',
          s.phase === 'arriving' ? `${s.task} (på vej ind)` : s.phase === 'working' ? s.task : null,
        )
      })

      return (
        <Box flexDirection="column" gap={1} paddingX={1} paddingY={1}>
          <Box flexDirection="column" paddingX={1}>
            <Text bold>Kontoret tegnes i din browser</Text>
            <Text dimColor wrap="wrap">{`Det ligger på ${ADDRESS}. Alle dine sessioner sidder i samme kontor.`}</Text>
          </Box>
          <Box flexDirection="row" gap={2} paddingX={1}>
            <Button label="Åbn kontor" onPress={() => void quietly(openOffice($))} />
            <Button label="Kopiér adresse" onPress={press => void quietly($.ui.copy({ text: ADDRESS, surface: press.surface }))} />
          </Box>
          {o.main.state === 'waiting' ? (
            <Box borderStyle="round" borderColor="#E5484D" paddingX={2}>
              <Text color="#E5484D" wrap="wrap">{`Claude venter på dig: ${o.main.detail}`}</Text>
            </Box>
          ) : null}
          <Box flexDirection="column" gap={1}>
            {row('main', 'Claude', o.main.detail, o.main.state, figures.length ? figures.join(', ') : null)}
            {subRows}
            {o.others.map(x =>
              row(`o-${x.key}`, `Claude i ${x.project}`, x.main.detail, x.main.state, x.helpers ? `${x.helpers} ${x.helpers === 1 ? 'hjælper' : 'hjælpere'}` : null),
            )}
          </Box>
          <Box flexDirection="row" gap={1} paddingX={1}>
            <Text dimColor wrap="wrap">
              {o.subs.length === 0
                ? 'Ingen hjælpere i kontoret. Når Claude sender subagenter afsted, sætter de sig i teamrummet. Prøv /kontor demo.'
                : `${working} af ${o.subs.length} hjælpere arbejder`}
            </Text>
          </Box>
        </Box>
      )
    } catch (err) {
      const { Box, Text } = $.ui.resolve(e)
      return (
        <Box flexDirection="column" gap={1} paddingX={1} paddingY={1}>
          <Text bold>Kontoret kunne ikke vises</Text>
          <Text dimColor wrap="wrap">{err instanceof Error ? err.message : String(err)}</Text>
        </Box>
      ) as RenderElement
    }
  })
}
