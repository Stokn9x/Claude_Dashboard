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

    // The walk to Claude's desk and the handover take their time…
    await clock.advance(6500)
    expect(JSON.stringify(await ui.drawn())).toContain('Går igen: Kortlæg API’et')

    // …and so does the walk out of the door.
    await clock.advance(7000)
    expect(JSON.stringify(await ui.drawn())).toContain('Ingen hjælpere i kontoret')
  })

  test(`${surface}: /kontor demo fills all six desks`, async ($, on) => {
    const clock = engine(on)
    await $.session.start(start())
    const ui = await $.ui.mount({ plugin: 'agent-kontor', surface, component: 'Pane', requestId: 'kontor', props: paneProps })

    await $.command.run({ command: 'kontor', args: 'demo' } as never)
    await clock.advance(11000)
    const drawn = JSON.stringify(await ui.drawn())

    expect(drawn).toContain('6 af 6 hjælpere arbejder')
    for (const detail of ['Læser api.ts', 'Skriver kontor.test.ts', 'Kører npm test', 'Søger i koden', 'Læser docs.claude.com', 'Skriver README.md']) {
      expect(drawn).toContain(detail)
    }
  })
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: a background subagent stays at its desk until it stops`, async ($, on) => {
    const clock = engine(on, async e => {
      if (e.tool === 'Agent') {
        await $.agent.spawn({ tool_use_id: e.tool_use_id, prompt: 'p', description: 'Læs README', subagentType: 'Explore', parentModel: 'm', background: true } as never)
      }
    })
    on('classic.SubagentStop', () => ({}) as never)
    await $.session.start(start())
    const ui = await $.ui.mount({ plugin: 'agent-kontor', surface, component: 'Pane', requestId: 'kontor', props: paneProps })

    // The Agent call is back at once, but the helper is still at work.
    await $.tool.call({ tool: 'Agent', prompt: 'p', description: 'Læs README', tool_use_id: 'b1', run_in_background: true } as never)
    await clock.advance(9000)
    expect(JSON.stringify(await ui.drawn())).toContain('1 af 1 hjælpere arbejder')

    await $.classic.SubagentStop({ agent_id: 'sub-b1', agent_type: 'Explore', stop_hook_active: false, agent_transcript_path: '' } as never)
    expect(JSON.stringify(await ui.drawn())).toContain('Afleverer: Læs README')
  })
}

test('desktop: the picture does not change while nothing in the office does', async ($, on) => {
  const clock = engine(on)
  await $.session.start(start())
  const ui = await $.ui.mount({ plugin: 'agent-kontor', surface: 'desktop', component: 'Pane', requestId: 'kontor', props: paneProps })
  await $.turn.start({ text: 'hej', turnId: 't1' } as never)
  await clock.advance(1000)

  const source = (tree: unknown) => /"source":"(.*?)","alt"/.exec(JSON.stringify(tree))?.[1] ?? ''
  const first = source(await ui.drawn())
  await clock.advance(5000)
  expect(first.length).toBeGreaterThan(1000)
  expect(source(await ui.drawn())).toBe(first)
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: my other sessions on this computer join the office`, async ($, on) => {
    const clock = engine(on)
    const now = Date.UTC(2026, 9, 15, 10)
    const dir = 'C:/Users/test/.claude/agent-kontor/sessions'
    const files = new Map<string, string>([
      [`${dir}/sother1.json`, JSON.stringify({ key: 'sother1', project: 'crm', main: { state: 'running', detail: 'Kører npm test' }, helpers: 2, updatedAt: now })],
      [`${dir}/sdone.json`, JSON.stringify({ key: 'sdone', ended: true, updatedAt: 0 })],
      [`${dir}/sold.json`, JSON.stringify({ key: 'sold', project: 'gammel', main: { state: 'idle', detail: 'Holder pause' }, helpers: 0, updatedAt: now - 600_000 })],
    ])
    on('env.get', (_, e) => ({ value: e.name === 'USERPROFILE' ? ['C:', 'Users', 'test'].join(String.fromCharCode(92)) : undefined }) as never)
    // The engine hands hooks the native path; compare with forward slashes.
    const norm = (p: string) => p.split(String.fromCharCode(92)).join('/')
    on('fs.write', (_, e) => {
      files.set(norm(e.path), e.text)
      return { value: undefined } as never
    })
    on('fs.list', (_, e) => ({ value: [...files.keys()].filter(p => p.startsWith(norm(e.path))).map(p => ({ name: p.split('/').pop(), kind: 'file', size: 1, mtimeMs: 0, isLink: false })) }) as never)
    on('fs.read', (_, e) => ({ value: files.get(norm(e.path)) ?? '' }) as never)

    await $.session.start(start('C:/kode/agent-kontor'))
    const ui = await $.ui.mount({ plugin: 'agent-kontor', surface, component: 'Pane', requestId: 'kontor', props: paneProps })
    await clock.advance(3500)
    const drawn = JSON.stringify(await ui.drawn())

    expect(drawn).toContain('Claude i crm')
    expect(drawn).toContain('Kører npm test')
    expect(drawn).toContain('2 hjælpere')
    expect(drawn).not.toContain('gammel')

    // This session wrote its own status beside them.
    const mine = [...files.entries()].find(([p, text]) => !/sother1|sdone|sold/.test(p) && text.includes('agent-kontor'))
    expect(mine?.[0]).toMatch(/^C:\/Users\/test\/\.claude\/agent-kontor\/sessions\/s[a-z0-9]+\.json$/)
  })
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: green tests throw confetti for a while, a plain command does not`, async ($, on) => {
    const clock = engine(on)
    await $.session.start(start())
    const ui = await $.ui.mount({ plugin: 'agent-kontor', surface, component: 'Pane', requestId: 'kontor', props: paneProps })

    await $.tool.call({ tool: 'Bash', command: 'npm test', tool_use_id: 't1' } as never)
    await clock.advance(900)
    if (surface === 'desktop') expect(JSON.stringify(await ui.drawn())).toContain('Testene er grønne')

    await clock.advance(5000)
    if (surface === 'desktop') expect(JSON.stringify(await ui.drawn())).not.toContain('Testene er grønne')

    // A plain command is nothing to celebrate.
    await $.tool.call({ tool: 'Bash', command: 'ls -la', tool_use_id: 't2' } as never)
    await clock.advance(900)
    if (surface === 'desktop') expect(JSON.stringify(await ui.drawn())).not.toContain('Testene')
  })
}

test('desktop: Claude thanks a helper by name when it hands over its result', async ($, on) => {
  let ui: { drawn: () => Promise<unknown> } = { drawn: async () => null }
  const clock = engine(on, async e => {
    if (e.tool === 'Agent') {
      await $.agent.spawn({ tool_use_id: e.tool_use_id, prompt: 'p', description: 'Kortlæg API’et', subagentType: 'Explore', parentModel: 'm', background: false } as never)
    }
  })
  await $.session.start(start())
  ui = await $.ui.mount({ plugin: 'agent-kontor', surface: 'desktop', component: 'Pane', requestId: 'kontor', props: paneProps })
  await $.turn.start({ text: 'hej', turnId: 't1' } as never)
  await $.tool.call({ tool: 'Agent', prompt: 'p', description: 'Kortlæg API’et', tool_use_id: 'a1' } as never)
  await clock.advance(900)
  expect(JSON.stringify(await ui.drawn())).toMatch(/Tak, [A-ZÆØÅ][a-zæøå]+!/)
})
