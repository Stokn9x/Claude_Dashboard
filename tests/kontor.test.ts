import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

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
    // A test's own answer for a call, when it gives one.
    const own = await toolCall?.(e)
    if (own) return own as never
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

  test(`${surface}: a subagent walks in, works at a desk, delivers to Claude, takes some time off and leaves`, async ($, on) => {
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
    await clock.advance(11_000)
    expect(JSON.stringify(await ui.drawn())).toContain('Holder fri: Kortlæg API’et')

    // …then a few minutes off work, and the walk out of the door.
    await clock.advance(3 * 60_000)
    expect(JSON.stringify(await ui.drawn())).toContain('Går igen: Kortlæg API’et')
    await clock.advance(10_000)
    expect(JSON.stringify(await ui.drawn())).toContain('Ingen hjælpere i kontoret')
  })

  test(`${surface}: /kontor demo fills all six desks`, async ($, on) => {
    const clock = engine(on)
    await $.session.start(start())
    const ui = await $.ui.mount({ plugin: 'agent-kontor', surface, component: 'Pane', requestId: 'kontor', props: paneProps })

    await $.command.run({ command: 'kontor', args: 'demo' } as never)
    await clock.advance(16_000)
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
    await clock.advance(13_000)
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

// A background helper, as the model starts one: its Agent call returns at once.
const backgroundHelper = (on: On, $: Parameters<TestBody>[0]) =>
  engine(on, async e => {
    if (e.tool === 'Agent') {
      await $.agent.spawn({ tool_use_id: e.tool_use_id, prompt: 'p', description: 'Læs README', subagentType: 'Explore', parentModel: 'm', background: true } as never)
    }
  })

const agentEntry = (id: string, status: string) => ({ id, description: 'Læs README', type: 'Explore', status })

test('a helper whose loop failed goes home, and says so', async ($, on) => {
  const clock = backgroundHelper(on, $)
  const file = statusFile(on)
  let status = 'running'
  on('agent.list', () => ({ value: [agentEntry('sub-b1', status)] }) as never)
  await $.session.start(start())
  const ui = await $.ui.mount({ plugin: 'agent-kontor', surface: 'desktop', component: 'Pane', requestId: 'kontor', props: paneProps })

  await $.tool.call({ tool: 'Agent', prompt: 'p', description: 'Læs README', tool_use_id: 'b1', run_in_background: true } as never)
  await clock.advance(13_000)
  expect(file.last()?.subs[0]?.phase).toBe('working')

  // A rate limit ends its loop: no SubagentStop, only the engine's list says so.
  status = 'failed'
  await clock.advance(3500)
  expect(file.last()?.subs[0]?.phase).toBe('delivering')
  expect(JSON.stringify(file.last()?.subs[0])).toContain('"outcome":"failed"')
  expect(JSON.stringify(await ui.drawn())).toContain('Gik i stå: Læs README')
})

test('a helper the engine no longer lists goes home after a minute', async ($, on) => {
  const clock = backgroundHelper(on, $)
  const file = statusFile(on)
  on('agent.list', () => ({ value: [] }) as never)
  await $.session.start(start())

  await $.tool.call({ tool: 'Agent', prompt: 'p', description: 'Læs README', tool_use_id: 'b1', run_in_background: true } as never)
  await clock.advance(30_000)
  expect(file.last()?.subs[0]?.phase).toBe('working')
  await clock.advance(35_000)
  expect(file.last()?.subs[0]?.phase).toBe('delivering')
})

test('once the office is open, a server that stopped is started again', async ($, on) => {
  const clock = engine(on)
  let isUp = false
  let starts = 0
  on('env.get', (_, e) => ({ value: e.name === 'OS' ? 'Windows_NT' : undefined }) as never)
  on('http.fetch', () => {
    if (!isUp) throw new Error('ECONNREFUSED')
    return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ ok: true, app: 'agent-kontor' }) } } as never
  })
  on('process.run', (_, e) => {
    if (e.argv.includes('--detach')) {
      starts += 1
      isUp = true
    }
    return { value: { exitCode: 0, stdout: '', stderr: '' } } as never
  })

  await $.session.start(start())
  // Not opened yet: nothing is kept running.
  await clock.advance(61_000)
  expect(starts).toBe(0)

  await $.command.run({ command: 'kontor', args: '' } as never)
  expect(starts).toBe(1)

  // The computer slept and the server is gone.
  isUp = false
  await clock.advance(61_000)
  expect(starts).toBe(2)
})

