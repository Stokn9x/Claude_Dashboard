import { atom, update } from 'claude-code'
import type { Register, RenderElement } from 'claude-code'
import type { AgentState, Phase } from '../types'
import { emptyOffice, thinking, pause, readOffice, quietly, T } from './office'
import type { $ } from './office'
import { base, activityFor } from './activity'
import { setMain, setActivity, noteTool, arrive, deliver, handIn, teammateWaits, wakes, TIDY_MS, tidy, sweepAgents, runDemo } from './helpers'
import { LINES_PER_EDIT, earn, partiesFor, creditCommit, celebrate, countPatch, countLines } from './earnings'
import type { Patch } from './earnings'
import { ADDRESS, WRITE_MS, READ_MS, SERVER_CHECK_MS, whyNoServer, writeStatus, readOthers, readGame, leaveOffice, openOffice, keepServer } from './status'
import { AGENTS_MS, findAgents, readCrew, readPrefs, isOf, isAtWork } from './staff'

// The session's office in $.state: the engine wants the reference spelled
// out in every file that reads or writes it, so each file makes its own.
const office = atom({ plugin: 'agent-kontor', key: 'office' } as const, emptyOffice)

// A pixel office, seen from above: Claude at the big desk, its subagents at
// desks in the team room. This module keeps track of who is where and writes
// it to a status file; a small server on this computer streams every
// session's file to a page that draws and animates the office. Nothing leaves
// the machine.

const PANE = 'kontor'
// How much of a helper's answer the office keeps
const ANSWER_MAX = 600

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
const phaseText: Record<Phase, [string, string]> = {
  arriving: ['På vej ind', 'On the way in'],
  working: ['', ''],
  delivering: ['Afleverer', 'Handing over'],
  idle: ['Holder fri', 'Off work'],
  leaving: ['Går igen', 'Leaving'],
}

// ─── Hooks ──────────────────────────────────────────────────────────────

// The button opens the office, or says why it cannot.
async function openOrSay($: $) {
  if (!(await openOffice($))) $.ui.toast(await whyNoServer($), { timeoutMs: 15_000 })
}

