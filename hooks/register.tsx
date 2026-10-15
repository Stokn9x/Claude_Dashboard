import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement } from 'claude-code'

import type { Activity, AgentState, Office, Phase, Sub } from '../types'

// A pixel office for this session alone, seen from above: Claude at the big
// desk, its subagents at the six desks of the team room. Nothing leaves the
// machine.

const PANE = 'kontor'
const SEATS = 6
// Walking pace, in scene units a second, and how long a helper stands at
// Claude's desk with its result.
const SPEED = 90
const HANDOVER_MS = 2600

const thinking: Activity = { state: 'working', detail: 'Tænker' }
const pause: Activity = { state: 'idle', detail: 'Holder pause' }

const office = atom(
  { plugin: 'agent-kontor', key: 'office' } as const,
  {
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
  } as Office,
)

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
      ? { ...o, subs: o.subs.map(s => (s.id === agentId ? { ...s, activity } : s)) }
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
const deliver = async ($: $, id: string) => {
  const now = await $.clock.now()
  let seat: number | null = null
  await update($, office, o => ({
    ...o,
    subs: o.subs.map(s => {
      if (s.id !== id) return s
      seat = s.seat
      return { ...s, phase: 'delivering' as Phase, since: now, activity: { state: 'working' as AgentState, detail: `Afleverer: ${s.task}` } }
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
        $.clock.after(walkMs(leavePath()), gone)
      })(),
    )
  })
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
  $.clock.after(14_000 + demoTasks.length * 2600 + 16_000, () => void quietly(setMain($, pause)))
}

// ─── Pixels ─────────────────────────────────────────────────────────────

const P = 3 // one sprite pixel, in scene units

// A person facing us, 10 × 14 pixels. o outline, h hair, H hair light,
// s skin, e eye, t shirt, T shirt shade, p trousers, b shoes.
const BODY = [
  '..oooooo..',
  '.ohhhhhho.',
  'ohhHhhhhho',
  'ohssssssho',
  'ohsessesho',
  '.osssssso.',
  '.otttttTo.',
  'otttttttTo',
  'otttttttTo',
  'osttttttso',
]
// The same person from behind, and in profile facing right (mirrored for left).
const BACK = [
  '..oooooo..',
  '.ohhhhhho.',
  'ohhHhhhhho',
  'ohhhhhhhho',
  'ohhhhhhhho',
  '.ohhhhhho.',
  '.otttttTo.',
  'otttttttTo',
  'otttttttTo',
  'osttttttso',
]
const SIDE = [
  '..ooooo...',
  '.ohhhhhoo.',
  'ohHhhhhhho',
  'ohhhsssso.',
  'ohhsseso..',
  '.ohsssso..',
  '..otttTo..',
  '.ottttTo..',
  '.ottttTo..',
  '..osttso..',
]

const LEGS_A = ['.oppppppo.', '.opo..opo.', '.obo..obo.', '.oo....oo.']
// Walking, four frames: a step, passing, the other step, passing.
const FRONT_WALK = [
  ['.oppppppo.', '.opo..opo.', '.obo..oo..', '.oo.......'],
  LEGS_A,
  ['.oppppppo.', '.opo..opo.', '..oo..obo.', '.......oo.'],
  LEGS_A,
]
const SIDE_STAND = ['..opppo...', '..oppo....', '..obbo....', '..oooo....']
const SIDE_WALK = [
  ['..opppo...', '.op..po...', 'ob....bo..', 'oo....oo..'],
  SIDE_STAND,
  ['..opppo...', '.op..po...', 'ob....bo..', 'oo....oo..'],
  SIDE_STAND,
]

type Look = { hair: string; hairLight: string; skin: string; shirt: string; shirtShade: string }

const OUTLINE = '#2B2230'
const skins = ['#F6D5B8', '#EFC39C', '#D9A06B', '#B9784A', '#8A5634']
const hairs: [string, string][] = [
  ['#3A2A22', '#5C4436'],
  ['#7A4B2A', '#9C6A43'],
  ['#D9B25C', '#F0D48A'],
  ['#2B2B33', '#4A4A57'],
  ['#B5523B', '#D27358'],
  ['#9AA0A8', '#C3C8CE'],
]
const shirts: [string, string][] = [
  ['#3E7CC9', '#2F5F9C'],
  ['#2E9E8F', '#21776B'],
  ['#E07A4F', '#B85E38'],
  ['#8A6FD6', '#6A52AE'],
  ['#D6A23C', '#AD7F26'],
  ['#D45D7A', '#AC4560'],
  ['#4F9A5B', '#3A7644'],
]