test('every helper gets a place number, without a limit, and a freed number is used again', async ($, on) => {
  const clock = backgroundHelper(on, $)
  const file = statusFile(on)
  on('classic.SubagentStop', () => ({}) as never)
  on('agent.list', () => ({ value: ['1', '2', '3', '4', '5', '6', '7', '8'].map(n => agentEntry(`sub-b${n}`, 'running')) }) as never)
  await $.session.start(start())

  for (const n of ['1', '2', '3', '4', '5', '6', '7']) {
    await $.tool.call({ tool: 'Agent', prompt: 'p', description: 'Læs README', tool_use_id: `b${n}`, run_in_background: true } as never)
  }
  await clock.advance(600)
  const seatOf = (id: string) => file.last()?.subs.find(s => JSON.stringify(s).includes(id))?.seat
  // The page decides which numbers get a desk and which sit on the floor.
  expect(seatOf('sub-b7')).toBe(6)

  // The second helper is done; once it has handed over and is off work, its number is free.
  await $.classic.SubagentStop({ agent_id: 'sub-b2', agent_type: 'Explore', stop_hook_active: false, agent_transcript_path: '' } as never)
  await clock.advance(11_000)
  await $.tool.call({ tool: 'Agent', prompt: 'p', description: 'Læs README', tool_use_id: 'b8', run_in_background: true } as never)
  await clock.advance(600)
  expect(seatOf('sub-b8')).toBe(1)
})

test('a finished helper stays off work for a while, goes back to work when called on, and goes home when not', async ($, on) => {
  const clock = backgroundHelper(on, $)
  const file = statusFile(on)
  on('classic.SubagentStop', () => ({}) as never)
  on('agent.list', () => ({ value: [agentEntry('sub-b1', 'running')] }) as never)
  await $.session.start(start())
  const phaseOf = () => file.last()?.subs.find(s => JSON.stringify(s).includes('sub-b1')) as (Status['subs'][number] & { from?: string; activity: { detail: string } }) | undefined

  await $.tool.call({ tool: 'Agent', prompt: 'p', description: 'Læs README', tool_use_id: 'b1', run_in_background: true } as never)
  await clock.advance(5000)
  await $.classic.SubagentStop({ agent_id: 'sub-b1', agent_type: 'Explore', stop_hook_active: false, agent_transcript_path: '' } as never)
  await clock.advance(11_000)
  expect(phaseOf()?.phase).toBe('idle')
  expect(phaseOf()?.activity.detail).toBe('Holder fri')

  // Called on again: back to a desk, walking from where it was idling.
  await $.tool.call({ tool: 'Read', file_path: 'C:/kode/a.ts', tool_use_id: 'r1', agentId: 'sub-b1' } as never)
  await clock.advance(600)
  expect(phaseOf()?.phase).toBe('arriving')
  expect(phaseOf()?.from).toBe('idle')
  await clock.advance(13_000)
  expect(phaseOf()?.phase).toBe('working')

  // Done again, and then left alone: home after a few minutes off work.
  await $.classic.SubagentStop({ agent_id: 'sub-b1', agent_type: 'Explore', stop_hook_active: false, agent_transcript_path: '' } as never)
  await clock.advance(11_000)
  expect(phaseOf()?.phase).toBe('idle')
  await clock.advance(3 * 60_000)
  expect(phaseOf()?.phase).toBe('leaving')
  expect(phaseOf()?.from).toBe('idle')
  await clock.advance(10_000)
  expect(phaseOf()).toBeUndefined()
})

test('earnings are counted by the rules: a cap per edit, tests at most every ten minutes', async ($, on) => {
  const clock = engine(on, async e => {
    if (e.tool === 'Agent') {
      await $.agent.spawn({ tool_use_id: e.tool_use_id, prompt: 'p', description: 'Kortlæg API’et', subagentType: 'Explore', parentModel: 'm', background: false } as never)
    }
  })
  const file = statusFile(on)
  await $.session.start(start())
  const earned = () => (JSON.parse(JSON.stringify(file.last())) as { earned: Record<string, number> }).earned

  // +2 -1 from the engine's Edit result
  await $.tool.call({ tool: 'Edit', file_path: 'C:/x/a.ts', old_string: 'a', new_string: 'b', tool_use_id: 'e1' } as never)
  await $.tool.call({ tool: 'Bash', command: 'npm test', tool_use_id: 't1' } as never)
  await $.tool.call({ tool: 'Bash', command: 'npm test', tool_use_id: 't2' } as never)
  await $.tool.call({ tool: 'Bash', command: 'git commit -m x', tool_use_id: 'c1' } as never)
  await $.tool.call({ tool: 'Agent', prompt: 'p', description: 'Kortlæg API’et', tool_use_id: 'a1' } as never)
  await clock.advance(600)
  expect(earned()).toEqual({ added: 2, removed: 1, delivered: 1, tests: 1, commits: 1, prs: 0 })

  // Ten minutes on, green tests count again.
  await clock.advance(10 * 60_000)
  await $.tool.call({ tool: 'Bash', command: 'npm test', tool_use_id: 't3' } as never)
  await clock.advance(600)
  expect(earned().tests).toBe(2)
})

