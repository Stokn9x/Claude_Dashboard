import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionMeasureInput, SessionUsage } from 'claude-code'

import type { Limit, Stats, Usage } from '../types'

const TICK_MS = 30_000
const KEEP_TURNS = 24

const usage = atom({ plugin: 'session-dashboard', key: 'usage' } as const, null as Usage | null)
const stats = atom(
  { plugin: 'session-dashboard', key: 'stats' } as const,
  {
    turns: 0,
    tools: {},
    tokensIn: 0,
    tokensOut: 0,
    cacheRead: 0,
    cacheWrite: 0,
    perTurn: [],
    model: null,
    linesAdded: 0,
    linesRemoved: 0,
    files: [],
  } as Stats,
)
const isOpen = atom({ plugin: 'session-dashboard', key: 'isOpen' } as const, true)
const now = atom({ plugin: 'session-dashboard', key: 'now' } as const, 0)

type $ = EngineInterface

// ─── Collecting ─────────────────────────────────────────────────────────

const toUsage = (u: Pick<SessionUsage, 'context' | 'rateLimits' | 'cost'>, startedAt: number): Usage => ({
  startedAt,
  contextTokens: u.context.tokens ?? null,
  contextWindow: u.context.window,
  contextPercent: u.context.percent ?? null,
  limits: u.rateLimits.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt ?? null })),
  costUsd: u.cost?.usd ?? null,
})

const refresh = async ($: $) => {
  const u = await $.session.usage()
  await update($, usage, () => toUsage(u, u.startedAt))
  await update($, now, () => 0)
}

const measured = async ($: $, e: SessionMeasureInput) => {
  const startedAt = (await read($, usage))?.startedAt ?? (await $.session.usage()).startedAt
  await update($, usage, () => toUsage(e, startedAt))
}

type Patch = { lines: string[] }[]

// Lines a diff adds and removes, from the hunks the edit tools return.
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

const addCode = ($: $, file: string, added: number, removed: number) =>
  update($, stats, s => ({
    ...s,
    linesAdded: s.linesAdded + added,
    linesRemoved: s.linesRemoved + removed,
    files: s.files.includes(file) ? s.files : [...s.files, file],
  }))

// ─── Formatting ─────────────────────────────────────────────────────────

const short = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M` : n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n)

const money = (usd: number | null) => (usd === null ? '–' : usd < 100 ? `$${usd.toFixed(2)}` : `$${Math.round(usd)}`)

const duration = (ms: number) => {
  const minutes = Math.max(0, Math.floor(ms / 60_000))
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} t ${minutes % 60} m`
}

const limitName = (kind: string) =>
  kind === 'five_hour' ? '5 timer' : kind === 'seven_day' ? '7 dage' : kind.replace(/_/g, ' ')

const resetTime = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ─── Look ───────────────────────────────────────────────────────────────

const accent = '#1E7FC9'
const lagoon = '#17A398'
const warn = '#E8A33D'
const danger = '#E0567A'
const ink = '#14212E'
const softInk = '#5B6B7A'
const sky = '#F2F8FD'
const skyLine = '#CFE3F5'
const track = '#E3ECF4'
const plus = '#1E9E6A'
const minus = '#D64545'
const FONT = 'Segoe UI, system-ui, -apple-system, sans-serif'

const levelColor = (pct: number | null) => (pct === null ? accent : pct >= 95 ? danger : pct >= 80 ? warn : accent)

const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// One row of six small cells: about as tall as two lines of text.
const W = 640
const H = 54
const CELLS = 6
const CELL_GAP = 8
const CELL_W = (W - CELL_GAP * (CELLS - 1)) / CELLS

const cell = (index: number, label: string, inner: string) => `<g transform="translate(${index * (CELL_W + CELL_GAP)} 0)">
    <rect width="${CELL_W}" height="${H}" rx="12" fill="#FFFFFF" stroke="${skyLine}"/>
    <text x="12" y="17" font-family="${FONT}" font-size="9" font-weight="700" letter-spacing="1.3" fill="${softInk}">${esc(label)}</text>
    ${inner}
  </g>`

const value = (x: number, y: number, text: string, color = ink, size = 17) =>
  `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="700" fill="${color}">${esc(text)}</text>`

const note = (x: number, y: number, text: string, color = softInk) =>
  `<text x="${x}" y="${y}" font-family="${FONT}" font-size="10" fill="${color}">${esc(text)}</text>`

