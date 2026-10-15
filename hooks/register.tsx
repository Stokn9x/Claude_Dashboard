import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, UiPressArgument } from 'claude-code'

import type { Activity, Agent, AgentState, Floor, Mine, Mode, Office, Person, Screen } from '../types'

// The same Supabase project as Team Chat, with offices of its own. Each
// computer signs in as an anonymous user; an office's code lets people in.
const SUPABASE = 'https://yqdumafjvdyabojuajeo.supabase.co'
const KEY = 'sb_publishable_bDtsNOxE17K2fsPr4vyUWA_QuvoO0du'
const REPO = 'Stokn9x/Claude_Dashboard'

const PANE = 'kontor'
const POLL_MS = 4000
const HEARTBEAT_MS = 60_000

const screen = atom(
  { plugin: 'agent-kontor', key: 'screen' } as const,
  { phase: 'setup', error: null, isBusy: false, mode: 'none' } as Screen,
)
const floor = atom(
  { plugin: 'agent-kontor', key: 'floor' } as const,
  { me: null, name: null, offices: [], officeId: null, people: [] } as Floor,
)
const thinking: Activity = { state: 'working', detail: 'Tænker' }
const pause: Activity = { state: 'idle', detail: 'Pause' }
const mine = atom(
  { plugin: 'agent-kontor', key: 'mine' } as const,
  {
    sessionId: null,
    project: '',
    main: pause,
    subs: {},
    model: '',
    tokensOut: 0,
    costUsd: null,
    linesAdded: 0,
    linesRemoved: 0,
    fiveHour: null,
    sevenDay: null,
  } as Mine,
)

type $ = EngineInterface
type Session = { access_token: string; refresh_token: string; expires_at: number; user_id: string }
type AuthReply = { access_token: string; refresh_token: string; expires_in: number; user: { id: string } }

// ─── Small helpers ──────────────────────────────────────────────────────

const setScreen = ($: $, patch: Partial<Screen>) => update($, screen, v => ({ ...v, ...patch }))
const setFloor = ($: $, patch: Partial<Floor>) => update($, floor, f => ({ ...f, ...patch }))
const fail = ($: $, error: string) => setScreen($, { error, isBusy: false })

const normalizeCode = (text: string) => {
  const raw = text.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  return raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : null
}
const CODE = /^[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}$/

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

const randomId = () => `s-${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`

// What one tool call looks like from the office: a state and a short line.
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
    case 'Task':
      return { state: 'working', detail: 'Sender en subagent afsted' }
    case 'AskUserQuestion':
      return { state: 'waiting', detail: 'Har et spørgsmål til dig' }
    default:
      return { state: 'working', detail: `Bruger ${tool.startsWith('mcp__') ? (tool.split('__').pop() ?? tool) : tool}` }
  }
}

// ─── Supabase over the host's HTTP ──────────────────────────────────────

type Call = { method?: string; body?: unknown; token?: string }
type Reply<T> = { ok: boolean; status: number; data: T | null; message: string }