const lookFor = (id: string): Look => {
  const h = hashOf(id)
  const [hair, hairLight] = hairs[h % hairs.length] as [string, string]
  const [shirt, shirtShade] = shirts[(h >>> 3) % shirts.length] as [string, string]
  return { hair, hairLight, skin: skins[(h >>> 6) % skins.length] as string, shirt, shirtShade }
}

// Claude wears its own colours.
const claudeLook: Look = { hair: '#C8643B', hairLight: '#E3875E', skin: '#F6D5B8', shirt: '#2F3A4A', shirtShade: '#222B37' }

const paint = (rows: string[], look: Look, x: number, y: number) => {
  const colour: Record<string, string> = {
    o: OUTLINE,
    h: look.hair,
    H: look.hairLight,
    s: look.skin,
    e: OUTLINE,
    t: look.shirt,
    T: look.shirtShade,
    p: '#3B4A6B',
    b: OUTLINE,
  }
  let out = ''
  rows.forEach((row, r) => {
    let c = 0
    while (c < row.length) {
      const ch = row[c] as string
      let end = c
      while (end < row.length && row[end] === ch) end++
      const fill = colour[ch]
      if (fill) out += `<rect x="${x + c * P}" y="${y + r * P}" width="${(end - c) * P}" height="${P}" fill="${fill}"/>`
      c = end
    }
  })
  return out
}

type Pose = { seated?: boolean; handUp?: boolean; mug?: boolean }

type Facing = 'front' | 'back' | 'left' | 'right'

const STEP_S = 0.52

// A whole person on their feet at (0, 0), facing a way, walking or still.
const figure = (look: Look, facing: Facing, isWalking: boolean) => {
  const body = facing === 'back' ? BACK : facing === 'front' ? BODY : SIDE
  const isSide = facing === 'left' || facing === 'right'
  const frames = isWalking ? (isSide ? SIDE_WALK : FRONT_WALK) : [isSide ? SIDE_STAND : LEGS_A]
  const top = -(body.length + 4) * P
  const left = -5 * P
  const drawn = frames
    .map((legs, i) => {
      // The bob of a step: down a pixel as a foot lands, over the waist, so
      // body and legs never part.
      const lift = isWalking && i % 2 === 0 ? P : 0
      const art = paint(body, look, left, top + lift) + paint(legs, look, left, top + body.length * P)
      if (!isWalking) return art
      const values = frames.map((_, k) => (k === i ? 1 : 0)).join(';')
      return `<g opacity="${i === 0 ? 1 : 0}">${art}<animate attributeName="opacity" values="${values}" dur="${STEP_S}s" calcMode="discrete" repeatCount="indefinite"/></g>`
    })
    .join('')

  return facing === 'left' ? `<g transform="scale(-1 1)">${drawn}</g>` : drawn
}

// Feet at (x, y): the sprite stands on that point.
const person = (x: number, y: number, look: Look, pose: Pose = {}) => {
  const left = x - 5 * P
  const rows = pose.seated ? BODY.length : BODY.length + LEGS_A.length
  const top = y - rows * P
  let out = paint(BODY, look, left, top)

  if (!pose.seated) out += paint(LEGS_A, look, left, top + BODY.length * P)
  if (pose.handUp) {
    out += `<g><rect x="${left + 10 * P}" y="${top + 0 * P}" width="${2 * P}" height="${8 * P}" fill="${OUTLINE}"/>
      <rect x="${left + 10 * P}" y="${top + 1 * P}" width="${P}" height="${2 * P}" fill="${look.skin}"/>
      <rect x="${left + 10 * P}" y="${top + 3 * P}" width="${P}" height="${4 * P}" fill="${look.shirt}"/>
      <animateTransform attributeName="transform" type="translate" values="0 0;1 -1;0 0" dur="0.7s" repeatCount="indefinite"/></g>`
  }
  if (pose.mug) {
    const mx = left + 10 * P
    const my = top + 7 * P
    out += `<rect x="${mx}" y="${my}" width="${4 * P}" height="${4 * P}" fill="${OUTLINE}"/><rect x="${mx + P}" y="${my + P}" width="${2 * P}" height="${2 * P}" fill="#FFFFFF"/>
      <rect x="${mx + P}" y="${my + P}" width="${2 * P}" height="${P / 2}" fill="#7A4A2A"/>
      ${[0, 1].map(i => `<rect x="${mx + P + i * P}" y="${my - 3 * P}" width="${P / 2}" height="${2 * P}" fill="#FFFFFF" opacity="0.7"><animate attributeName="y" values="${my - 2 * P};${my - 6 * P}" dur="${1.4 + i * 0.3}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.7;0" dur="${1.4 + i * 0.3}s" repeatCount="indefinite"/></rect>`).join('')}`
  }

  return out
}

