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
    expect(drawn).toContain('"label":"Åbn kontor"')
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

// The status file this session writes for the office page, as the page reads it.
type Status = { v: number; key: string; project: string; main: { state: string; detail: string }; subs: { name: string; phase: string; since: number; seat: number }[]; party: { kind: string; label: string } | null; updatedAt: number }

const statusFile = (on: On) => {
  const writes: Status[] = []
  on('env.get', (_, e) => ({ value: e.name === 'USERPROFILE' ? 'C:/Users/test' : undefined }) as never)
  on('fs.write', (_, e) => {
    if (e.path.split(String.fromCharCode(92)).join('/').includes('/agent-kontor/sessions/')) writes.push(JSON.parse(e.text) as Status)
    return { value: undefined } as never
  })
  on('fs.list', () => ({ value: [] }) as never)
  return { writes, last: () => writes[writes.length - 1] }
}

test('the status file holds what the page draws, written when it changes and now and then', async ($, on) => {
  const clock = engine(on)
  const file = statusFile(on)
  await $.session.start(start())
  await $.turn.start({ text: 'hej', turnId: 't1' } as never)
  await clock.advance(600)
  expect(file.last()?.v).toBe(2)
  expect(file.last()?.project).toBe('agent-kontor')
  expect(file.last()?.main.detail).toBe('Tænker')

  // Nothing new: nothing written, until the heartbeat says the session is still there.
  const count = file.writes.length
  await clock.advance(5000)
  expect(file.writes.length).toBe(count)
  await clock.advance(30_000)
  expect(file.writes.length).toBe(count + 1)
})

test('a helper on its way to Claude is in the file with when it set off, for the page to time the walk', async ($, on) => {
  const clock = engine(on, async e => {
    if (e.tool === 'Agent') {
      await $.agent.spawn({ tool_use_id: e.tool_use_id, prompt: 'p', description: 'Kortlæg API’et', subagentType: 'Explore', parentModel: 'm', background: false } as never)
    }
  })
  const file = statusFile(on)
  await $.session.start(start())
  await $.tool.call({ tool: 'Agent', prompt: 'p', description: 'Kortlæg API’et', tool_use_id: 'a1' } as never)
  await clock.advance(600)
  const sub = file.last()?.subs[0]
  expect(sub?.phase).toBe('delivering')
  expect(sub?.seat).toBe(0)
  expect(sub?.since).toBe(Date.UTC(2026, 9, 15, 10))
  expect(sub?.name).toMatch(/^[A-ZÆØÅ][a-zæøå]+$/)
})

test('green tests throw confetti for a while, a plain command does not', async ($, on) => {
  const clock = engine(on)
  const file = statusFile(on)
  await $.session.start(start())

  await $.tool.call({ tool: 'Bash', command: 'npm test', tool_use_id: 't1' } as never)
  await clock.advance(600)
  expect(file.last()?.party).toEqual(expect.objectContaining({ kind: 'confetti', label: 'Testene er grønne' }))

  await clock.advance(5000)
  expect(file.last()?.party).toBeNull()

  await $.tool.call({ tool: 'Bash', command: 'ls -la', tool_use_id: 't2' } as never)
  await clock.advance(600)
  expect(file.last()?.party).toBeNull()
})

test('/kontor starts the office server once and opens it in the browser', async ($, on) => {
  const clock = engine(on)
  let isUp = false
  const runs: string[][] = []
  on('env.get', (_, e) => ({ value: e.name === 'OS' ? 'Windows_NT' : undefined }) as never)
  on('http.fetch', () => {
    if (!isUp) throw new Error('ECONNREFUSED')
    return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ ok: true, app: 'agent-kontor', version: '1.0.0' }) } } as never
  })
  on('process.run', (_, e) => {
    runs.push([...e.argv])
    if (e.argv.includes('--detach')) isUp = true
    return { value: { exitCode: 0, stdout: '', stderr: '' } } as never
  })

  await $.session.start(start())
  await clock.advance(0)
  expect(runs).toEqual([])
  const reply = await $.command.run({ command: 'kontor', args: '' } as never)

  const server = runs.find(argv => argv.includes('--detach'))
  expect(server?.[0]).toBe('node')
  expect(server?.[1]).toMatch(/\/server\/server\.mjs$/)
  expect(runs).toContainEqual(['explorer.exe', 'http://127.0.0.1:4747'])
  expect(runs.filter(argv => argv.includes('--detach')).length).toBe(1)
  expect(JSON.stringify(reply)).toContain('http://127.0.0.1:4747')
})

test('the button above the chat box starts the server and opens the office in the browser', async ($, on) => {
  engine(on)
  let isUp = false
  const runs: string[][] = []
  on('env.get', (_, e) => ({ value: e.name === 'OS' ? 'Windows_NT' : undefined }) as never)
  on('http.fetch', () => {
    if (!isUp) throw new Error('ECONNREFUSED')
    return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ ok: true, app: 'agent-kontor' }) } } as never
  })
  on('process.run', (_, e) => {
    runs.push([...e.argv])
    if (e.argv.includes('--detach')) isUp = true
    return { value: { exitCode: 0, stdout: '', stderr: '' } } as never
  })

  await $.session.start(start())
  // Nothing is started until it is asked for.
  expect(runs).toEqual([])

  const band = await $.ui.mount({ plugin: 'agent-kontor', surface: 'desktop', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 10 } as never })
  expect((await band.find({ key: 'kontor' }))?.text).toContain('Åbn kontor')
  await band.press({ key: 'kontor' })

  expect(runs.find(argv => argv.includes('--detach'))?.[1]).toMatch(/\/server\/server\.mjs$/)
  expect(runs).toContainEqual(['explorer.exe', 'http://127.0.0.1:4747'])
})