const miniRing = (cx: number, cy: number, r: number, pct: number | null) => {
  const c = 2 * Math.PI * r
  const p = Math.max(0, Math.min(100, pct ?? 0))

  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${track}" stroke-width="4"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${levelColor(pct)}" stroke-width="4" stroke-linecap="round"
      stroke-dasharray="${((p / 100) * c).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${cx} ${cy})"/>`
}

const miniBar = (x: number, y: number, w: number, pct: number) => {
  const p = Math.max(0, Math.min(100, pct))

  return `<rect x="${x}" y="${y}" width="${w}" height="4" rx="2" fill="${track}"/>
    <rect x="${x}" y="${y}" width="${Math.max(3, (p / 100) * w).toFixed(1)}" height="4" rx="2" fill="${levelColor(p)}"/>`
}

const limitCell = (index: number, l: Limit | undefined, label: string) =>
  cell(
    index,
    label,
    l
      ? `${value(12, 37, `${Math.round(l.percentUsed)}%`, levelColor(l.percentUsed))}
         ${l.resetsAt ? note(CELL_W - 10, 36, `↻ ${resetTime(l.resetsAt)}`).replace('<text ', '<text text-anchor="end" ') : ''}
         ${miniBar(12, 44, CELL_W - 24, l.percentUsed)}`
      : `${value(12, 37, '–', softInk)}${note(12, 48, 'efter første svar')}`,
  )

const dashboardSvg = (u: Usage | null, s: Stats, elapsedMs: number) => {
  const pct = u?.contextPercent ?? null
  const fiveHour = u?.limits.find(l => l.kind === 'five_hour')
  const sevenDay = u?.limits.find(l => l.kind === 'seven_day')
  const added = `+${short(s.linesAdded)}`

  const context = cell(
    0,
    'KONTEKST',
    `${miniRing(CELL_W - 22, 32, 11, pct)}
     ${value(12, 37, pct === null ? '–' : `${Math.round(pct)}%`, levelColor(pct))}
     ${note(12, 48, `${short(u?.contextTokens ?? 0)}/${short(u?.contextWindow ?? 0)}`)}`,
  )
  const cost = cell(3, 'PRIS', `${value(12, 37, money(u?.costUsd ?? null))}${note(12, 48, 'hele sessionen')}`)
  const code = cell(
    4,
    'KODE',
    `${value(12, 37, added, plus, 15)}
     <text x="${12 + added.length * 9 + 6}" y="37" font-family="${FONT}" font-size="15" font-weight="700" fill="${minus}">−${esc(short(s.linesRemoved))}</text>
     ${note(12, 48, `${s.files.length} ${s.files.length === 1 ? 'fil' : 'filer'}`)}`,
  )
  const session = cell(
    5,
    'SESSION',
    `${value(12, 37, duration(elapsedMs), ink, 15)}
     ${note(12, 48, `${s.turns} ${s.turns === 1 ? 'tur' : 'ture'} · ${short(s.tokensOut)} ud`)}`,
  )

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  ${context}${limitCell(1, fiveHour, '5 TIMER')}${limitCell(2, sevenDay, '7 DAGE')}${cost}${code}${session}
</svg>`
}