// ─── The floor plan ─────────────────────────────────────────────────────

const W = 480
const H = 384
const FONT = 'Segoe UI, system-ui, -apple-system, sans-serif'
const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

const WALL = '#3E4852'
const WALL_TOP = '#5A6672'

// Team desks: three across, two rows.
const seatAt = (seat: number) => ({ cx: 92 + (seat % 3) * 148, dy: 202 + Math.floor(seat / 3) * 102 })
const DOOR = { x: 424, y: 382 }
const MAIN = { cx: 128, dy: 78 }
const HANDOFF = { x: 214, y: 104 }
const KITCHEN_SEAT = { x: 318, y: 112 }

const screens: Record<AgentState, string> = {
  working: '#5E6B7A',
  reading: '#E9EEF2',
  editing: '#1F2A44',
  running: '#0F1418',
  browsing: '#D7E9FA',
  waiting: '#E5484D',
  idle: '#1B2433',
}

const screenLines = (x: number, y: number, state: AgentState) => {
  if (state === 'editing') return `<g>${[0, 1, 2].map(i => `<rect x="${x + 2 + (i % 2) * 2}" y="${y + 2 + i * 3}" width="${8 - i * 2}" height="1.5" fill="${['#7FB4F0', '#E8A33D', '#9BD58B'][i]}"/>`).join('')}<animateTransform attributeName="transform" type="translate" values="0 0;0 -1;0 0" dur="1.2s" calcMode="discrete" repeatCount="indefinite"/></g>`
  if (state === 'running') return `<rect x="${x + 2}" y="${y + 2}" width="7" height="1.5" fill="#3DDC84"/><rect x="${x + 2}" y="${y + 6}" width="2" height="2" fill="#3DDC84"><animate attributeName="opacity" values="1;0" dur="0.8s" calcMode="discrete" repeatCount="indefinite"/></rect>`
  if (state === 'reading') return [0, 1, 2].map(i => `<rect x="${x + 2}" y="${y + 2 + i * 3}" width="${10 - (i % 2) * 3}" height="1.5" fill="#AEB8C2"/>`).join('')
  if (state === 'browsing') return `<rect x="${x}" y="${y}" width="14" height="2.5" fill="#3E7CC9"/><rect x="${x + 2}" y="${y + 4}" width="6" height="4" fill="#9CC4EC"/>`
  if (state === 'waiting') return `<rect x="${x + 6}" y="${y + 2}" width="2" height="5" fill="#FFFFFF"/><rect x="${x + 6}" y="${y + 8}" width="2" height="2" fill="#FFFFFF"/>`
  return ''
}

// The chair's back shows above the sitter's shoulders.
const chairSprite = (cx: number, dy: number) =>
  `<rect x="${cx - 21}" y="${dy - 18}" width="42" height="22" rx="5" fill="${OUTLINE}"/><rect x="${cx - 19}" y="${dy - 16}" width="38" height="18" rx="4" fill="#465566"/><rect x="${cx - 17}" y="${dy - 14}" width="34" height="3" rx="1.5" fill="#5A6B7E"/>`

const monitor = (x: number, dy: number, state: AgentState | null) =>
  `<rect x="${x - 1}" y="${dy + 1}" width="22" height="16" fill="${OUTLINE}"/>
    <rect x="${x}" y="${dy + 2}" width="20" height="13" fill="${state ? screens[state] : '#141A22'}"/>
    ${state ? screenLines(x + 2, dy + 4, state) : ''}
    <rect x="${x + 8}" y="${dy + 17}" width="4" height="3" fill="${OUTLINE}"/>`

const deskSprite = (cx: number, dy: number, w: number, state: AgentState | null, monitors = 1) => {
  const left = cx - w / 2
  return `<rect x="${left + 3}" y="${dy + 4}" width="${w}" height="28" rx="2" fill="#000000" opacity="0.13"/>
    <rect x="${left - 1}" y="${dy - 1}" width="${w + 2}" height="30" rx="2" fill="${OUTLINE}"/>
    <rect x="${left}" y="${dy}" width="${w}" height="22" fill="#E4C79C"/>
    <rect x="${left}" y="${dy}" width="${w}" height="2" fill="#F1DBB8"/>
    <rect x="${left}" y="${dy + 22}" width="${w}" height="6" fill="#B98F5E"/>
    ${monitor(cx + w / 2 - 28, dy, state)}${monitors > 1 ? monitor(cx - w / 2 + 8, dy, state) : ''}
    <rect x="${cx - 12}" y="${dy + 12}" width="24" height="7" rx="1" fill="#D3D8DD" stroke="${OUTLINE}" stroke-width="1"/>
    <rect x="${cx - 9}" y="${dy + 14}" width="18" height="1" fill="#AEB6BF"/><rect x="${cx - 9}" y="${dy + 16}" width="18" height="1" fill="#AEB6BF"/>`
}

