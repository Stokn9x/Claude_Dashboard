import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const paneProps = { title: '🏢 Kontor', isFocused: true, bodyColumns: 80 } as never

type ToolBottom = (e: { tool: string; tool_use_id: string }) => unknown

const engine = (on: On, toolCall?: ToolBottom) => {
  on('ui.render', () => ({ type: 'Box', props: {}, children: [] }))
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('command.register', () => ({ value: { command: 'kontor' } }) as never)
  on('session.start', (_, e) => e as never)
  on('turn.start', (_, e) => e as never)
  on('turn.complete', () => ({ text: 'ok' }))
  on('tool.check', () => ({ decision: 'ask' }) as never)
  on('classic.PermissionRequest', () => ({}) as never)
  on('agent.spawn', (_, e) => ({ model: 'claude-haiku-5-5', agentId: `sub-${e.tool_use_id}` }) as never)
  on('tool.call', async (_, e) => {
    await toolCall?.(e)
    return e.tool === 'Edit'
      ? ({ result: { filePath: 'C:/p/a.ts', structuredPatch: [{ lines: ['+a', '+b', '-c'] }] } } as never)
      : ({ result: {} } as never)
  })
  return mock.clock(on, { now: Date.UTC(2026, 9, 15, 10) })
}

const start = (cwd = 'C:/kode/agent-kontor') => ({ source: 'startup', cwd }) as never
const turn = { reason: 'answer', answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1' } as never

for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: Claude's desk follows what it does, and the code it writes is counted`, async ($, on) => {
    const seen: string[] = []
    let snapshot = async () => ''
    engine(on, async e => {
      if (e.tool === 'Bash') seen.push(await snapshot())
    })
    await $.session.start(start())
    const ui = await $.ui.mount({ plugin: 'agent-kontor', surface, component: 'Pane', requestId: 'kontor', props: paneProps })
    snapshot = async () => JSON.stringify(await ui.drawn())

    await $.turn.start({ text: 'hej', turnId: 't1' } as never)
    await $.tool.call({ tool: 'Edit', file_path: 'C:/x/register.tsx', old_string: 'a', new_string: 'b', tool_use_id: 'u1' } as never)
    expect(JSON.stringify(await ui.drawn())).toContain('+2 −1 linjer')

    // A shell command shows the program, never its arguments.
    await $.tool.call({ tool: 'Bash', command: 'API_KEY=hemmelig npm test --token=abc', tool_use_id: 'u2' } as never)
    expect(seen.join('')).toContain('Kører npm test')
    expect(seen.join('')).not.toContain('hemmelig')

    await $.turn.complete(turn)
    const drawn = JSON.stringify(await ui.drawn())
    expect(drawn).toContain('Holder pause')
    if (surface === 'desktop') expect(drawn).toContain('"type":"Svg"')
  })

  test(`${surface}: only a dialog put to me reads as waiting, not an ask in Auto mode`, async ($, on) => {
    engine(on)
    await $.session.start(start())
    const ui = await $.ui.mount({ plugin: 'agent-kontor', surface, component: 'Pane', requestId: 'kontor', props: paneProps })

    await $.tool.check({ tool: 'Bash', command: 'rm x', tool_use_id: 'u3' } as never)
    expect(JSON.stringify(await ui.drawn())).not.toContain('venter på dig')

    await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'rm x' } } as never)
    expect(JSON.stringify(await ui.drawn())).toContain('Claude venter på dig: Venter på din godkendelse')
  })

  test(`${surface}: a subagent walks in, works at a desk, delivers to Claude and leaves`, async ($, on) => {
    let ui: { drawn: () => Promise<unknown> } = { drawn: async () => null }
    let whileReading = ''
    const clock = engine(on, async e => {
      if (e.tool === 'Read') whileReading = JSON.stringify(await ui.drawn())
      if (e.tool === 'Agent') {
        await $.agent.spawn({ tool_use_id: e.tool_use_id, prompt: 'p', description: 'Kortlæg API’et', subagentType: 'Explore', parentModel: 'm', background: false } as never)
        await $.tool.call({ tool: 'Read', file_path: 'C:/x/api.ts', tool_use_id: 'r1', agentId: `sub-${e.tool_use_id}` } as never)
      }
    })
    await $.session.start(start())
    ui = await $.ui.mount({ plugin: 'agent-kontor', surface, component: 'Pane', requestId: 'kontor', props: paneProps })

    await $.tool.call({ tool: 'Agent', prompt: 'p', description: 'Kortlæg API’et', tool_use_id: 'a1' } as never)
    expect(whileReading).toContain('Læser api.ts')
    expect(whileReading).toContain('Kortlæg API’et')
    const after = JSON.stringify(await ui.drawn())
    expect(after).toContain('Afleverer: Kortlæg API’et')

    await clock.advance(4000)
    expect(JSON.stringify(await ui.drawn())).toContain('Går igen: Kortlæg API’et')

    await clock.advance(4000)
    expect(JSON.stringify(await ui.drawn())).toContain('Ingen hjælpere i kontoret')
  })

  test(`${surface}: /kontor demo fills all six desks`, async ($, on) => {
    const clock = engine(on)
    await $.session.start(start())
    const ui = await $.ui.mount({ plugin: 'agent-kontor', surface, component: 'Pane', requestId: 'kontor', props: paneProps })

    await $.command.run({ command: 'kontor', args: 'demo' } as never)
    await clock.advance(7000)
    const drawn = JSON.stringify(await ui.drawn())

    expect(drawn).toContain('6 af 6 hjælpere arbejder')
    for (const detail of ['Læser api.ts', 'Skriver kontor.test.ts', 'Kører npm test', 'Søger i koden', 'Læser docs.claude.com', 'Skriver README.md']) {
      expect(drawn).toContain(detail)
    }
  })
}