// ─── Hooks ──────────────────────────────────────────────────────────────

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'dashboard', description: 'Vis eller skjul session-dashboardet over prompten' })
    void refresh($).catch(() => {})
    $.clock.every(TICK_MS, () => {
      void update($, now, n => n + 1).catch(() => {})
    })

    return next(e)
  })

  on('command.run', { command: 'dashboard' }, async $ => {
    const open = await update($, isOpen, o => !o)
    void refresh($).catch(() => {})

    return { text: open ? 'Dashboardet er vist 📊' : 'Dashboardet er skjult. /dashboard viser det igen.' }
  })

  on('session.measure', async ($, e, next) => {
    await measured($, e).catch(() => {})

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    const u = e.usage
    if (u) {
      const total = u.input_tokens + u.output_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens
      await update($, stats, s => ({
        ...s,
        turns: s.turns + 1,
        tokensIn: s.tokensIn + u.input_tokens,
        tokensOut: s.tokensOut + u.output_tokens,
        cacheRead: s.cacheRead + u.cache_read_input_tokens,
        cacheWrite: s.cacheWrite + u.cache_creation_input_tokens,
        perTurn: [...s.perTurn, total].slice(-KEEP_TURNS),
        model: u.model,
      }))
    } else {
      await update($, stats, s => ({ ...s, turns: s.turns + 1 }))
    }

    return result
  })

  on('tool.call', ($, e, next) => {
    void update($, stats, s => ({ ...s, tools: { ...s.tools, [e.tool]: (s.tools[e.tool] ?? 0) + 1 } })).catch(() => {})

    return next(e)
  })

  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    const ran = await next(e)
    if ('result' in ran && ran.result && !ran.isError && !ran.result.staged) {
      const { added, removed } = countPatch(ran.result.structuredPatch)
      await addCode($, ran.result.filePath, added, removed).catch(() => {})
    }

    return ran
  })

  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const ran = await next(e)
    if ('result' in ran && ran.result && !ran.isError && !ran.result.staged) {
      const r = ran.result
      const counted = r.type === 'create' || r.structuredPatch.length === 0 && r.originalFile === null
        ? { added: countLines(r.content), removed: 0 }
        : countPatch(r.structuredPatch)
      await addCode($, r.filePath, counted.added, counted.removed).catch(() => {})
    }

    return ran
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const u = await read($, usage)
    const s = await read($, stats)
    const open = await read($, isOpen)
    await read($, now)
    const elapsed = u ? (await $.clock.now()) - u.startedAt : 0
    const toggle = () => update($, isOpen, o => !o)
    const pct = u?.contextPercent ?? null
    const fiveHour = u?.limits.find(l => l.kind === 'five_hour') ?? u?.limits[0]

    const summary = [
      `${pct === null ? '–' : `${Math.round(pct)}%`} kontekst`,
      fiveHour ? `${limitName(fiveHour.kind)} ${Math.round(fiveHour.percentUsed)}%` : null,
      money(u?.costUsd ?? null),
      `+${short(s.linesAdded)} −${short(s.linesRemoved)}`,
    ]
      .filter(Boolean)
      .join('  ·  ')

    if (e.surface === 'desktop' || e.surface === 'vscode') {
      const { Box, Button, Svg, Text } = $.ui.resolve(e)

      if (!open) {
        return (
          <Box key="dash-closed" flexDirection="row" alignItems="center" gap={1} borderStyle="round" borderColor={skyLine} backgroundColor={sky} paddingX={2}>
            <Text color={ink}>{`📊  ${summary}`}</Text>
            <Box flexGrow={1} />
            <Button key="dash-open" label="▾ Vis" plain dimColor onPress={toggle} />
          </Box>
        )
      }

      return (
        <Box key="dash" flexDirection="row" alignItems="center" gap={1}>
          <Box flexGrow={1} flexShrink={1}>
            <Svg source={dashboardSvg(u, s, elapsed)} alt={`Session: ${summary}`} />
          </Box>
          <Button key="dash-close" label="▴" plain dimColor onPress={toggle} />
        </Box>
      )
    }

    if (e.surface !== 'terminal') return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const meter = (p: number | null, width = 10) => {
      const filled = Math.round(((p ?? 0) / 100) * width)
      return { on: '▰'.repeat(filled), off: '▱'.repeat(width - filled) }
    }
    const ctx = meter(pct)

    if (!open) {
      return (
        <Box>
          <Text color={accent}>{`📊 ${summary} `}</Text>
          <Button key="dash-open" label="vis" plain dimColor onPress={toggle} />
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        <Box>
          <Text color={softInk}>{'Kontekst '}</Text>
          <Text color={levelColor(pct)}>{ctx.on}</Text>
          <Text color={track}>{ctx.off}</Text>
          <Text bold>{` ${pct === null ? '–' : `${Math.round(pct)}%`}`}</Text>
          {(u?.limits ?? []).slice(0, 2).map(l => {
            const m = meter(l.percentUsed, 6)
            return (
              <Box key={`lim-${l.kind}`}>
                <Text color={softInk}>{`   ${limitName(l.kind)} `}</Text>
                <Text color={levelColor(l.percentUsed)}>{m.on}</Text>
                <Text color={track}>{m.off}</Text>
                <Text bold>{` ${Math.round(l.percentUsed)}%`}</Text>
              </Box>
            )
          })}
          <Text>{`   ${money(u?.costUsd ?? null)}`}</Text>
        </Box>
        <Box>
          <Text color={plus}>{`+${short(s.linesAdded)} `}</Text>
          <Text color={minus}>{`−${short(s.linesRemoved)}`}</Text>
          <Text color={softInk}>
            {` · ${s.files.length} filer · ${short(s.tokensOut)} tokens ud · ${duration(elapsed)} · ${s.turns} ture `}
          </Text>
          <Button key="dash-close" label="skjul" plain dimColor onPress={toggle} />
        </Box>
      </Box>
    )
  })
}