// Hands on the keyboard, drawn over the desk; they tap while the agent works.
const hands = (cx: number, dy: number, look: Look, isTyping: boolean) =>
  `<g><rect x="${cx - 11}" y="${dy + 9}" width="7" height="5" fill="${OUTLINE}"/><rect x="${cx - 10}" y="${dy + 10}" width="5" height="3" fill="${look.skin}"/>
    <rect x="${cx + 4}" y="${dy + 9}" width="7" height="5" fill="${OUTLINE}"/><rect x="${cx + 5}" y="${dy + 10}" width="5" height="3" fill="${look.skin}"/>
    ${isTyping ? '<animateTransform attributeName="transform" type="translate" values="0 0;0 -1.5;0 0;0 -0.5" dur="0.3s" calcMode="discrete" repeatCount="indefinite"/>' : ''}</g>`

const plant = (x: number, y: number, big = false) => {
  const r = big ? 9 : 7
  return `<rect x="${x - 5}" y="${y}" width="10" height="8" fill="#B5683E" stroke="${OUTLINE}" stroke-width="1"/>
    <circle cx="${x}" cy="${y - 2}" r="${r}" fill="#3E8A55" stroke="${OUTLINE}" stroke-width="1"/>
    <circle cx="${x - r / 2}" cy="${y - 4}" r="${r / 2}" fill="#56A86B"/><circle cx="${x + r / 3}" cy="${y - r}" r="${r / 3}" fill="#6CC082"/>`
}

const bubble = (cx: number, bottom: number, text: string, isAlert = false) => {
  const label = clip(text, 26)
  const w = Math.round(label.length * 4.9 + 14)
  const x = Math.round(cx - w / 2)
  const y = bottom - 16
  const fill = isAlert ? '#E5484D' : '#FFFFFF'
  const ink = isAlert ? '#FFFFFF' : OUTLINE
  return `<g>${isAlert ? '<animate attributeName="opacity" values="1;0.55;1" dur="0.9s" repeatCount="indefinite"/>' : ''}
    <rect x="${x}" y="${y}" width="${w}" height="14" rx="3" fill="${fill}" stroke="${OUTLINE}" stroke-width="1.5"/>
    <path d="M${cx - 3} ${y + 13.5} L${cx} ${y + 18} L${cx + 3} ${y + 13.5} Z" fill="${fill}" stroke="${OUTLINE}" stroke-width="1.5" stroke-linejoin="round"/>
    <rect x="${cx - 2.5}" y="${y + 12}" width="5" height="2" fill="${fill}"/>
    <text x="${cx}" y="${y + 10}" text-anchor="middle" font-family="${FONT}" font-size="8.5" font-weight="600" fill="${ink}">${esc(label)}</text></g>`
}

const tag = (cx: number, y: number, text: string, colour = OUTLINE) => {
  const w = Math.round(text.length * 4.6 + 10)
  return `<rect x="${cx - w / 2}" y="${y}" width="${w}" height="11" rx="5.5" fill="${colour}" opacity="0.88"/>
    <text x="${cx}" y="${y + 8}" text-anchor="middle" font-family="${FONT}" font-size="7.5" font-weight="700" fill="#FFFFFF">${esc(text)}</text>`
}

// Where a walk goes, as points the feet pass through.
const path = (points: { x: number; y: number }[]) => points.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ')

const arrivePath = (seat: number) => {
  const { cx, dy } = seatAt(seat)
  const lane = dy - 52
  return [DOOR, { x: DOOR.x, y: 256 }, { x: cx + 74, y: 256 }, { x: cx + 74, y: lane }, { x: cx, y: lane }, { x: cx, y: dy - 6 }]
}
const deliverPath = (seat: number) => {
  const { cx, dy } = seatAt(seat)
  const lane = dy - 52
  return [{ x: cx, y: dy - 6 }, { x: cx, y: lane }, { x: cx + 74, y: lane }, { x: cx + 74, y: 148 }, { x: 214, y: 148 }, HANDOFF]
}
const leavePath = () => [HANDOFF, { x: 214, y: 148 }, { x: DOOR.x, y: 148 }, DOOR]

type Point = { x: number; y: number }

