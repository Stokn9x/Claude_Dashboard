import { atom, update } from 'claude-code'
import type { Register, RenderElement } from 'claude-code'
import type { AgentState, Phase } from '../types'
import { emptyOffice, thinking, pause, readOffice, quietly } from './office'
import type { $ } from './office'
import { base, activityFor } from './activity'
import { setMain, setActivity, noteTool, arrive, deliver, TIDY_MS, tidy, sweepAgents, runDemo } from './helpers'
import { LINES_PER_EDIT, earn, partiesFor, creditCommit, celebrate, countPatch, countLines } from './earnings'
import type { Patch } from './earnings'
import { ADDRESS, WRITE_MS, READ_MS, SERVER_CHECK_MS, NO_SERVER, writeStatus, readOthers, readGame, leaveOffice, openOffice, keepServer } from './status'

// The session's office in $.state: the engine wants the reference spelled
// out in every file that reads or writes it, so each file makes its own.
const office = atom({ plugin: 'agent-kontor', key: 'office' } as const, emptyOffice)

// A pixel office, seen from above: Claude at the big desk, its subagents at
// desks in the team room. This module keeps track of who is where and writes
// it to a status file; a small server on this computer streams every
// session's file to a page that draws and animates the office. Nothing leaves
// the machine.

const PANE = 'kontor'

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
  idle: 'Holder fri',
  leaving: 'Går igen',
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
    $.clock.every(TIDY_MS, () => void quietly(tidy($)))
    $.clock.every(WRITE_MS, () => void quietly(writeStatus($)))
    $.clock.every(READ_MS, () => void quietly(readOthers($)))
    $.clock.every(READ_MS, () => void quietly(sweepAgents($)))
    $.clock.every(READ_MS, () => void quietly(readGame($)))
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
      await quietly(arrive($, r.agentId, e.description || 'En opgave', { state: 'working', detail: e.description || 'Går i gang' }, { type: e.subagentType, model: r.model }))
    }
    return r
  })

  on('tool.call', async ($, e, next) => {
    const activity = activityFor(e.tool, e as unknown as Record<string, unknown>)
    await quietly(setActivity($, e.agentId, activity))
    if (activity !== thinking) await quietly(noteTool($, e.agentId, activity))
    const ran = await next(e)

    // A call that returns with its subagent sent to the background (Ctrl+B)
    // did not finish it: SubagentStop delivers it when it is done.
    const sub = spawned.get(e.tool_use_id)
    if (sub) {
      spawned.delete(e.tool_use_id)
      const status = 'result' in ran ? (ran.result as { status?: string } | undefined)?.status : undefined
      const isSentAway = status === 'async_launched' || status === 'remote_launched'
      if (!sub.isBackground && !isSentAway) await quietly(deliver($, sub.agentId))
    }
    if (!('deny' in ran && ran.deny) && 'result' in ran && ran.result && !ran.isError && (e.tool === 'Edit' || e.tool === 'Write')) {
      const r = ran.result as { structuredPatch?: Patch; staged?: boolean; type?: string; content?: string; originalFile?: string | null }
      if (!r.staged) {
        const counted = e.tool === 'Write' && (r.type === 'create' || (r.structuredPatch?.length === 0 && r.originalFile === null))
          ? { added: countLines(r.content ?? ''), removed: 0 }
          : countPatch(r.structuredPatch)
        await quietly(
          update($, office, o => ({
            ...o,
            linesAdded: o.linesAdded + counted.added,
            linesRemoved: o.linesRemoved + counted.removed,
            earned: earn(o.earned, { added: Math.min(counted.added, LINES_PER_EDIT), removed: Math.min(counted.removed, LINES_PER_EDIT) }),
            editedSinceCommit: { added: (o.editedSinceCommit?.added ?? 0) + counted.added, removed: (o.editedSinceCommit?.removed ?? 0) + counted.removed },
            subs: o.subs.map(s =>
              s.id === e.agentId ? { ...s, linesAdded: (s.linesAdded ?? 0) + counted.added, linesRemoved: (s.linesRemoved ?? 0) + counted.removed } : s,
            ),
          })),
        )
      }
    }
    if ((e.tool === 'Bash' || e.tool === 'PowerShell') && 'result' in ran && ran.result) {
      const result = ran.result as { interrupted?: boolean; backgroundTaskId?: string }
      const command = String((e as unknown as { command?: unknown }).command ?? '')
      const parties = result.backgroundTaskId || result.interrupted ? [] : partiesFor(command, !ran.isError)
      for (const party of parties) await quietly(celebrate($, e.agentId ?? 'main', party))
      if (parties.some(party => party.label === 'Committet')) await quietly(creditCommit($, command))
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
          {o.game ? (
            <Box paddingX={1}>
              <Text wrap="wrap">{`💰 ${o.game.kroner.toLocaleString('da-DK')} kr · Trivsel ${o.game.wellbeing}${o.game.streak ? ` · 🔥 ${o.game.streak} ${o.game.streak === 1 ? 'dag' : 'dage'} i træk` : ''} · 🏅 ${o.game.unlocked} af ${o.game.achievements}`}</Text>
            </Box>
          ) : null}
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