const call = async <T,>($: $, path: string, init: Call = {}): Promise<Reply<T>> => {
  const headers: Record<string, string> = { apikey: KEY, 'Content-Type': 'application/json' }
  if (init.token) headers.Authorization = `Bearer ${init.token}`

  const res = await $.http.fetch(`${SUPABASE}${path}`, {
    method: init.method ?? 'POST',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  let data: unknown = null
  try {
    data = res.text ? JSON.parse(res.text) : null
  } catch {
    data = null
  }
  const err = (data ?? {}) as { msg?: string; message?: string }

  return { ok: res.ok, status: res.status, data: res.ok ? (data as T) : null, message: err.message ?? err.msg ?? `HTTP ${res.status}` }
}

const loadSession = async ($: $) => (await $.store.get('session')) as Session | undefined

const saveSession = async ($: $, raw: AuthReply) => {
  const session: Session = {
    access_token: raw.access_token,
    refresh_token: raw.refresh_token,
    expires_at: (await $.clock.now()) + raw.expires_in * 1000,
    user_id: raw.user.id,
  }
  await $.store.set('session', session)

  return session
}

const ensureSession = async ($: $): Promise<Session | null> => {
  const existing = await loadSession($)
  if (existing) return existing

  const res = await call<AuthReply>($, '/auth/v1/signup', { body: {} })
  if (!res.ok || !res.data) {
    await fail($, res.status === 429 ? 'For mange nye forbindelser lige nu. Prøv igen om lidt.' : `Kunne ikke forbinde: ${res.message}`)
    return null
  }

  return saveSession($, res.data)
}

const token = async ($: $): Promise<string | null> => {
  const session = await loadSession($)
  if (!session) return null
  if (session.expires_at - (await $.clock.now()) > 60_000) return session.access_token

  const res = await call<AuthReply>($, '/auth/v1/token?grant_type=refresh_token', { body: { refresh_token: session.refresh_token } })
  if (!res.ok || !res.data) return null

  return (await saveSession($, res.data)).access_token
}

const rpc = async <T,>($: $, name: string, body: Record<string, unknown> = {}): Promise<Reply<T>> => {
  const t = await token($)
  if (!t) return { ok: false, status: 401, data: null, message: 'not signed in' }

  return call<T>($, `/rest/v1/rpc/${name}`, { token: t, body })
}

// ─── Reporting my agents ────────────────────────────────────────────────

let inFlight = false
let dirty = false

const payload = (m: Mine, officeId: string, id: string, a: Activity, parent: string | null) => ({
  id,
  office_id: officeId,
  parent_id: parent,
  project: m.project,
  state: a.state,
  detail: a.detail,
  model: m.model,
  tokens_out: parent ? 0 : m.tokensOut,
  cost_usd: parent ? null : m.costUsd,
  lines_added: parent ? 0 : m.linesAdded,
  lines_removed: parent ? 0 : m.linesRemoved,
  five_hour: parent ? null : m.fiveHour,
  seven_day: parent ? null : m.sevenDay,
})

// Sends this session and its subagents; one send at a time, the last state wins.
const flush = async ($: $) => {
  if (inFlight) {
    dirty = true
    return
  }
  inFlight = true
  try {
    do {
      dirty = false
      const m = await read($, mine)
      const f = await read($, floor)
      if (!m.sessionId || !f.officeId || !(await loadSession($))) return

      await rpc($, 'report_agent', { a: payload(m, f.officeId, m.sessionId, m.main, null) })
      for (const [agentId, activity] of Object.entries(m.subs)) {
        await rpc($, 'report_agent', { a: payload(m, f.officeId, `${m.sessionId}:${agentId}`, activity, m.sessionId) })
      }
    } while (dirty)
  } finally {
    inFlight = false
  }
}

// The office must never get in Claude's way: anything that fails here is dropped.
const quietly = <T,>(work: Promise<T>) => work.then(() => undefined, () => undefined)

const setActivity = async ($: $, agentId: string | undefined, activity: Activity) => {
  const before = await read($, mine)
  const current = agentId ? before.subs[agentId] : before.main
  if (current && current.state === activity.state && current.detail === activity.detail) return

  await update($, mine, m => (agentId ? { ...m, subs: { ...m.subs, [agentId]: activity } } : { ...m, main: activity }))
  void flush($).catch(() => {})
}

const dropSub = async ($: $, agentId: string) => {
  const m = await read($, mine)
  if (!m.sessionId || !(agentId in m.subs)) return
  await update($, mine, x => {
    const subs = { ...x.subs }
    delete subs[agentId]
    return { ...x, subs }
  })
  await rpc($, 'agent_gone', { agent_id: `${m.sessionId}:${agentId}` }).catch(() => {})
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

const addLines = ($: $, added: number, removed: number) =>
  update($, mine, m => ({ ...m, linesAdded: m.linesAdded + added, linesRemoved: m.linesRemoved + removed }))

// ─── Offices ────────────────────────────────────────────────────────────

const loadOffices = async ($: $) => {
  const res = await rpc<Office[]>($, 'my_offices')
  if (!res.ok || !res.data) return
  const offices = res.data.map(o => ({ ...o, members: Number(o.members) || 1 }))
  const f = await read($, floor)
  const saved = (await $.store.get('officeId')) as string | undefined
  const officeId = [f.officeId, saved].find(id => id && offices.some(o => o.id === id)) ?? offices[0]?.id ?? null

  await setFloor($, { offices, officeId })
  if (officeId !== f.officeId) await openOffice($, officeId)
}

const openOffice = async ($: $, officeId: string | null) => {
  const f = await read($, floor)
  if (f.officeId !== officeId) await setFloor($, { officeId, people: [] })
  await setScreen($, { mode: 'none', error: null })
  if (!officeId) return
  await $.store.set('officeId', officeId)
  void flush($).catch(() => {})
  await poll($)
}

const poll = async ($: $) => {
  const f = await read($, floor)
  if (!f.officeId || (await read($, screen)).phase !== 'office') return

  const res = await rpc<Person[]>($, 'office_view', { target: f.officeId })
  if (!res.ok || !res.data) return
  // Draw again only when something moved: the scene's animations restart on a redraw.
  if (JSON.stringify(res.data) !== JSON.stringify(f.people)) {
    await setFloor($, { people: res.data })
  }
}

const enter = async ($: $) => {
  const session = await loadSession($)
  const name = (await $.store.get('name')) as string | undefined
  if (!session || !name) return

  await setFloor($, { me: session.user_id, name })
  await setScreen($, { phase: 'office', error: null, isBusy: false })
  await loadOffices($)
}

const setName = async ($: $, input: string) => {
  const name = input.trim().replace(/\s+/g, ' ').slice(0, 40)
  if (!name) return fail($, 'Skriv det navn, kollegerne skal se.')

  await setScreen($, { isBusy: true, error: null })
  const session = await ensureSession($)
  if (!session) return

  if ((await read($, floor)).offices.length > 0) {
    const res = await rpc($, 'set_office_name', { my_name: name })
    if (!res.ok) {
      return fail($, res.message.includes('name_taken') ? `Navnet "${name}" er taget i et af dine kontorer.` : `Kunne ikke skifte navn: ${res.message}`)
    }
  }

  await $.store.set('name', name)
  await setFloor($, { me: session.user_id, name })
  await setScreen($, { phase: 'office', isBusy: false, mode: 'none' })
  await loadOffices($)
}

const createOffice = async ($: $, input: string) => {
  const name = input.trim().slice(0, 60)
  if (!name) return fail($, 'Giv kontoret et navn.')

  await setScreen($, { isBusy: true, error: null })
  const res = await rpc<{ id: string }>($, 'create_office', { office_name: name, my_name: (await read($, floor)).name })
  if (!res.ok || !res.data) return fail($, `Kunne ikke oprette kontoret: ${res.message}`)

  await setFloor($, { officeId: res.data.id })
  await loadOffices($)
  await openOffice($, res.data.id)
  await setScreen($, { isBusy: false, mode: 'code' })
}

const joinOffice = async ($: $, input: string) => {
  const code = normalizeCode(input)
  const f = await read($, floor)
  if (!code) return fail($, 'En kode ser sådan ud: ABCD-EF23')

  await setScreen($, { isBusy: true, error: null })
  const res = await rpc<{ id: string; name: string }>($, 'join_office', { code, my_name: f.name })
  if (!res.ok || !res.data) {
    if (res.message.includes('unknown_code')) return fail($, `Der er intet kontor med koden ${code}.`)
    if (res.message.includes('name_taken')) return fail($, `Der er allerede en "${f.name}" i det kontor. Skift dit navn med ✏️.`)
    return fail($, `Kunne ikke forbinde: ${res.message}`)
  }

  await setFloor($, { officeId: res.data.id })
  await loadOffices($)
  await openOffice($, res.data.id)
  await setScreen($, { isBusy: false })
  $.ui.toast(`🏢 Du er med i ${res.data.name}. Dine agenter arbejder nu herinde.`)
}

const leaveOffice = async ($: $) => {
  const f = await read($, floor)
  if (!f.officeId) return
  await rpc($, 'leave_office', { target: f.officeId })
  await setFloor($, { officeId: null, people: [] })
  await $.store.delete('officeId')
  await loadOffices($)
}

// ─── Look ───────────────────────────────────────────────────────────────

const accent = '#1E7FC9'
const ink = '#14212E'
const softInk = '#5B6B7A'
const cloud = '#EEF2F6'
const sky = '#F2F8FD'
const skyLine = '#CFE3F5'
const plus = '#1E9E6A'
const minus = '#D64545'
const FONT = 'Segoe UI, system-ui, -apple-system, sans-serif'

const shirts = ['#1E7FC9', '#17A398', '#E8643F', '#8E7BE6', '#C98A00', '#E0567A', '#3D8B5A', '#B0563B']
const hairs = ['#3B2A20', '#6B4226', '#C9A227', '#1F1F1F', '#A0522D', '#8C8C8C']
const skins = ['#F5D3B3', '#F2C9A0', '#E0AC69', '#C68642', '#8D5524']

const hash = (id: string) => {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h
}
const pick = <T,>(list: T[], id: string, salt = 0): T => list[(hash(id) + salt) % list.length] as T

const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

const stateLabel: Record<AgentState, string> = {
  working: 'Arbejder',
  reading: 'Læser',
  editing: 'Skriver kode',
  running: 'Kører',
  browsing: 'På nettet',
  waiting: 'Venter på dig',
  idle: 'Pause',
}
const stateIcon: Record<AgentState, string> = {
  working: '💭',
  reading: '📖',
  editing: '⌨️',
  running: '⏳',
  browsing: '🌐',
  waiting: '❗',
  idle: '☕',
}

// ─── The office, in pixels ──────────────────────────────────────────────

const P = 4 // one pixel of the sprites, in SVG units
const W = 640

type Look = { shirt: string; hair: string; skin: string }
const lookOf = (userId: string): Look => ({ shirt: pick(shirts, userId), hair: pick(hairs, userId, 3), skin: pick(skins, userId, 7) })

// A person seen from the front, 8 × 12 pixels. `seated` hides the legs behind a desk.
const sprite = (x: number, y: number, look: Look, opts: { seated?: boolean; armUp?: boolean; typing?: boolean; cup?: boolean; scale?: number } = {}) => {
  const s = opts.scale ?? 1
  const at = (u: number) => u * P
  const head = [
    `<rect x="${at(1)}" y="0" width="${at(6)}" height="${at(2)}" fill="${look.hair}"/>`,
    `<rect x="0" y="${at(1)}" width="${at(1)}" height="${at(2)}" fill="${look.hair}"/>`,
    `<rect x="${at(7)}" y="${at(1)}" width="${at(1)}" height="${at(2)}" fill="${look.hair}"/>`,
    `<rect x="${at(1)}" y="${at(2)}" width="${at(6)}" height="${at(3)}" fill="${look.skin}"/>`,
    `<rect x="${at(2)}" y="${at(3)}" width="${at(1)}" height="${at(1)}" fill="#1F1F1F"/>`,
    `<rect x="${at(5)}" y="${at(3)}" width="${at(1)}" height="${at(1)}" fill="#1F1F1F"/>`,
    `<rect x="${at(3)}" y="${at(4)}" width="${at(2)}" height="${at(0.5)}" fill="#B65F4B"/>`,
  ]
  const body = [
    `<rect x="${at(1)}" y="${at(5)}" width="${at(6)}" height="${at(3)}" fill="${look.shirt}"/>`,
    `<rect x="${at(3)}" y="${at(5)}" width="${at(2)}" height="${at(1)}" fill="#FFFFFF" opacity="0.35"/>`,
  ]
  const leftArm = `<rect x="0" y="${at(5)}" width="${at(1)}" height="${at(3)}" fill="${look.shirt}"/><rect x="0" y="${at(8)}" width="${at(1)}" height="${at(1)}" fill="${look.skin}"/>`
  const rightArm = opts.armUp
    ? `<g><rect x="${at(7)}" y="${at(1)}" width="${at(1)}" height="${at(4)}" fill="${look.shirt}"/><rect x="${at(7)}" y="0" width="${at(1)}" height="${at(1)}" fill="${look.skin}"/>
        <animateTransform attributeName="transform" type="rotate" values="-6 ${at(7.5)} ${at(5)};6 ${at(7.5)} ${at(5)};-6 ${at(7.5)} ${at(5)}" dur="0.8s" repeatCount="indefinite"/></g>`
    : `<rect x="${at(7)}" y="${at(5)}" width="${at(1)}" height="${at(3)}" fill="${look.shirt}"/><rect x="${at(7)}" y="${at(8)}" width="${at(1)}" height="${at(1)}" fill="${look.skin}"/>`
  const hands = opts.typing
    ? `<g><rect x="${at(1)}" y="${at(8)}" width="${at(2)}" height="${at(1)}" fill="${look.skin}"/><rect x="${at(5)}" y="${at(8)}" width="${at(2)}" height="${at(1)}" fill="${look.skin}"/>
        <animateTransform attributeName="transform" type="translate" values="0 0;0 -3;0 0;0 -1;0 0" dur="0.5s" repeatCount="indefinite"/></g>`
    : ''
  const legs = opts.seated
    ? ''
    : `<rect x="${at(1)}" y="${at(8)}" width="${at(6)}" height="${at(1)}" fill="#2E3A48"/>
       <rect x="${at(1)}" y="${at(9)}" width="${at(2)}" height="${at(3)}" fill="#3A4A5C"/><rect x="${at(5)}" y="${at(9)}" width="${at(2)}" height="${at(3)}" fill="#3A4A5C"/>
       <rect x="${at(1)}" y="${at(12)}" width="${at(2)}" height="${at(0.75)}" fill="#1F1F1F"/><rect x="${at(5)}" y="${at(12)}" width="${at(2)}" height="${at(0.75)}" fill="#1F1F1F"/>`
  const cup = opts.cup
    ? `<rect x="${at(8)}" y="${at(6.5)}" width="${at(2)}" height="${at(2)}" fill="#FFFFFF" stroke="#C9D3DD"/><rect x="${at(8.3)}" y="${at(6.8)}" width="${at(1.4)}" height="${at(0.5)}" fill="#7A4A2A"/>`
    : ''

  return `<g transform="translate(${x} ${y}) scale(${s})">${head.join('')}${leftArm}${rightArm}${body.join('')}${hands}${legs}${cup}</g>`
}

const bubble = (x: number, y: number, state: AgentState) => {
  const blink = state === 'waiting' ? '<animate attributeName="opacity" values="1;0.35;1" dur="0.9s" repeatCount="indefinite"/>' : ''
  const border = state === 'waiting' ? '#E0567A' : '#C9D3DD'

  return `<g transform="translate(${x} ${y})">${blink}
    <rect x="0" y="0" width="26" height="22" rx="7" fill="#FFFFFF" stroke="${border}" stroke-width="1.5"/>
    <path d="M9 21 L11 27 L15 21 Z" fill="#FFFFFF" stroke="${border}" stroke-width="1.5"/>
    <rect x="9.5" y="19" width="5" height="3" fill="#FFFFFF"/>
    <text x="13" y="16" text-anchor="middle" font-size="12">${stateIcon[state]}</text>
  </g>`
}

// The monitor's screen tells the state too.
const screenFor = (x: number, y: number, w: number, h: number, state: AgentState) => {
  if (state === 'running') {
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#101418"/>
      <rect x="${x + 3}" y="${y + 4}" width="${w * 0.6}" height="2" fill="#3DDC84"/>
      <rect x="${x + 3}" y="${y + 9}" width="${w * 0.4}" height="2" fill="#3DDC84"/>
      <rect x="${x + 3}" y="${y + 14}" width="4" height="3" fill="#3DDC84"><animate attributeName="opacity" values="1;0;1" dur="1s" repeatCount="indefinite"/></rect>`
  }
  if (state === 'editing') {
    const lines = [0.7, 0.5, 0.8, 0.4, 0.6, 0.3]
      .map((f, i) => `<rect x="${x + 3 + (i % 3) * 3}" y="${y + 3 + i * 4}" width="${(w - 10) * f}" height="2" fill="${['#7FB4F0', '#E8A33D', '#9BD58B'][i % 3]}"/>`)
      .join('')
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#1C2333"/><g>${lines}<animateTransform attributeName="transform" type="translate" values="0 0;0 -4;0 0" dur="1.6s" repeatCount="indefinite"/></g>`
  }
  if (state === 'reading') {
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#F7F7F2"/>
      ${[0, 1, 2, 3, 4].map(i => `<rect x="${x + 4}" y="${y + 4 + i * 4}" width="${w - 8 - (i % 2) * 6}" height="2" fill="#B9C2CC"/>`).join('')}`
  }
  if (state === 'browsing') {
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#EAF4FC"/><rect x="${x}" y="${y}" width="${w}" height="5" fill="#1E7FC9"/>
      <rect x="${x + 4}" y="${y + 9}" width="${w * 0.5}" height="7" fill="#B8D8F2"/>`
  }
  if (state === 'waiting') {
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#FFF1F3"/><rect x="${x + 2}" y="${y + 2}" width="${w - 4}" height="${h - 4}" fill="none" stroke="#E0567A" stroke-width="2">
      <animate attributeName="opacity" values="1;0.2;1" dur="0.9s" repeatCount="indefinite"/></rect>
      <text x="${x + w / 2}" y="${y + h / 2 + 5}" text-anchor="middle" font-family="${FONT}" font-size="13" font-weight="800" fill="#E0567A">?</text>`
  }
  if (state === 'idle') {
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#20304A"/><text x="${x + w / 2}" y="${y + h / 2 + 4}" text-anchor="middle" font-family="${FONT}" font-size="10" fill="#7FB4F0">zZ</text>`
  }
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#2A3346"/>
    ${[0, 1, 2].map(i => `<circle cx="${x + w / 2 - 8 + i * 8}" cy="${y + h / 2}" r="2.2" fill="#7FB4F0"><animate attributeName="opacity" values="0.2;1;0.2" dur="1.2s" begin="${i * 0.2}s" repeatCount="indefinite"/></circle>`).join('')}`
}

type Desk = { person: Person; agent: Agent | null; subs: Agent[] }

const DESK_W = W / 3
const DESK_H = 150

const desk = (col: number, row: number, top: number, d: Desk) => {
  const x = col * DESK_W
  const y = top + row * DESK_H
  const look = lookOf(d.person.user_id)
  const a = d.agent
  const isHere = a !== null && a.state !== 'idle'
  const state: AgentState = a?.state ?? 'idle'
  const cx = x + DESK_W / 2

  const rug = `<rect x="${x + 10}" y="${y + 12}" width="${DESK_W - 20}" height="${DESK_H - 22}" rx="10" fill="${look.shirt}" opacity="0.08"/>`
  const chair = `<rect x="${cx - 26}" y="${y + 34}" width="52" height="40" rx="8" fill="#3A4656"/><rect x="${cx - 22}" y="${y + 38}" width="44" height="32" rx="6" fill="#4A5868"/>`
  const person = isHere ? sprite(cx - 16, y + 30, look, { seated: true, armUp: state === 'waiting', typing: state === 'editing' || state === 'working' || state === 'running' }) : ''
  const deskTop = `<rect x="${cx - 60}" y="${y + 64}" width="120" height="10" rx="2" fill="#B07A4F"/><rect x="${cx - 60}" y="${y + 74}" width="120" height="22" fill="#8B5E3C"/>
    <rect x="${cx - 54}" y="${y + 96}" width="8" height="14" fill="#6E472B"/><rect x="${cx + 46}" y="${y + 96}" width="8" height="14" fill="#6E472B"/>`
  const monitor = `<rect x="${cx + 14}" y="${y + 30}" width="44" height="34" rx="3" fill="#2B2F36"/>
    ${screenFor(cx + 17, y + 33, 38, 26, a ? state : 'idle')}
    <rect x="${cx + 32}" y="${y + 64}" width="8" height="3" fill="#2B2F36"/>`
  const plant = col % 2 === 0 ? `<rect x="${cx - 54}" y="${y + 52}" width="12" height="12" fill="#C0703A"/><circle cx="${cx - 48}" cy="${y + 47}" r="8" fill="#3D8B5A"/><circle cx="${cx - 53}" cy="${y + 50}" r="5" fill="#4FA36B"/>` : `<rect x="${cx - 52}" y="${y + 56}" width="16" height="8" rx="2" fill="#F2F2F2"/><rect x="${cx - 50}" y="${y + 52}" width="12" height="4" fill="#E8643F"/>`
  const label = a ? `${d.person.name} · ${a.project || 'ingen mappe'}` : d.person.name
  const sub = a ? (a.state === 'idle' ? 'Pause ☕' : a.detail || stateLabel[a.state]) : 'Ikke online'
  const plate = `<text x="${cx}" y="${y + 126}" text-anchor="middle" font-family="${FONT}" font-size="12" font-weight="700" fill="${a ? ink : '#9AA6B2'}">${esc(clip(label, 30))}</text>
    <text x="${cx}" y="${y + 141}" text-anchor="middle" font-family="${FONT}" font-size="11" fill="${state === 'waiting' ? '#E0567A' : softInk}">${esc(clip(sub, 32))}</text>`
  const talk = isHere ? bubble(cx - 2, y + 2, state) : ''
  // Subagents stand beside the desk, small and grey-shirted, their state above their head.
  const shown = d.subs.slice(0, 2)
  const helpers =
    shown
      .map((s, i) => {
        const hx = cx + 64 + i * 19
        return `${sprite(hx, y + 66, { ...look, shirt: '#9AA6B2' }, { scale: 0.5, typing: s.state !== 'idle' })}
        <text x="${hx + 8}" y="${y + 60}" text-anchor="middle" font-size="10">${stateIcon[s.state]}</text>`
      })
      .join('') +
    (d.subs.length > shown.length
      ? `<text x="${cx + 82}" y="${y + 106}" text-anchor="middle" font-family="${FONT}" font-size="10" font-weight="700" fill="${softInk}">+${d.subs.length - shown.length}</text>`
      : '')

  return `${rug}${chair}${person}${deskTop}${monitor}${plant}${plate}${talk}${helpers}`
}

const lounge = (top: number, idle: { person: Person; agent: Agent }[]) => {
  const h = 120
  const people = idle
    .slice(0, 8)
    .map((d, i) => {
      const x = 200 + i * 52
      return `${sprite(x, top + 40, lookOf(d.person.user_id), { cup: true })}
        <text x="${x + 16}" y="${top + 108}" text-anchor="middle" font-family="${FONT}" font-size="10.5" font-weight="600" fill="${ink}">${esc(clip(d.person.name, 9))}</text>`
    })
    .join('')

  return `<rect x="0" y="${top}" width="${W}" height="${h}" fill="#E9DFD0"/>
    <rect x="0" y="${top}" width="${W}" height="4" fill="#D8CBB6"/>
    <text x="16" y="${top + 22}" font-family="${FONT}" font-size="11" font-weight="700" letter-spacing="1.5" fill="#8A7A64">KØKKEN &amp; LOUNGE</text>
    <rect x="20" y="${top + 52}" width="110" height="34" rx="8" fill="#5B6FA8"/><rect x="20" y="${top + 40}" width="110" height="18" rx="8" fill="#6E83BD"/>
    <rect x="16" y="${top + 50}" width="12" height="38" rx="5" fill="#4E6196"/><rect x="122" y="${top + 50}" width="12" height="38" rx="5" fill="#4E6196"/>
    <rect x="${W - 70}" y="${top + 36}" width="44" height="56" rx="4" fill="#3A4046"/><rect x="${W - 64}" y="${top + 44}" width="32" height="14" fill="#9AD0F5"/>
    <circle cx="${W - 48}" cy="${top + 70}" r="5" fill="#E8643F"/><rect x="${W - 56}" y="${top + 80}" width="16" height="8" fill="#FFFFFF"/>
    ${people}`
}

const officeSvg = (office: Office, people: Person[], hour: number) => {
  const desks: Desk[] = []
  const idle: { person: Person; agent: Agent }[] = []
  for (const person of people) {
    const mains = person.agents.filter(a => !a.parent_id)
    if (mains.length === 0) desks.push({ person, agent: null, subs: [] })
    for (const agent of mains) {
      const subs = person.agents.filter(s => s.parent_id === agent.id)
      desks.push({ person, agent, subs })
      if (agent.state === 'idle') idle.push({ person, agent })
    }
  }

  const isNight = hour < 7 || hour >= 19
  const wallH = 86
  const rows = Math.max(1, Math.ceil(desks.length / 3))
  const floorTop = wallH
  const loungeTop = floorTop + rows * DESK_H + 6
  const h = loungeTop + 120
  const windowSky = isNight ? '#0E1B33' : hour < 9 || hour >= 17 ? '#F6B88A' : '#9BD3F5'
  const stars = isNight ? [30, 70, 410, 470, 530].map((sx, i) => `<rect x="${sx}" y="${20 + (i % 3) * 8}" width="2" height="2" fill="#FFFFFF"/>`).join('') : ''
  const windows = [20, 400]
    .map(wx => `<rect x="${wx}" y="14" width="200" height="54" rx="4" fill="#FFFFFF"/><rect x="${wx + 6}" y="20" width="188" height="42" fill="${windowSky}"/>
      <rect x="${wx + 98}" y="20" width="4" height="42" fill="#FFFFFF"/>${isNight ? '' : `<circle cx="${wx + 40}" cy="38" r="9" fill="#FFFFFF" opacity="0.8"/><circle cx="${wx + 52}" cy="36" r="11" fill="#FFFFFF" opacity="0.8"/>`}`)
    .join('')
  const working = desks.filter(d => d.agent && d.agent.state !== 'idle').length
  const sign = `<rect x="244" y="18" width="152" height="46" rx="6" fill="#2B2F36"/>
    <text x="320" y="38" text-anchor="middle" font-family="${FONT}" font-size="13" font-weight="800" fill="#FFFFFF">${esc(clip(office.name, 18))}</text>
    <text x="320" y="55" text-anchor="middle" font-family="${FONT}" font-size="10.5" fill="#9AD0F5">${working} ${working === 1 ? 'agent arbejder' : 'agenter arbejder'}</text>`
  const floorTiles = `<rect x="0" y="${floorTop}" width="${W}" height="${rows * DESK_H + 6}" fill="#F3ECE1"/>
    ${Array.from({ length: Math.ceil((rows * DESK_H) / 30) }, (_, i) => `<rect x="0" y="${floorTop + i * 30}" width="${W}" height="1" fill="#E6DCCB"/>`).join('')}`

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${h}" width="${W}" height="${h}" shape-rendering="crispEdges">
  <defs><clipPath id="room"><rect width="${W}" height="${h}" rx="16"/></clipPath></defs>
  <g clip-path="url(#room)">
    <rect width="${W}" height="${wallH}" fill="${isNight ? '#2A3245' : '#E4EAF1'}"/>${windows}${stars}${sign}
    <rect x="0" y="${wallH - 6}" width="${W}" height="6" fill="${isNight ? '#1E2534' : '#CBD5E1'}"/>
    ${floorTiles}
    ${desks.map((d, i) => desk(i % 3, Math.floor(i / 3), floorTop, d)).join('')}
    ${lounge(loungeTop, idle)}
  </g>
</svg>`
}

// ─── Hooks ──────────────────────────────────────────────────────────────

export const register: Register = on => {
  // spawn tool_use_id → the subagent's id, to send it home when its call ends.
  const spawned = new Map<string, string>()

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'kontor',
      description: 'Agent-kontor: åbn kontoret, eller forbind med en kode',
      argumentHint: '[forbind <kode> | nyt <navn> | navn <dit navn> | kode | forlad]',
    })
    const project = base(e.cwd) || 'ukendt'
    await update($, mine, m => ({ ...m, sessionId: m.sessionId ?? randomId(), project, main: pause }))
    void $.ui.open({ id: PANE, title: '🏢 Kontor' })
    void enter($).then(() => flush($)).catch(() => {})
    $.clock.every(POLL_MS, () => {
      void poll($).catch(() => {})
    })
    $.clock.every(HEARTBEAT_MS, () => {
      void flush($).catch(() => {})
    })

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    const m = await read($, mine)
    if (m.sessionId) await rpc($, 'agent_gone', { agent_id: m.sessionId }).catch(() => {})
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    await setActivity($, undefined, thinking)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId) return result
    const u = e.usage
    if (u) await update($, mine, m => ({ ...m, tokensOut: m.tokensOut + u.output_tokens, model: u.model }))
    await setActivity($, undefined, pause)
    return result
  })

  on('session.measure', async ($, e, next) => {
    const five = e.rateLimits.find(l => l.kind === 'five_hour')
    const seven = e.rateLimits.find(l => l.kind === 'seven_day')
    await update($, mine, m => ({ ...m, costUsd: e.cost?.usd ?? m.costUsd, fiveHour: five?.percentUsed ?? m.fiveHour, sevenDay: seven?.percentUsed ?? m.sevenDay }))
    void flush($).catch(() => {})
    return next(e)
  })

  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    if ('decision' in verdict && verdict.decision === 'ask') {
      await quietly(setActivity($, e.agentId, { state: 'waiting', detail: 'Venter på din godkendelse' }))
    }
    return verdict
  })

  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    if ('agentId' in r && r.agentId) {
      spawned.set(e.tool_use_id, r.agentId)
      await quietly(setActivity($, r.agentId, { state: 'working', detail: e.description || 'Subagent' }))
    }
    return r
  })

  on('tool.call', async ($, e, next) => {
    await quietly(setActivity($, e.agentId, activityFor(e.tool, e as unknown as Record<string, unknown>)))
    const ran = await next(e)

    if (spawned.has(e.tool_use_id)) {
      const sub = spawned.get(e.tool_use_id) as string
      spawned.delete(e.tool_use_id)
      await quietly(dropSub($, sub))
    }
    if (!('deny' in ran && ran.deny) && 'result' in ran && ran.result && !ran.isError && !e.agentId) {
      const r = ran.result as { structuredPatch?: Patch; staged?: boolean; type?: string; content?: string; originalFile?: string | null }
      if (!r.staged && (e.tool === 'Edit' || e.tool === 'Write')) {
        const counted = e.tool === 'Write' && (r.type === 'create' || (r.structuredPatch?.length === 0 && r.originalFile === null))
          ? { added: countLines(r.content ?? ''), removed: 0 }
          : countPatch(r.structuredPatch)
        await quietly(addLines($, counted.added, counted.removed))
      }
    }
    await quietly(setActivity($, e.agentId, thinking))

    return ran
  })

  on('command.run', { command: 'kontor' }, async ($, e) => {
    const args = e.args.trim()
    const [word = '', ...rest] = args.split(/\s+/)
    const tail = rest.join(' ')
    const result = async (ok: string) => ({ text: (await read($, screen)).error ?? ok })

    await $.ui.open({ id: PANE, title: '🏢 Kontor', focus: true })
    if (!args) return { text: 'Kontoret er åbent.' }
    if (word === 'navn' || word === 'name') {
      await setName($, tail)
      return result(`Du hedder nu ${tail} i kontoret.`)
    }
    if ((await read($, screen)).phase !== 'office') return { text: 'Skriv dit navn i kontor-panelet først.' }
    if (word === 'forbind' || word === 'join' || CODE.test(args)) {
      await joinOffice($, CODE.test(args) ? args : tail)
      return result('Du er forbundet 🏢')
    }
    if (word === 'nyt' || word === 'new') {
      await createOffice($, tail)
      return result(`Kontoret "${tail}" er oprettet. Koden står i panelet.`)
    }
    if (word === 'kode' || word === 'code') {
      const f = await read($, floor)
      const o = f.offices.find(x => x.id === f.officeId)
      return { text: o ? `Koden til ${o.name} er ${o.invite_code}` : 'Du er ikke i et kontor.' }
    }
    if (word === 'forlad' || word === 'leave') {
      await leaveOffice($)
      return { text: 'Du har forladt kontoret.' }
    }
    return { text: 'Brug /kontor forbind <kode>, /kontor nyt <navn>, /kontor navn <navn>, /kontor kode eller /kontor forlad.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    if (e.surface === 'mobile') {
      const { Text } = $.ui.resolve(e)
      return <Text wrap="wrap">🏢 Kontoret bruger skrivefelter, som mobil-appen ikke har endnu.</Text>
    }

    try {
      const kit = $.ui.resolve(e)
      const { Box, Button, Input, Text } = kit
      const Svg = 'Svg' in kit ? kit.Svg : null
      const v = await read($, screen)
      const f = await read($, floor)

      const card = (key: string, children: RenderElement | RenderElement[], tint: 'sky' | 'error' = 'sky') => (
        <Box
          key={key}
          flexDirection="column"
          borderStyle="round"
          borderColor={tint === 'error' ? '#F2B8B5' : skyLine}
          backgroundColor={tint === 'error' ? '#FDECEA' : sky}
          paddingX={2}
          paddingY={1}
          gap={1}
        >
          {children}
        </Box>
      )
      const title = (key: string, text: string) => (
        <Text key={key} color={ink} bold>
          {text}
        </Text>
      )
      const hint = (key: string, text: string) => (
        <Text key={key} color={softInk} wrap="wrap">
          {text}
        </Text>
      )
      const pill = (key: string, label: string, isActive: boolean, onPress: (press: UiPressArgument) => unknown) => (
        <Box
          key={key}
          borderStyle="round"
          borderColor={isActive ? accent : cloud}
          backgroundColor={isActive ? accent : cloud}
          paddingX={2}
          hover={isActive ? undefined : { borderColor: accent }}
        >
          <Button key={`${key}-btn`} label={label} plain onPress={onPress} />
        </Box>
      )
      const error = v.error
        ? card(
            'error',
            <Text color="#B3261E" wrap="wrap">
              {`⚠ ${v.error}`}
            </Text>,
            'error',
          )
        : null
      const brand = (sub: string) => (
        <Box flexDirection="column">
          <Text color={accent} bold>
            🏢 Agent-kontor
          </Text>
          <Text color={softInk} wrap="wrap">
            {sub}
          </Text>
        </Box>
      )

      if (v.phase === 'setup') {
        return (
          <Box flexDirection="column" gap={1} paddingX={1} paddingY={1}>
            {brand('Se hele teamets Claude-agenter arbejde i ét pixel-kontor.')}
            {card('setup', [
              title('t', 'Hvad skal vi kalde dig?'),
              hint('d', 'Navnet står på dit skrivebord i kontoret. Kun status deles: hvad agenten laver og en filnavn, aldrig samtalen.'),
              <Input key="my-name" placeholder="Dit navn" submitLabel={v.isBusy ? 'et øjeblik…' : 'Kom i gang →'} autoFocus onSubmit={value => void setName($, value)} />,
            ])}
            {error}
          </Box>
        )
      }

      const office = f.offices.find(o => o.id === f.officeId)
      const toggle = (mode: Mode) => () => setScreen($, { mode: v.mode === mode ? 'none' : mode, error: null })

      const joinCard = card('join-card', [
        title('t', 'Forbind til et kontor'),
        hint('d', 'Indsæt koden, du har fået af en kollega. Dine agenter flytter ind med det samme.'),
        <Input key="join-code" placeholder="ABCD-EF23" submitLabel={v.isBusy ? 'et øjeblik…' : 'Forbind →'} autoFocus onSubmit={value => void joinOffice($, value)} />,
      ])
      const newCard = card('new-card', [
        title('t', 'Nyt kontor'),
        hint('d', 'Du får en kode, som andre kan forbinde med.'),
        <Input key="new-office" placeholder="Fx Copenhagen Data" submitLabel={v.isBusy ? 'et øjeblik…' : 'Opret →'} onSubmit={value => void createOffice($, value)} />,
      ])
      const nameCard = card('name-card', [
        title('t', 'Skift dit navn'),
        hint('d', `Lige nu hedder du ${f.name ?? ''}.`),
        <Input key="rename" placeholder={f.name ?? 'Dit navn'} submitLabel="Gem →" autoFocus onSubmit={value => void setName($, value)} />,
      ])
      const me = (
        <Box key="me" flexDirection="row" alignItems="center" gap={1}>
          <Text color={softInk}>{`👤 ${f.name ?? ''}`}</Text>
          <Button key="rename-toggle" label="✏️" plain dimColor onPress={toggle('name')} />
        </Box>
      )

      if (!office) {
        return (
          <Box flexDirection="column" gap={1} paddingX={1} paddingY={1}>
            {brand(`Hej ${f.name ?? ''}! Forbind til et kontor, eller opret dit eget.`)}
            {joinCard}
            {newCard}
            {v.mode === 'name' ? nameCard : null}
            {error}
            <Box flexDirection="row" justifyContent="flex-end">
              {me}
            </Box>
          </Box>
        )
      }

      const codeCard = card('code-card', [
        title('t', `Inviter til ${office.name}`),
        hint('d', 'Send koden. Kollegaen installerer Agent-kontor og forbinder med den.'),
        <Box key="code" flexDirection="row" alignItems="center" gap={1} flexWrap="wrap">
          <Box borderStyle="round" borderColor={accent} paddingX={2}>
            <Text color={accent} bold>
              {office.invite_code}
            </Text>
          </Box>
          {pill('copy-code', '📋 Kopiér kode', false, press =>
            $.ui.copy({ text: office.invite_code, surface: press.surface }).then(() => $.ui.toast('Koden er kopieret')),
          )}
          {pill('copy-invite', '✉️ Kopiér invitation', false, press =>
            $.ui
              .copy({
                text: [
                  `Kom med i kontoret "${office.name}" 🏢`,
                  '',
                  `1. Installér Agent-kontor i Claude: https://github.com/${REPO}`,
                  `2. Skriv /kontor forbind ${office.invite_code}`,
                ].join('\n'),
                surface: press.surface,
              })
              .then(() => $.ui.toast('Invitationen er kopieret')),
          )}
        </Box>,
        <Button key="leave" label="Forlad kontoret" plain dimColor onPress={() => leaveOffice($)} />,
      ])
      const modeCard = v.mode === 'join' ? joinCard : v.mode === 'new' ? newCard : v.mode === 'name' ? nameCard : v.mode === 'code' ? codeCard : null

      const toolbar = (
        <Box flexDirection="row" gap={1} alignItems="center" flexWrap="wrap">
          {f.offices.map(o => pill(`pill-${o.id}`, o.name, o.id === f.officeId, () => openOffice($, o.id)))}
          {pill('pill-new', '＋ Nyt', v.mode === 'new', toggle('new'))}
          {pill('pill-join', '⇥ Forbind', v.mode === 'join', toggle('join'))}
          <Box flexGrow={1} />
          {pill('pill-invite', '🔗 Inviter', v.mode === 'code', toggle('code'))}
        </Box>
      )

      const hour = new Date(await $.clock.now()).getHours()
      const agents = f.people.flatMap(p => p.agents.filter(a => !a.parent_id).map(a => ({ person: p, agent: a })))
      const order: AgentState[] = ['waiting', 'editing', 'running', 'reading', 'browsing', 'working', 'idle']
      agents.sort((x, y) => order.indexOf(x.agent.state) - order.indexOf(y.agent.state))

      const roster = agents.map(({ person, agent }) => {
        const subs = person.agents.filter(s => s.parent_id === agent.id).length
        const figures = [
          agent.lines_added || agent.lines_removed ? `+${agent.lines_added} −${agent.lines_removed}` : null,
          agent.cost_usd !== null ? `$${Number(agent.cost_usd).toFixed(2)}` : null,
          agent.five_hour !== null ? `5t ${Math.round(Number(agent.five_hour))}%` : null,
          subs ? `${subs} ${subs === 1 ? 'subagent' : 'subagenter'}` : null,
        ]
          .filter(Boolean)
          .join(' · ')

        return (
          <Box key={`a-${agent.id}`} flexDirection="row" alignItems="center" gap={1} borderStyle="round" borderColor={agent.state === 'waiting' ? '#F2B8B5' : cloud} paddingX={1}>
            <Text>{stateIcon[agent.state]}</Text>
            <Box flexDirection="column" flexGrow={1} flexShrink={1}>
              <Text color={ink} bold>
                {`${person.name} · ${agent.project}`}
              </Text>
              <Text color={agent.state === 'waiting' ? '#E0567A' : softInk} wrap="truncate-end">
                {`${stateLabel[agent.state]}${agent.detail && agent.state !== 'idle' ? ` · ${agent.detail}` : ''}`}
              </Text>
            </Box>
            {figures ? <Text color={softInk}>{figures}</Text> : null}
          </Box>
        )
      })

      const scene = Svg ? (
        <Svg
          source={officeSvg(office, f.people, hour)}
          alt={`${office.name}: ${agents.map(a => `${a.person.name} ${stateLabel[a.agent.state]}`).join(', ') || 'ingen agenter online'}`}
          isInteractive
        />
      ) : null

      return (
        <Box flexDirection="column" gap={1} paddingX={1} paddingY={1}>
          {toolbar}
          {modeCard}
          {scene}
          {error}
          {roster.length > 0 ? (
            <Box flexDirection="column" gap={0}>
              {roster}
            </Box>
          ) : (
            <Text color={softInk} wrap="wrap">
              Ingen agenter online lige nu. Når nogen i kontoret starter en Claude-session, sætter deres agent sig ved skrivebordet.
            </Text>
          )}
          <Box flexDirection="row" alignItems="center" gap={1}>
            <Text color={softInk}>{`${office.members} ${office.members === 1 ? 'medlem' : 'medlemmer'} · kode ${office.invite_code}`}</Text>
            <Box flexGrow={1} />
            {me}
          </Box>
        </Box>
      )
    } catch (err) {
      const { Box, Button, Text } = $.ui.resolve(e)
      return (
        <Box flexDirection="column" gap={1} paddingX={1} paddingY={1}>
          <Text color={accent} bold>
            🏢 Agent-kontor
          </Text>
          <Text wrap="wrap">Kontoret kunne ikke tegnes.</Text>
          <Text dimColor wrap="wrap">{err instanceof Error ? err.message : String(err)}</Text>
          <Button key="retry" label="Prøv igen" onPress={() => enter($)} />
        </Box>
      )
    }
  })
}