const legSeconds = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y) / SPEED
const walkMs = (points: Point[]) => Math.round(points.slice(1).reduce((t, p, i) => t + legSeconds(points[i] as Point, p), 0) * 1000) + 150
const facingOf = (a: Point, b: Point): Facing =>
  Math.abs(b.x - a.x) > Math.abs(b.y - a.y) ? (b.x > a.x ? 'right' : 'left') : b.y > a.y ? 'front' : 'back'
const sec = (n: number) => `${n.toFixed(2)}s`

// A walk drawn as its straight legs: each leg shows only while it is walked,
// faces its own way, and starts where the clock says the walk has got to.
const walker = (sub: Sub, points: Point[], now: number, endFacing: Facing | null, atEnd = '') => {
  const elapsed = (now - sub.since) / 1000
  const look = lookFor(sub.id)
  const label = tag(0, 3, sub.name, '#4A5868')
  let t = 0
  let out = ''
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i] as Point
    const b = points[i + 1] as Point
    const d = legSeconds(a, b)
    if (d <= 0) continue
    const begin = t - elapsed
    t += d
    if (begin + d < 0) continue
    out += `<g opacity="0"><set attributeName="opacity" to="1" begin="${sec(begin)}" end="${sec(begin + d)}"/>
      <g><animateMotion path="M${a.x} ${a.y} L${b.x} ${b.y}" dur="${sec(d)}" begin="${sec(begin)}" fill="freeze"/>${figure(look, facingOf(a, b), true)}${label}</g></g>`
  }
  if (endFacing) {
    const last = points[points.length - 1] as Point
    out += `<g opacity="0"><set attributeName="opacity" to="1" begin="${sec(t - elapsed)}"/>
      <g transform="translate(${last.x} ${last.y})">${figure(look, endFacing, false)}${label}${atEnd}</g></g>`
  }
  return out
}

const rooms = (hour: number, project: string) => {
  const isNight = hour < 7 || hour >= 19
  const sky = isNight ? '#16233D' : hour < 9 || hour >= 17 ? '#F4B88A' : '#A9D8F5'
  const planks = Array.from({ length: 11 }, (_, i) => `<rect x="6" y="${18 + i * 10}" width="240" height="1" fill="#C9AC7E"/>`).join('')
  const seams = Array.from({ length: 11 }, (_, i) => `<rect x="${20 + ((i * 47) % 210)}" y="${18 + i * 10}" width="1" height="10" fill="#C9AC7E"/>`).join('')
  const tiles = Array.from({ length: 19 }, (_, c) =>
    Array.from({ length: 10 }, (_, r) => ((c + r) % 2 === 0 ? `<rect x="${252 + c * 12}" y="${16 + r * 12}" width="12" height="12" fill="#E4E8EB"/>` : '')).join(''),
  ).join('')
  const carpet = Array.from({ length: 20 }, (_, c) => `<rect x="${6 + c * 24}" y="138" width="1" height="240" fill="#BCCBB8"/>`).join('') +
    Array.from({ length: 10 }, (_, r) => `<rect x="6" y="${138 + r * 24}" width="468" height="1" fill="#BCCBB8"/>`).join('')
  const windows = [30, 120, 290, 390]
    .map(x => `<rect x="${x}" y="1" width="56" height="5" fill="${sky}"/><rect x="${x + 27}" y="1" width="2" height="5" fill="${WALL_TOP}"/>`)
    .join('')

  return `<rect width="${W}" height="${H}" fill="${isNight ? '#1C2430' : '#7FB069'}"/>
    <rect x="6" y="16" width="240" height="116" fill="#DCC194"/>${planks}${seams}
    <rect x="252" y="16" width="222" height="116" fill="#F3F5F6"/>${tiles}
    <rect x="6" y="138" width="468" height="240" fill="#CBD9C7"/>${carpet}
    <rect x="0" y="0" width="${W}" height="16" fill="${WALL}"/><rect x="0" y="0" width="${W}" height="6" fill="${WALL_TOP}"/>${windows}
    <rect x="0" y="0" width="6" height="${H}" fill="${WALL}"/><rect x="${W - 6}" y="0" width="6" height="${H}" fill="${WALL}"/>
    <rect x="246" y="16" width="6" height="74" fill="${WALL}"/><rect x="246" y="122" width="6" height="16" fill="${WALL}"/>
    <rect x="0" y="132" width="196" height="6" fill="${WALL}"/><rect x="236" y="132" width="64" height="6" fill="${WALL}"/><rect x="340" y="132" width="${W - 340}" height="6" fill="${WALL}"/>
    <rect x="0" y="378" width="404" height="6" fill="${WALL}"/><rect x="444" y="378" width="${W - 444}" height="6" fill="${WALL}"/>
    <rect x="404" y="376" width="40" height="8" fill="#8C6B4A"/><rect x="408" y="366" width="32" height="10" rx="2" fill="#6E5A44"/>
    <rect x="246" y="90" width="6" height="32" fill="#CDB892"/><rect x="196" y="132" width="40" height="6" fill="#CDB892"/><rect x="300" y="132" width="40" height="6" fill="#D5DAD2"/>
    <rect x="${W / 2 - 60}" y="3" width="120" height="11" rx="2" fill="#20262E"/>
    <text x="${W / 2}" y="11.5" text-anchor="middle" font-family="${FONT}" font-size="8" font-weight="700" fill="#E9EEF2">${esc(clip(project || 'Kontoret', 26))}</text>`
}