test('each helper keeps its own count of tools, lines and latest steps for its card', async ($, on) => {
  const clock = backgroundHelper(on, $)
  const file = statusFile(on)
  on('agent.list', () => ({ value: [agentEntry('sub-b1', 'running')] }) as never)
  await $.session.start(start())

  await $.tool.call({ tool: 'Agent', prompt: 'p', description: 'Læs README', tool_use_id: 'b1', run_in_background: true } as never)
  await $.tool.call({ tool: 'Read', file_path: 'C:/x/api.ts', tool_use_id: 'r1', agentId: 'sub-b1' } as never)
  await $.tool.call({ tool: 'Edit', file_path: 'C:/x/api.ts', old_string: 'a', new_string: 'b', tool_use_id: 'e1', agentId: 'sub-b1' } as never)
  await clock.advance(600)

  const helper = JSON.parse(JSON.stringify(file.last()?.subs[0])) as { tools: number; linesAdded: number; linesRemoved: number; recent: { detail: string }[]; startedAt: number }
  expect(helper.tools).toBe(2)
  expect(helper.linesAdded).toBe(2)
  expect(helper.linesRemoved).toBe(1)
  expect(helper.recent.map(r => r.detail)).toEqual(['Læser api.ts', 'Skriver api.ts'])
  expect(helper.startedAt).toBe(Date.UTC(2026, 9, 15, 10))

  // Claude's own calls are Claude's: the Agent call that sent the helper.
  const stats = JSON.parse(JSON.stringify(file.last())).stats as { tools: number; recent: { detail: string }[] }
  expect(stats.tools).toBe(1)
  expect(stats.recent[0]?.detail).toBe('Sender en hjælper afsted')
})

test('an older server from before an update is asked to step down, and the new one started', async ($, on) => {
  engine(on)
  let version: string | null = '0.1.0'
  const calls: string[] = []
  on('env.get', (_, e) => ({ value: e.name === 'OS' ? 'Windows_NT' : undefined }) as never)
  on('fs.read', (_, e) => ({ value: e.path.split(String.fromCharCode(92)).join('/').endsWith('.claude-plugin/plugin.json') ? JSON.stringify({ version: '0.14.0' }) : '' }) as never)
  on('http.fetch', (_, e) => {
    const path = new URL(e.url).pathname
    calls.push(`${e.init?.method ?? 'GET'} ${path}`)
    if (path === '/api/quit') version = null
    if (version === null) throw new Error('ECONNREFUSED')
    if (path === '/api/state') return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ token: 'secret' }) } } as never
    return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ ok: true, app: 'agent-kontor', version }) } } as never
  })
  on('process.run', (_, e) => {
    if (e.argv.includes('--detach')) {
      calls.push('start')
      version = '0.14.0'
    }
    return { value: { exitCode: 0, stdout: '', stderr: '' } } as never
  })

  await $.session.start(start())
  await $.command.run({ command: 'kontor', args: '' } as never)
  expect(calls).toContain('POST /api/quit')
  expect(calls.indexOf('start')).toBeGreaterThan(calls.indexOf('POST /api/quit'))

  // A newer server is left alone by an older mod.
  calls.length = 0
  version = '0.20.0'
  await $.command.run({ command: 'kontor', args: '' } as never)
  expect(calls).not.toContain('POST /api/quit')
  expect(calls).not.toContain('start')
})

test('a server too old to know /api/quit is stopped by its process, and the new one started', async ($, on) => {
  const clock = engine(on)
  let version: string | null = '0.10.0'
  const calls: string[] = []
  on('env.get', (_, e) => ({ value: e.name === 'OS' ? 'Windows_NT' : undefined }) as never)
  on('fs.read', (_, e) => ({ value: e.path.split(String.fromCharCode(92)).join('/').endsWith('.claude-plugin/plugin.json') ? JSON.stringify({ version: '0.16.1' }) : '' }) as never)
  on('http.fetch', (_, e) => {
    const path = new URL(e.url).pathname
    calls.push(`${e.init?.method ?? 'GET'} ${path}`)
    if (version === null) throw new Error('ECONNREFUSED')
    if (path === '/api/quit') return { value: { status: 404, ok: false, headers: {}, text: 'Ikke fundet' } } as never
    if (path === '/api/state') return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ token: 'old' }) } } as never
    return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ ok: true, app: 'agent-kontor', version }) } } as never
  })
  let script = ''
  on('process.run', (_, e) => {
    if (e.argv[0] === 'powershell.exe') {
      calls.push('stop by port')
      script = e.argv.join(' ')
      version = null
    }
    if (e.argv.includes('--detach')) {
      calls.push('start')
      version = '0.16.1'
    }
    return { value: { exitCode: 0, stdout: '', stderr: '' } } as never
  })

  await $.session.start(start())
  // It is given two seconds to step down by itself, on the engine's clock.
  const opening = $.command.run({ command: 'kontor', args: '' } as never)
  for (let i = 0; i < 30; i++) await clock.advance(200)
  await opening
  expect(calls).toContain('POST /api/quit')
  expect(calls).toContain('stop by port')
  // Only the process that runs this server's script is stopped.
  expect(script).toContain('4747')
  expect(script).toMatch(/server.*server.*mjs/)
  expect(calls.indexOf('start')).toBeGreaterThan(calls.indexOf('stop by port'))
})