export const register: Register = on => {
  // spawn tool_use_id → the subagent, to see it out when its call ends. A
  // background one's call returns at once, so it waits for SubagentStop.
  const spawned = new Map<string, { agentId: string; isBackground: boolean }>()

  on('session.start', async ($, e, next) => {
    // The language chosen on the office page, for the mod's own words.
    await quietly(readPrefs($))
    const said = await readOffice($)
    await $.command.register({
      name: 'kontor',
      description: T(said, 'Åbn kontoret i browseren, se det fyldt med /kontor demo, eller listen med /kontor panel', 'Open the office in the browser, see it full with /kontor demo, or the list with /kontor panel'),
      argumentHint: '[demo|panel]',
    })
    const now = await $.clock.now()
    const key = `s${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}`
    await update($, office, o => ({ ...o, sessionKey: o.sessionKey || key, project: base(e.cwd) || 'Kontoret', startedAt: o.startedAt || now, main: pause, subs: [] }))
    $.clock.every(TIDY_MS, () => void quietly(tidy($)))
    $.clock.every(WRITE_MS, () => void quietly(writeStatus($)))
    $.clock.every(READ_MS, () => void quietly(readOthers($)))
    $.clock.every(READ_MS, () => void quietly(sweepAgents($)))
    $.clock.every(READ_MS, () => void quietly(readGame($)))
    $.clock.every(SERVER_CHECK_MS, () => void quietly(keepServer($)))
    // Your own agents come in to work: who they are, and who was taken off.
    // (The list of agents a moment later, once the session is under way.)
    await quietly(readCrew($))
    $.clock.after(1500, () => void quietly(findAgents($)))
    $.clock.every(READ_MS, () => void quietly(readCrew($)))
    $.clock.every(READ_MS, () => void quietly(readPrefs($)))
    $.clock.every(AGENTS_MS, () => void quietly(findAgents($)))
    return next(e)
  })

  on('command.run', { command: 'kontor' }, async ($, e) => {
    const arg = e.args.trim()
    const o = await readOffice($)
    if (arg === 'panel') {
      await $.ui.open({ id: PANE, title: T(o, '🏢 Kontor', '🏢 Office'), focus: true })
      return { text: T(o, 'Listen over hvem der laver hvad står i panelet.', 'The list of who does what is in the panel.') }
    }
    const where = (await openOffice($)) ? T(o, `Kontoret er åbent i din browser på ${ADDRESS}.`, `The office is open in your browser at ${ADDRESS}.`) : await whyNoServer($)
    if (arg === 'demo') {
      await runDemo($)
      return { text: T(o, `${where} Seks hjælpere er på vej ind.`, `${where} Six helpers are on their way in.`) }
    }
    return { text: T(o, `${where} Prøv /kontor demo for at se det fyldt.`, `${where} Try /kontor demo to see it full.`) }
  })

  on('session.end', async ($, e, next) => {
    await quietly(leaveOffice($))
    return next(e)
  })

  // A turn in a subagent's or teammate's loop is theirs, not Claude's: a
  // teammate woken by a message starts thinking at its desk.
  on('turn.start', async ($, e, next) => {
    if (e.agentId) await quietly(wakes($, e.agentId))
    else await quietly(setMain($, thinking))
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    const now = await $.clock.now()
    // A helper's last answer: the start of it, for its card and the day's list.
    if (e.agentId) {
      const answer = typeof e.answer === 'string' ? e.answer.trim().slice(0, ANSWER_MAX) : ''
      if (answer) await quietly(update($, office, o => ({ ...o, subs: o.subs.map(s => (isOf(s, e.agentId) ? { ...s, answer } : s)) })))
      // A teammate's turn is over: it waits at its desk for its next message.
      await quietly(teammateWaits($, e.agentId))
      return result
    }
    const u = e.usage
    if (u) await quietly(update($, office, o => ({ ...o, tokensOut: o.tokensOut + u.output_tokens, model: u.model })))
    const lastTurn = { endedAt: now, ms: Math.max(0, Number(e.durationMs) || 0), isAborted: !!e.isAborted || e.reason !== 'answer' }
    await quietly(update($, office, o => ({ ...o, lastTurn })))
    await quietly(setMain($, pause))
    return result
  })

  on('session.measure', async ($, e, next) => {
    const five = e.rateLimits.find(l => l.kind === 'five_hour')
    await quietly(update($, office, o => ({ ...o, costUsd: e.cost?.usd ?? o.costUsd, fiveHour: five?.percentUsed ?? o.fiveHour, context: e.context?.percent ?? o.context })))
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
  // A teammate's turn ending is no stop: it waits for its next message, and
  // leaves when the engine's list says it has ended.
  on('classic.SubagentStop', async ($, e, next) => {
    const sub = (await readOffice($)).subs.find(s => isOf(s, e.agent_id))
    if (!sub?.teammate) await quietly(deliver($, e.agent_id))
    return next(e)
  })

  // A task on the team's list done by a teammate: it hands it in.
  on('classic.TaskCompleted', async ($, e, next) => {
    if (e.teammate_name) await quietly(handIn($, e.teammate_name, e.task_subject ?? ''))
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
      spawned.set(e.tool_use_id, { agentId: r.agentId, isBackground: e.background || !!e.isTeammate })
      // A teammate keeps its name in the team, for its card and its tasks.
      const teammate = e.isTeammate ? (r.teammateId?.split('@')[0] ?? e.name ?? 'teammate') : undefined
      await quietly(arrive($, r.agentId, e.description || 'En opgave', { state: 'working', detail: e.description || 'Går i gang' }, { type: e.subagentType, model: r.model, teammate }))
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
              isOf(s, e.agentId) && isAtWork(s) ? { ...s, linesAdded: (s.linesAdded ?? 0) + counted.added, linesRemoved: (s.linesRemoved ?? 0) + counted.removed } : s,
            ),
          })),
        )
      }
    }
    if ((e.tool === 'Bash' || e.tool === 'PowerShell') && 'result' in ran && ran.result) {
      const result = ran.result as { interrupted?: boolean; backgroundTaskId?: string }
      const command = String((e as unknown as { command?: unknown }).command ?? '')
      const parties = result.backgroundTaskId || result.interrupted ? [] : partiesFor(command, !ran.isError)
      // A regular's party is at its own desk, by its own id.
      const who = e.agentId ? ((await readOffice($)).subs.find(s => isOf(s, e.agentId))?.id ?? e.agentId) : 'main'
      for (const party of parties) await quietly(celebrate($, who, party))
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
      // Regulars between jobs are only sitting there.
      const helpers = o.subs.filter(isAtWork).length
      const note =
        o.main.state === 'waiting'
          ? T(o, 'Claude venter på dig', 'Claude is waiting for you')
          : helpers
            ? T(o, `${helpers} ${helpers === 1 ? 'hjælper' : 'hjælpere'} i kontoret`, `${helpers} ${helpers === 1 ? 'helper' : 'helpers'} in the office`)
            : null
      return (
        <Box flexDirection="row" gap={1}>
          <Button key="kontor" label={T(o, '🏢 Åbn kontor', '🏢 Open office')} onPress={() => void quietly(openOrSay($))} />
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
          isBusy ? s.activity.detail : s.outcome === 'failed' ? T(o, `Gik i stå: ${s.task}`, `Got stuck: ${s.task}`) : `${T(o, ...phaseText[s.phase])}: ${s.task}`,
          isBusy ? s.activity.state : 'working',
          s.phase === 'arriving' ? T(o, `${s.task} (på vej ind)`, `${s.task} (on the way in)`) : s.phase === 'working' ? s.task : null,
        )
      })

      return (
        <Box flexDirection="column" gap={1} paddingX={1} paddingY={1}>
          <Box flexDirection="column" paddingX={1}>
            <Text bold>{T(o, 'Kontoret tegnes i din browser', 'The office is drawn in your browser')}</Text>
            <Text dimColor wrap="wrap">{T(o, `Det ligger på ${ADDRESS}. Alle dine sessioner sidder i samme kontor.`, `It is at ${ADDRESS}. All your sessions sit in the same office.`)}</Text>
          </Box>
          <Box flexDirection="row" gap={2} paddingX={1}>
            <Button label={T(o, 'Åbn kontor', 'Open office')} onPress={() => void quietly(openOrSay($))} />
            <Button label={T(o, 'Kopiér adresse', 'Copy address')} onPress={press => void quietly($.ui.copy({ text: ADDRESS, surface: press.surface }))} />
          </Box>
          {o.game ? (
            <Box paddingX={1}>
              <Text wrap="wrap">
                {T(
                  o,
                  `💰 ${o.game.kroner.toLocaleString('da-DK')} kr · Trivsel ${o.game.wellbeing}${o.game.streak ? ` · 🔥 ${o.game.streak} ${o.game.streak === 1 ? 'dag' : 'dage'} i træk` : ''} · 🏅 ${o.game.unlocked} af ${o.game.achievements}`,
                  `💰 ${o.game.kroner.toLocaleString('en-GB')} kr · Wellbeing ${o.game.wellbeing}${o.game.streak ? ` · 🔥 ${o.game.streak} ${o.game.streak === 1 ? 'day' : 'days'} in a row` : ''} · 🏅 ${o.game.unlocked} of ${o.game.achievements}`,
                )}
              </Text>
            </Box>
          ) : null}
          {o.main.state === 'waiting' ? (
            <Box borderStyle="round" borderColor="#E5484D" paddingX={2}>
              <Text color="#E5484D" wrap="wrap">{T(o, `Claude venter på dig: ${o.main.detail}`, `Claude is waiting for you: ${o.main.detail}`)}</Text>
            </Box>
          ) : null}
          <Box flexDirection="column" gap={1}>
            {row('main', 'Claude', o.main.detail, o.main.state, figures.length ? figures.join(', ') : null)}
            {subRows}
            {o.others.map(x =>
              row(`o-${x.key}`, T(o, `Claude i ${x.project}`, `Claude in ${x.project}`), x.main.detail, x.main.state, x.helpers ? T(o, `${x.helpers} ${x.helpers === 1 ? 'hjælper' : 'hjælpere'}`, `${x.helpers} ${x.helpers === 1 ? 'helper' : 'helpers'}`) : null),
            )}
          </Box>
          <Box flexDirection="row" gap={1} paddingX={1}>
            <Text dimColor wrap="wrap">
              {o.subs.length === 0
                ? T(o, 'Ingen hjælpere i kontoret. Når Claude sender subagenter afsted, sætter de sig i teamrummet. Prøv /kontor demo.', 'No helpers in the office. When Claude sends subagents off, they sit down in the team room. Try /kontor demo.')
                : T(o, `${working} af ${o.subs.length} hjælpere arbejder`, `${working} of ${o.subs.length} helpers are working`)}
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