const furniture = () => `
  <!-- Claude's corner office -->
  <rect x="52" y="40" width="152" height="86" rx="3" fill="${OUTLINE}" opacity="0.35"/><rect x="54" y="42" width="148" height="82" rx="2" fill="#6F9C8E"/>
  <rect x="58" y="46" width="140" height="74" rx="2" fill="none" stroke="#9CC2B5" stroke-width="2"/>
  ${[0, 1].map(k => `<rect x="10" y="${22 + k * 44}" width="12" height="40" fill="${OUTLINE}"/><rect x="11" y="${23 + k * 44}" width="10" height="38" fill="#8B5E3C"/>
    ${[0, 1, 2, 3, 4].map(i => `<rect x="12" y="${25 + k * 44 + i * 7}" width="8" height="5" fill="${['#D45D7A', '#3E7CC9', '#D6A23C', '#2E9E8F', '#8A6FD6'][(i + k) % 5]}"/>`).join('')}`).join('')}
  <rect x="196" y="112" width="26" height="18" rx="4" fill="${OUTLINE}"/><rect x="198" y="114" width="22" height="14" rx="3" fill="#C8643B"/><rect x="200" y="116" width="18" height="4" rx="2" fill="#E3875E"/>
  ${plant(228, 36, true)}${plant(22, 116)}
  <rect x="200" y="54" width="34" height="18" rx="2" fill="${OUTLINE}"/><rect x="201" y="55" width="32" height="16" fill="#F6F7F8"/>
  <rect x="204" y="59" width="18" height="1.5" fill="#3E7CC9"/><rect x="204" y="63" width="24" height="1.5" fill="#E07A4F"/><rect x="204" y="67" width="12" height="1.5" fill="#2E9E8F"/>

  <!-- Kitchen -->
  <rect x="256" y="18" width="150" height="16" fill="${OUTLINE}"/><rect x="257" y="19" width="148" height="14" fill="#F7F7F5"/><rect x="257" y="31" width="148" height="2" fill="#C9CED3"/>
  <rect x="266" y="20" width="14" height="12" fill="#2B2F36"/><circle cx="273" cy="26" r="2" fill="#E07A4F"/>
  <rect x="300" y="21" width="22" height="9" rx="2" fill="#B9C3CC" stroke="${OUTLINE}" stroke-width="1"/>
  <rect x="440" y="18" width="28" height="34" fill="${OUTLINE}"/><rect x="441" y="19" width="26" height="32" fill="#E9EEF2"/><rect x="441" y="33" width="26" height="1" fill="#B9C3CC"/>
  <rect x="330" y="21" width="20" height="10" fill="#9CB4C6" stroke="${OUTLINE}" stroke-width="1"/><rect x="336" y="23" width="8" height="5" fill="#D7E9FA"/>
  <circle cx="386" cy="26" r="4" fill="#E9EEF2" stroke="${OUTLINE}" stroke-width="1"/>
  ${[280, 312, 344, 376].map(x => `<circle cx="${x}" cy="44" r="5" fill="${OUTLINE}"/><circle cx="${x}" cy="44" r="3.8" fill="#C9A273"/>`).join('')}
  <circle cx="368" cy="92" r="20" fill="${OUTLINE}"/><circle cx="368" cy="92" r="18.5" fill="#C9A273"/><circle cx="368" cy="92" r="15" fill="#D9B88A"/>
  <circle cx="368" cy="92" r="6" fill="#F7F7F5" stroke="${OUTLINE}" stroke-width="1"/><circle cx="366" cy="90" r="2" fill="#E07A4F"/><circle cx="370" cy="91" r="2" fill="#D6A23C"/><circle cx="368" cy="94" r="2" fill="#56A86B"/>
  <rect x="378" y="98" width="5" height="5" fill="#FFFFFF" stroke="${OUTLINE}" stroke-width="1"/>
  ${[[368, 64], [396, 92], [368, 120]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="7" fill="${OUTLINE}"/><circle cx="${x}" cy="${y}" r="5.5" fill="#465566"/>`).join('')}
  ${plant(462, 120)}

  <!-- Team room -->
  <rect x="40" y="346" width="2" height="12" fill="${OUTLINE}"/><rect x="88" y="346" width="2" height="12" fill="${OUTLINE}"/>
  <rect x="34" y="342" width="62" height="8" fill="${OUTLINE}"/><rect x="35" y="343" width="60" height="6" fill="#F6F7F8"/>
  <rect x="38" y="344" width="14" height="1.5" fill="#3E7CC9"/><rect x="56" y="344" width="20" height="1.5" fill="#E07A4F"/><rect x="80" y="344" width="10" height="1.5" fill="#2E9E8F"/>
  <rect x="14" y="356" width="30" height="18" fill="${OUTLINE}"/><rect x="15" y="357" width="28" height="16" fill="#D3D8DD"/><rect x="19" y="360" width="20" height="3" fill="#2B2F36"/>
  ${plant(462, 150, true)}${plant(20, 150)}${plant(380, 368)}
  <circle cx="300" cy="360" r="9" fill="${OUTLINE}"/><circle cx="300" cy="360" r="7.5" fill="#E07A4F"/>
  <circle cx="324" cy="364" r="9" fill="${OUTLINE}"/><circle cx="324" cy="364" r="7.5" fill="#3E7CC9"/>
  <rect x="452" y="334" width="16" height="24" fill="${OUTLINE}"/><rect x="453" y="335" width="14" height="10" fill="#9CC4EC"/><rect x="453" y="346" width="14" height="11" fill="#E9EEF2"/>`

type Scene = { source: string; width: number; height: number }

const officeSvg = (o: Office, now: number, hour: number): Scene => {
  const main = o.main
  const isOut = main.state === 'idle'
  const mainLook = claudeLook

  // Claude: at the big desk, or with a coffee in the kitchen.
  const claude = isOut
    ? `${person(KITCHEN_SEAT.x, KITCHEN_SEAT.y, mainLook, { mug: true })}${tag(KITCHEN_SEAT.x, KITCHEN_SEAT.y + 3, 'Claude', '#C8643B')}`
    : `${person(MAIN.cx, MAIN.dy + 4, mainLook, { seated: true, handUp: main.state === 'waiting' })}`
  const mainDesk = deskSprite(MAIN.cx, MAIN.dy, 128, isOut ? null : main.state, 2) + (isOut ? '' : hands(MAIN.cx, MAIN.dy, mainLook, main.state !== 'waiting' && main.state !== 'idle'))
  const mainBubble = isOut ? '' : bubble(MAIN.cx, MAIN.dy - 30, main.detail, main.state === 'waiting')
  const mainTag = isOut ? '' : tag(MAIN.cx, MAIN.dy + 30, 'Claude', '#C8643B')

  const seated = o.subs.filter(s => s.seat >= 0 && s.phase === 'working')
  const walking = o.subs.filter(s => s.seat >= 0 && s.phase !== 'working')
  const extra = o.subs.filter(s => s.seat < 0).length

  const desks = Array.from({ length: SEATS }, (_, seat) => {
    const { cx, dy } = seatAt(seat)
    const sub = seated.find(s => s.seat === seat)
    const look = sub ? lookFor(sub.id) : null
    const sitter = sub && look ? person(cx, dy + 4, look, { seated: true, handUp: sub.activity.state === 'waiting' }) : ''
    const typing = sub && look ? hands(cx, dy, look, sub.activity.state !== 'waiting') : ''
    return `${chairSprite(cx, dy)}${sitter}${deskSprite(cx, dy, 84, sub ? sub.activity.state : null)}${typing}
      ${sub ? tag(cx, dy + 30, sub.name, '#4A5868') : ''}`
  }).join('')

  const bubbles = seated
    .map(s => {
      const { cx, dy } = seatAt(s.seat)
      return bubble(cx, dy - 30, s.activity.detail, s.activity.state === 'waiting')
    })
    .join('')

  const walkers = walking
    .map(s =>
      s.phase === 'arriving'
        ? walker(s, arrivePath(s.seat), now, 'front')
        : s.phase === 'delivering'
          ? walker(s, deliverPath(s.seat), now, 'left', bubble(0, -46, s.activity.detail))
          : walker(s, leavePath(), now, null),
    )
    .join('')

  const queue = extra > 0 ? tag(DOOR.x, 350, `+${extra} venter ved døren`, '#C8643B') : ''

  const source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" shape-rendering="crispEdges">
  <defs><clipPath id="building"><rect width="${W}" height="${H}" rx="10"/></clipPath></defs>
  <g clip-path="url(#building)">
    ${rooms(hour, o.project)}
    ${furniture()}
    ${chairSprite(MAIN.cx, MAIN.dy)}
    ${isOut ? '' : claude}
    ${mainDesk}
    ${isOut ? claude : ''}
    ${mainTag}
    ${desks}
    ${walkers}
    ${mainBubble}${bubbles}${queue}
  </g>
</svg>`

  return { source, width: W, height: H }
}