test('a commit earns the lines in it that Edit and Write did not count, up to a cap', async ($, on) => {
  const clock = engine(on)
  const file = statusFile(on)
  let numstat = '120\t5\tsrc/a.ts\n-\t-\timg.png\n'
  const dirs: (string | undefined)[] = []
  on('process.run', (_, e) => {
    if (e.argv[0] === 'git') dirs.push(e.init?.cwd)
    return { value: { exitCode: 0, stdout: e.argv[0] === 'git' ? numstat : '', stderr: '' } } as never
  })
  await $.session.start(start())
  const earned = () => (JSON.parse(JSON.stringify(file.last())) as { earned: Record<string, number> }).earned

  // The Edit counts +2 −1; the commit holds 120 and 5: the rest is new.
  await $.tool.call({ tool: 'Edit', file_path: 'C:/p/a.ts', old_string: 'a', new_string: 'b', tool_use_id: 'e1' } as never)
  await $.tool.call({ tool: 'Bash', command: 'git commit -m "lines from a script"', tool_use_id: 'c1' } as never)
  await clock.advance(600)
  expect(earned().added).toBe(120)
  expect(earned().removed).toBe(5)

  // A huge generated commit earns at most the cap; the folder after cd is where git looks.
  numstat = '5000\t0\tgenerated.json\n'
  await $.tool.call({ tool: 'Bash', command: 'cd /c/kode/andet && git commit -m big', tool_use_id: 'c2' } as never)
  await clock.advance(600)
  expect(earned().added).toBe(520)
  expect(dirs.at(-1)).toBe('c:/kode/andet')
})

test('the panel shows the saldo, wellbeing and streak once the office is open', async ($, on) => {
  const clock = engine(on)
  on('env.get', (_, e) => ({ value: e.name === 'OS' ? 'Windows_NT' : undefined }) as never)
  on('http.fetch', (_, e) => {
    const path = new URL(e.url).pathname
    const text = path === '/api/state'
      ? JSON.stringify({ game: { kroner: 1234, wellbeing: { score: 62 }, streak: { count: 3 }, achievements: [{ at: 1 }, { at: null }] } })
      : JSON.stringify({ ok: true, app: 'agent-kontor', version: '9.9.9' })
    return { value: { status: 200, ok: true, headers: {}, text } } as never
  })
  on('process.run', () => ({ value: { exitCode: 0, stdout: '', stderr: '' } }) as never)
  await $.session.start(start())
  const ui = await $.ui.mount({ plugin: 'agent-kontor', surface: 'desktop', component: 'Pane', requestId: 'kontor', props: paneProps })
  await clock.advance(3500)
  expect(JSON.stringify(await ui.drawn())).not.toContain('1.234 kr')

  await $.command.run({ command: 'kontor', args: '' } as never)
  await clock.advance(3500)
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('1.234 kr')
  expect(drawn).toContain('Trivsel 62')
  expect(drawn).toContain('3 dage i træk')
  expect(drawn).toContain('1 af 2')
})

test('a subagent sent to the background mid-call is delivered once, when it stops', async ($, on) => {
  const clock = engine(on, async e => {
    if (e.tool !== 'Agent') return undefined
    await $.agent.spawn({ tool_use_id: e.tool_use_id, prompt: 'p', description: 'Læs README', subagentType: 'Explore', parentModel: 'm', background: false } as never)
    // Ctrl+B: the call returns, and the subagent works on.
    return { result: { status: 'async_launched', agentId: `sub-${e.tool_use_id}` } }
  })
  const file = statusFile(on)
  on('agent.list', () => ({ value: [agentEntry('sub-k1', 'running')] }) as never)
  on('classic.SubagentStop', () => ({}) as never)
  await $.session.start(start())
  const earned = () => (JSON.parse(JSON.stringify(file.last())) as { earned: Record<string, number> }).earned

  await $.tool.call({ tool: 'Agent', prompt: 'p', description: 'Læs README', tool_use_id: 'k1' } as never)
  await clock.advance(13_000)
  expect(file.last()?.subs[0]?.phase).toBe('working')
  expect(earned().delivered).toBe(0)

  await $.tool.call({ tool: 'Read', file_path: 'C:/x/README.md', tool_use_id: 'r1', agentId: 'sub-k1' } as never)
  await $.classic.SubagentStop({ agent_id: 'sub-k1', agent_type: 'Explore', stop_hook_active: false, agent_transcript_path: '' } as never)
  await clock.advance(600)
  expect(file.last()?.subs[0]?.phase).toBe('delivering')
  expect(earned().delivered).toBe(1)
})

test('a helper the engine never lists stays at work while it works, and is delivered once when quiet', async ($, on) => {
  const clock = engine(on)
  const file = statusFile(on)
  on('agent.list', () => ({ value: [] }) as never)
  await $.session.start(start())
  const earned = () => (JSON.parse(JSON.stringify(file.last())) as { earned: Record<string, number> }).earned

  // A workflow's agent: only its tool calls are seen.
  for (let i = 0; i < 5; i++) {
    await $.tool.call({ tool: 'Read', file_path: 'C:/x/a.ts', tool_use_id: `w${i}`, agentId: 'wf-1' } as never)
    await clock.advance(30_000)
  }
  expect(file.last()?.subs[0]?.phase).toBe('working')
  expect(earned().delivered).toBe(0)

  await clock.advance(40_000)
  expect(file.last()?.subs[0]?.phase).toBe('delivering')
  expect(earned().delivered).toBe(1)
  await clock.advance(5 * 60_000)
  expect(earned().delivered).toBe(1)
})

test('a test word in a commit message is a commit, and a command doing both pays for both', async ($, on) => {
  const clock = engine(on)
  const file = statusFile(on)
  on('process.run', () => ({ value: { exitCode: 0, stdout: '', stderr: '' } }) as never)
  await $.session.start(start())
  const earned = () => (JSON.parse(JSON.stringify(file.last())) as { earned: Record<string, number> }).earned

  await $.tool.call({ tool: 'Bash', command: 'git commit -m "Fix jest config and node --test"', tool_use_id: 'c1' } as never)
  await $.tool.call({ tool: 'Bash', command: "git commit -m 'npm test is green'", tool_use_id: 'c2' } as never)
  await clock.advance(600)
  expect(earned().commits).toBe(2)
  expect(earned().tests).toBe(0)

  await $.tool.call({ tool: 'Bash', command: 'npm test && git commit -m x', tool_use_id: 'c3' } as never)
  await clock.advance(600)
  expect(earned().commits).toBe(3)
  expect(earned().tests).toBe(1)
})

test('commit lines: a partial commit leaves the rest counted, an amend counts only its change, git looks in the right repo', async ($, on) => {
  const clock = engine(on)
  const file = statusFile(on)
  let numstat = ''
  const runs: { argv: string[]; cwd?: string }[] = []
  on('process.run', (_, e) => {
    if (e.argv[0] === 'git') runs.push({ argv: [...e.argv], cwd: e.init?.cwd })
    return { value: { exitCode: 0, stdout: e.argv[0] === 'git' ? numstat : '', stderr: '' } } as never
  })
  await $.session.start(start())
  const earned = () => (JSON.parse(JSON.stringify(file.last())) as { earned: Record<string, number> }).earned

  // Three edits of +2 −1: +6 −3 counted already.
  for (const id of ['e1', 'e2', 'e3']) await $.tool.call({ tool: 'Edit', file_path: 'C:/p/a.ts', old_string: 'a', new_string: 'b', tool_use_id: id } as never)
  // A partial commit holds two of them; the third is committed next.
  numstat = '4\t2\ta.ts\n'
  await $.tool.call({ tool: 'Bash', command: 'git commit -m first', tool_use_id: 'c1' } as never)
  numstat = '2\t1\ta.ts\n'
  await $.tool.call({ tool: 'Bash', command: 'git commit -m second', tool_use_id: 'c2' } as never)
  await clock.advance(600)
  expect(earned().added).toBe(6)
  expect(earned().removed).toBe(3)

  // An amend asks git for what changed since the commit it replaced.
  numstat = '10\t0\tb.ts\n'
  await $.tool.call({ tool: 'Bash', command: 'git commit --amend --no-edit', tool_use_id: 'c3' } as never)
  await clock.advance(600)
  expect(runs.at(-1)?.argv).toEqual(['git', 'diff', '--numstat', 'HEAD@{1}', 'HEAD'])
  expect(earned().added).toBe(16)

  // git -C, PowerShell's Set-Location and a cd later in the command.
  numstat = ''
  await $.tool.call({ tool: 'Bash', command: 'git -C ../andet commit -m x', tool_use_id: 'c4' } as never)
  expect(runs.at(-1)?.argv.slice(0, 3)).toEqual(['git', '-C', '../andet'])
  await $.tool.call({ tool: 'PowerShell', command: 'Set-Location "C:\\kode\\tredje"; git add .; git commit -m x', tool_use_id: 'c5' } as never)
  expect(runs.at(-1)?.cwd).toBe('C:/kode/tredje')
  await $.tool.call({ tool: 'Bash', command: 'npm test && cd /c/kode/fjerde && git commit -m "cd nowhere"', tool_use_id: 'c6' } as never)
  expect(runs.at(-1)?.cwd).toBe('c:/kode/fjerde')
})