// ─── Panel ──────────────────────────────────────────────────────────────

const accent = '#2F86D6'
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

// ─── Hooks ──────────────────────────────────────────────────────────────

export const register: Register = on => {
  // spawn tool_use_id → the subagent's id, to see it out when its call ends.
  const spawned = new Map<string, string>()

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'kontor', description: 'Åbn kontoret, eller se det fyldt med /kontor demo', argumentHint: '[demo]' })
    const now = await $.clock.now()
    await update($, office, o => ({ ...o, project: base(e.cwd) || 'Kontoret', startedAt: o.startedAt || now, main: pause, subs: [] }))
    void $.ui.open({ id: PANE, title: '🏢 Kontor' })
    return next(e)
  })

  on('command.run', { command: 'kontor' }, async ($, e) => {
    await $.ui.open({ id: PANE, title: '🏢 Kontor', focus: true })
    if (e.args.trim() === 'demo') {
      await runDemo($)
      return { text: 'Seks hjælpere er på vej ind i kontoret.' }
    }
    return { text: 'Kontoret er åbent. Prøv /kontor demo for at se det fyldt.' }
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

  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    if ('agentId' in r && r.agentId) {
      spawned.set(e.tool_use_id, r.agentId)
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
      await quietly(deliver($, sub))
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
    if (!sub) await quietly(setActivity($, e.agentId, thinking))

    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    try {
      const kit = $.ui.resolve(e)
      const { Box, Text } = kit
      const Svg = 'Svg' in kit ? kit.Svg : null
      const o = await read($, office)
      const now = await $.clock.now()
      const hour = new Date(now).getHours()

      const paneWidth = Math.min(1100, Math.round(e.props.bodyColumns * 8.4))
      const scene = officeSvg(o, now, hour)
      const working = o.subs.filter(s => s.phase === 'working').length
      const alt = `Kontoret: Claude ${o.main.detail.toLowerCase()}, ${o.subs.length} hjælpere`

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
          isBusy ? s.activity.detail : `${phaseText[s.phase]}: ${s.task}`,
          isBusy ? s.activity.state : 'working',
          s.phase === 'arriving' ? `${s.task} (på vej ind)` : s.phase === 'working' ? s.task : null,
        )
      })

      return (
        <Box flexDirection="column" gap={1} paddingX={1} paddingY={1}>
          {Svg ? (
            <Svg source={scene.source} alt={alt} width={paneWidth} height={Math.round((paneWidth * scene.height) / scene.width)} isInteractive />
          ) : null}
          {o.main.state === 'waiting' ? (
            <Box borderStyle="round" borderColor="#E5484D" paddingX={2}>
              <Text color="#E5484D" wrap="wrap">{`Claude venter på dig: ${o.main.detail}`}</Text>
            </Box>
          ) : null}
          <Box flexDirection="column" gap={1}>
            {row('main', 'Claude', o.main.detail, o.main.state, figures.length ? figures.join('   ') : null)}
            {subRows}
          </Box>
          <Box flexDirection="row" gap={1}>
            <Text dimColor wrap="wrap">
              {o.subs.length === 0
                ? 'Ingen hjælpere i kontoret. Når Claude sender subagenter afsted, sætter de sig i teamrummet. Prøv /kontor demo.'
                : `${working} af ${o.subs.length} hjælpere arbejder`}
            </Text>
          </Box>
          {!Svg ? <Text color={accent}>Kontorets tegning vises i desktop-appen.</Text> : null}
        </Box>
      )
    } catch (err) {
      const { Box, Text } = $.ui.resolve(e)
      return (
        <Box flexDirection="column" gap={1} paddingX={1} paddingY={1}>
          <Text bold>Kontoret kunne ikke tegnes</Text>
          <Text dimColor wrap="wrap">{err instanceof Error ? err.message : String(err)}</Text>
        </Box>
      ) as RenderElement
    }
  })
}