test('a command that first changes folder shows the program after it', async ($, on) => {
  const seen: string[] = []
  let snapshot = async () => ''
  engine(on, async e => {
    if (e.tool === 'Bash' || e.tool === 'PowerShell') seen.push(await snapshot())
    return undefined
  })
  await $.session.start(start())
  const ui = await $.ui.mount({ plugin: 'agent-kontor', surface: 'desktop', component: 'Pane', requestId: 'kontor', props: paneProps })
  snapshot = async () => JSON.stringify(await ui.drawn())

  await $.tool.call({ tool: 'Bash', command: 'cd "/c/kode/med mellemrum" && npm test', tool_use_id: 'b1' } as never)
  await $.tool.call({ tool: 'PowerShell', command: 'Set-Location C:\kode; git status', tool_use_id: 'b2' } as never)
  expect(seen[0]).toContain('Kører npm test')
  expect(seen[1]).toContain('Kører git status')
  expect(seen.join('')).not.toContain('Kører cd')
})

test('a helper carries its agent type and model in the status file', async ($, on) => {
  const clock = engine(on, async e => {
    if (e.tool === 'Agent') await $.agent.spawn({ tool_use_id: e.tool_use_id, prompt: 'p', description: 'Kortlæg API’et', subagentType: 'Explore', parentModel: 'm', background: true } as never)
    return undefined
  })
  const file = statusFile(on)
  await $.session.start(start())
  await $.tool.call({ tool: 'Agent', prompt: 'p', description: 'Kortlæg API’et', tool_use_id: 'k1', run_in_background: true } as never)
  await clock.advance(600)
  const sub = file.last()?.subs[0] as unknown as { type?: string; model?: string }
  expect(sub.type).toBe('Explore')
  expect(sub.model).toBe('claude-haiku-5-5')
})

test("a subagent's permission dialog marks the subagent as waiting, not Claude", async ($, on) => {
  const clock = engine(on, async e => {
    if (e.tool === 'Agent') await $.agent.spawn({ tool_use_id: e.tool_use_id, prompt: 'p', description: 'Ryd op', subagentType: 'general-purpose', parentModel: 'm', background: true } as never)
    return undefined
  })
  const file = statusFile(on)
  await $.session.start(start())
  await $.tool.call({ tool: 'Agent', prompt: 'p', description: 'Ryd op', tool_use_id: 'p1', run_in_background: true } as never)
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'rm x' }, agent_id: 'sub-p1' } as never)
  await clock.advance(600)
  expect(file.last()?.subs[0]?.phase).toBeDefined()
  expect((file.last()?.subs[0] as unknown as { activity: { state: string } }).activity.state).toBe('waiting')
  expect(file.last()?.main.state).not.toBe('waiting')
})

test("the status file carries Claude's last turn, the context's fill and a helper's answer", async ($, on) => {
  const clock = engine(on, async e => {
    if (e.tool === 'Agent') await $.agent.spawn({ tool_use_id: e.tool_use_id, prompt: 'p', description: 'Kortlæg API’et', subagentType: 'Explore', parentModel: 'm', background: true } as never)
    return undefined
  })
  const file = statusFile(on)
  on('session.measure', (_, e) => ({ changed: e.changed }) as never)
  await $.session.start(start())
  await $.tool.call({ tool: 'Agent', prompt: 'p', description: 'Kortlæg API’et', tool_use_id: 'q1', run_in_background: true } as never)
  await $.turn.complete({ reason: 'answer', answer: '  API’et har tre endepunkter: /a, /b og /c.  ', durationMs: 5000, isAborted: false, turnId: 't2', agentId: 'sub-q1' } as never)
  await $.turn.complete({ reason: 'answer', answer: 'Færdig', durationMs: 240_000, isAborted: false, turnId: 't3' } as never)
  await $.session.measure({ context: { window: 200_000, tokens: 90_000, percent: 45 }, rateLimits: [], changed: ['context'] } as never)
  await clock.advance(600)
  const status = file.last() as unknown as { turn: { ms: number; isAborted: boolean }; stats: { context: number }; subs: { answer?: string }[] }
  expect(status.turn.ms).toBe(240_000)
  expect(status.turn.isAborted).toBe(false)
  expect(status.stats.context).toBe(45)
  expect(status.subs[0]?.answer).toBe('API’et har tre endepunkter: /a, /b og /c.')
})

test('a teammate stays at its desk between turns, hands in each task from the list and walks back', async ($, on) => {
  const clock = engine(on, async e => {
    if (e.tool !== 'Agent') return undefined
    await $.agent.spawn({ tool_use_id: e.tool_use_id, prompt: 'p', description: 'Undersøg API’et', subagentType: 'teammate', parentModel: 'm', background: true, isTeammate: true, name: 'researcher' } as never)
    return { result: { status: 'teammate_spawned', agent_id: `sub-${e.tool_use_id}`, teammate_id: 'researcher@team', name: 'researcher' } }
  })
  const file = statusFile(on)
  let status = 'running'
  on('agent.list', () => ({ value: [agentEntry('sub-t1', status)] }) as never)
  on('classic.SubagentStop', () => ({}) as never)
  on('classic.TaskCompleted', () => ({}) as never)
  await $.session.start(start())
  type Seen = { phase: string; teammate?: string; from?: string; activity: { state: string; detail: string } }
  const sub = () => file.last()?.subs[0] as unknown as Seen
  const earned = () => (JSON.parse(JSON.stringify(file.last())) as { earned: Record<string, number> }).earned

  await $.tool.call({ tool: 'Agent', prompt: 'p', description: 'Undersøg API’et', tool_use_id: 't1', name: 'researcher' } as never)
  await clock.advance(13_000)
  expect(sub().phase).toBe('working')
  expect(sub().teammate).toBe('researcher')

  // Its turn ends: it waits for a message, at its desk, and no stop sends it home.
  await $.turn.complete({ reason: 'answer', answer: 'Klar', durationMs: 1000, isAborted: false, turnId: 'a1', agentId: 'sub-t1' } as never)
  status = 'idle'
  await $.classic.SubagentStop({ agent_id: 'sub-t1', agent_type: 'researcher', stop_hook_active: false, agent_transcript_path: '' } as never)
  await clock.advance(4000)
  expect(sub().phase).toBe('working')
  expect(sub().activity.detail).toBe('Venter på en besked')

  // A message wakes it; its turn is its own, not Claude's.
  await $.turn.start({ text: 'Næste', turnId: 'a2', agentId: 'sub-t1' } as never)
  await clock.advance(600)
  expect(sub().activity.detail).toBe('Tænker')
  expect(file.last()?.main.detail).not.toBe('Tænker')

  // A task from the team's list done: over to Claude with it, and back.
  await $.classic.TaskCompleted({ task_id: '1', task_subject: 'Skriv tests til API’et', teammate_name: 'researcher' } as never)
  await clock.advance(600)
  expect(sub().phase).toBe('delivering')
  expect(sub().activity.detail).toBe('Afleverer: Skriv tests til API’et')
  expect(earned().delivered).toBe(1)
  await clock.advance(11_000)
  expect(sub().phase).toBe('arriving')
  expect(sub().from).toBe('handover')
  await clock.advance(13_000)
  expect(sub().phase).toBe('working')

  // The team is done: it goes home, and that earns nothing more.
  status = 'completed'
  await clock.advance(3500)
  expect(sub().phase).toBe('delivering')
  expect(earned().delivered).toBe(1)
})

test('without Node.js, the button says what is missing and where to get it', async ($, on) => {
  engine(on)
  const toasts: string[] = []
  on('ui.toast', (_, e) => {
    toasts.push((e as { text: string }).text)
    return { value: undefined } as never
  })
  on('env.get', (_, e) => ({ value: e.name === 'OS' ? 'Windows_NT' : undefined }) as never)
  on('http.fetch', () => {
    throw new Error('ECONNREFUSED')
  })
  on('process.run', () => {
    throw new Error('ENOENT: node')
  })
  await $.session.start(start())
  const band = await $.ui.mount({ plugin: 'agent-kontor', surface: 'desktop', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 10 } as never })
  await band.press({ key: 'kontor' })
  expect(toasts.join(' ')).toContain('Node.js 18')
  expect(toasts.join(' ')).toContain('https://nodejs.org')
  const answer = (await $.command.run({ command: 'kontor', args: '' } as never)) as { text: string }
  expect(answer.text).toContain('ikke installeret')
})

// Your own agents, as the engine lists them for the Agent tool.
const usageWith = (on: On, agents: string[]) =>
  on('session.usage', () => ({ value: { startedAt: 0, context: { percent: 5, breakdown: { agents: agents.map(agentType => ({ agentType, source: 'projectSettings', tokens: 10 })) } }, rateLimits: [] } }) as never)
type Regular = { id: string; seat: number; phase: string; from?: string; task: string; job?: string; isOnJob?: boolean; answer?: string; tools?: number; activity: { state: string; detail: string } }

test('your own agents are regulars: in all day at the first desks, they take the jobs of their type and walk back', async ($, on) => {
  const clock = engine(on, async e => {
    if (e.tool !== 'Agent') return undefined
    const x = e as unknown as { subagent_type: string; description: string }
    await $.agent.spawn({ tool_use_id: e.tool_use_id, prompt: 'p', description: x.description, subagentType: x.subagent_type, parentModel: 'm', background: true } as never)
    return { result: { status: 'async_launched' } }
  })
  usageWith(on, ['qa-tester', 'code-reviewer'])
  on('classic.SubagentStop', () => ({}) as never)
  const file = statusFile(on)
  const subs = () => file.last()?.subs as unknown as Regular[]
  const one = (id: string) => subs().find(s => s.id === id) as Regular
  const earned = () => (JSON.parse(JSON.stringify(file.last())) as { earned: Record<string, number> }).earned
  const call = (id: string, type: string, description: string) => $.tool.call({ tool: 'Agent', prompt: 'p', description, subagent_type: type, tool_use_id: id } as never)

  await $.session.start(start())
  await clock.advance(2000)
  // In by the door, in name order, on the lowest seats.
  expect(subs().map(s => [s.id, s.seat, s.phase])).toEqual([
    ['staff-code-reviewer', 0, 'arriving'],
    ['staff-qa-tester', 1, 'arriving'],
  ])
  expect((file.last() as unknown as { agents: string[] }).agents).toEqual(['code-reviewer', 'qa-tester'])
  await clock.advance(13_000)
  expect(one('staff-code-reviewer').phase).toBe('working')
  expect(one('staff-code-reviewer').activity.detail).toBe('Klar til en opgave')

  // A job of its type is the regular's: nobody new comes in.
  await call('a1', 'code-reviewer', 'Gennemgå diffen')
  await $.tool.call({ tool: 'Read', file_path: 'C:/x/api.ts', tool_use_id: 'r1', agentId: 'sub-a1' } as never)
  await clock.advance(600)
  expect(subs().length).toBe(2)
  expect(one('staff-code-reviewer')).toMatchObject({ job: 'sub-a1', isOnJob: true, task: 'Gennemgå diffen', tools: 1, phase: 'working' })

  // A second job of the same kind at once comes in as a helper of its own,
  // after the regulars, and so does a job of another kind.
  await call('a2', 'code-reviewer', 'Gennemgå testene')
  await call('a3', 'general-purpose', 'Find gammel kode')
  await clock.advance(600)
  expect(subs().map(s => [s.id, s.seat])).toEqual([
    ['staff-code-reviewer', 0],
    ['staff-qa-tester', 1],
    ['sub-a2', 2],
    ['sub-a3', 3],
  ])

  // Done: over to Claude with it, and back to its desk, ready again.
  await $.classic.SubagentStop({ agent_id: 'sub-a1', agent_type: 'code-reviewer', stop_hook_active: false, agent_transcript_path: '' } as never)
  await $.turn.complete({ reason: 'answer', answer: 'To fejl i api.ts', durationMs: 1000, isAborted: false, turnId: 'x1', agentId: 'sub-a1' } as never)
  await clock.advance(600)
  expect(one('staff-code-reviewer')).toMatchObject({ phase: 'delivering', isOnJob: false, answer: 'To fejl i api.ts' })
  expect(one('staff-code-reviewer').activity.detail).toBe('Afleverer: Gennemgå diffen')
  expect(earned().delivered).toBe(1)
  // A stop said twice earns once.
  await $.classic.SubagentStop({ agent_id: 'sub-a1', agent_type: 'code-reviewer', stop_hook_active: false, agent_transcript_path: '' } as never)
  await clock.advance(11_000)
  expect(earned().delivered).toBe(1)
  expect(one('staff-code-reviewer')).toMatchObject({ phase: 'arriving', from: 'handover', task: '' })
  await clock.advance(13_000)
  expect(one('staff-code-reviewer').phase).toBe('working')
  expect(one('staff-code-reviewer').activity.detail).toBe('Klar til en opgave')
})

test('a regular taken off the staff on the page goes home between jobs, and one taken on comes in', async ($, on) => {
  const clock = engine(on)
  usageWith(on, ['code-reviewer', 'qa-tester'])
  let crew = JSON.stringify({ removed: ['qa-tester'] })
  on('fs.read', (_, e) => ({ value: e.path.endsWith('crew.json') ? crew : '' }) as never)
  const file = statusFile(on)
  const subs = () => file.last()?.subs as unknown as Regular[]

  await $.session.start(start())
  await clock.advance(2000)
  expect(subs().map(s => s.id)).toEqual(['staff-code-reviewer'])

  crew = JSON.stringify({ removed: ['code-reviewer'] })
  await clock.advance(3500)
  expect(subs().map(s => [s.id, s.phase, s.seat])).toEqual([
    ['staff-code-reviewer', 'leaving', 0],
    ['staff-qa-tester', 'arriving', 0],
  ])
  await clock.advance(10_000)
  expect(subs().map(s => s.id)).toEqual(['staff-qa-tester'])
})

test("a plugin's agent is no regular until it is put on the staff", async ($, on) => {
  const clock = engine(on)
  usageWith(on, ['code-reviewer', 'stripe:Company Researcher'])
  let crew = ''
  on('fs.read', (_, e) => ({ value: e.path.endsWith('crew.json') ? crew : '' }) as never)
  const file = statusFile(on)
  const subs = () => file.last()?.subs as unknown as Regular[]

  await $.session.start(start())
  await clock.advance(2000)
  expect(subs().map(s => s.id)).toEqual(['staff-code-reviewer'])

  crew = JSON.stringify({ added: ['stripe:Company Researcher'] })
  await clock.advance(3500)
  expect(subs().map(s => [s.id, s.seat])).toEqual([
    ['staff-code-reviewer', 0],
    ['staff-stripe:Company Researcher', 1],
  ])
  expect(subs()[1]).toMatchObject({ name: 'Company Researcher' })
})
