import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const paneProps = { title: '🏢 Kontor', isFocused: true, bodyColumns: 70 } as never

const json = (status: number, body: unknown) => ({
  value: { status, ok: status < 300, headers: {}, text: body === undefined ? '' : JSON.stringify(body) },
})

type Report = { id: string; state: string; detail: string; parent_id: string | null; office_id: string; lines_added: number }

const fakeSupabase = (people: unknown[] = []) => {
  const offices: { id: string; name: string; invite_code: string; members: number }[] = []
  const reports: Report[] = []
  const gone: string[] = []

  const handle = (url: string, init?: { body?: string }) => {
    const path = url.replace('https://yqdumafjvdyabojuajeo.supabase.co', '')
    const body = init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : {}
    if (path === '/auth/v1/signup') return json(200, { access_token: 'jwt', refresh_token: 'r', expires_in: 3600, user: { id: 'me' } })
    if (path === '/rest/v1/rpc/my_offices') return json(200, offices)
    if (path === '/rest/v1/rpc/create_office') {
      const o = { id: `o${offices.length + 1}`, name: String(body.office_name), invite_code: 'KONT-0R23', members: 1 }
      offices.push(o)
      return json(200, o)
    }
    if (path === '/rest/v1/rpc/join_office') {
      if (body.code !== 'TEAM-2026') return json(400, { message: 'unknown_code' })
      const o = { id: 'team', name: 'Copenhagen Data', invite_code: 'TEAM-2026', members: 3 }
      offices.push(o)
      return json(200, o)
    }
    if (path === '/rest/v1/rpc/report_agent') {
      reports.push(body.a as Report)
      return json(204, undefined)
    }
    if (path === '/rest/v1/rpc/agent_gone') {
      gone.push(String(body.agent_id))
      return json(204, undefined)
    }
    if (path === '/rest/v1/rpc/office_view') return json(200, people)

    return json(404, { message: `not mocked: ${path}` })
  }

  return { handle, reports, gone }
}

const engine = (on: On, api: ReturnType<typeof fakeSupabase>) => {
  const store = new Map<string, unknown>()
  on('ui.render', () => ({ type: 'Box', props: {}, children: [] }))
  on('ui.toast', () => ({ value: undefined }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('ui.copy', () => ({ value: { isCopied: true } }) as never)
  on('command.register', () => ({ value: { command: 'kontor' } }) as never)
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => {
    store.set(e.key, e.value)
    return { value: undefined }
  })
  on('store.delete', (_, e) => {
    store.delete(e.key)
    return { value: undefined }
  })
  on('session.start', (_, e) => e as never)
  on('turn.start', (_, e) => e as never)
  on('turn.complete', () => ({ text: 'ok' }))
  on('tool.check', () => ({ decision: 'ask' }) as never)
  on('tool.call', (_, e) =>
    e.tool === 'Edit'
      ? ({ result: { filePath: 'C:/p/a.ts', structuredPatch: [{ lines: ['+a', '+b', '-c'] }] } } as never)
      : ({ result: {} } as never),
  )
  on('http.fetch', (_, e) => api.handle(e.url, e.init))

  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 15, 10) })

  return { store, clock }
}

const lastFor = (reports: Report[], id: string) => reports.filter(r => r.id === id).pop()

// Reports go out in the background, so Claude never waits on the network;
// moving the mocked clock by nothing lets the event loop settle them.
for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: name, connect with a code, and the session reports what it does`, async ($, on) => {
    const api = fakeSupabase()
    const { clock } = engine(on, api)
    const wait = () => clock.advance(0)

    await $.session.start({ source: 'startup', cwd: 'C:/kode/team-chat' } as never)
    const ui = await $.ui.mount({ plugin: 'agent-kontor', surface, component: 'Pane', requestId: 'kontor', props: paneProps })

    await ui.input({ key: 'my-name', text: 'Casper' })
    expect(await ui.find({ key: 'join-code' })).toBeDefined()

    await ui.input({ key: 'join-code', text: 'team 2026' })
    await wait()
    const id = api.reports.at(-1)?.id ?? ''
    expect(id).toMatch(/^s-/)
    expect(api.reports.at(-1)).toMatchObject({ office_id: 'team', state: 'idle' })

    await $.turn.start({ text: 'hej', turnId: 't1' } as never)
    await wait()
    expect(lastFor(api.reports, id)).toMatchObject({ state: 'working', detail: 'Tænker' })

    // While Edit runs the office saw "editing"; after it, the lines are counted.
    await $.tool.call({ tool: 'Edit', file_path: 'C:/kode/team-chat/hooks/register.tsx', old_string: 'a', new_string: 'b', tool_use_id: 'u1' } as never)
    await wait()
    expect(api.reports.some(r => r.id === id && r.state === 'editing' && r.detail === 'Skriver register.tsx')).toBe(true)

    // A shell command shows the program, never its arguments or variables.
    await $.tool.call({ tool: 'Bash', command: 'API_KEY=hemmelig npm test --token=abc', tool_use_id: 'u2' } as never)
    await wait()
    const ran = api.reports.find(r => r.state === 'running')
    expect(ran?.detail).toBe('Kører npm test')
    expect(JSON.stringify(api.reports)).not.toContain('hemmelig')
    expect(JSON.stringify(api.reports)).not.toContain('abc')

    await $.tool.check({ tool: 'Bash', command: 'rm x', tool_use_id: 'u3' } as never)
    await wait()
    expect(lastFor(api.reports, id)).toMatchObject({ state: 'waiting', detail: 'Venter på din godkendelse' })

    await $.turn.complete({ reason: 'answer', answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1' } as never)
    await wait()
    expect(lastFor(api.reports, id)).toMatchObject({ state: 'idle', lines_added: 2 })
  })

  test(`${surface}: the office shows everyone's agents, the waiting ones first`, async ($, on) => {
    const agent = (id: string, state: string, project: string, detail: string, extra: object = {}) => ({
      id, parent_id: null, project, state, detail, model: 'claude-opus-5-5', tokens_out: 0, cost_usd: 1.5,
      lines_added: 12, lines_removed: 3, five_hour: 22, seven_day: null, started_at: '2026-10-15T09:00:00Z', updated_at: '2026-10-15T10:00:00Z', ...extra,
    })
    const api = fakeSupabase([
      { user_id: 'me', name: 'Casper', agents: [agent('s-casper-0001', 'editing', 'team-chat', 'Skriver register.tsx')] },
      {
        user_id: 'bip',
        name: 'Bertram',
        agents: [
          agent('s-bertram-001', 'waiting', 'crm', 'Venter på din godkendelse'),
          { ...agent('s-bertram-001:sub', 'reading', 'crm', 'Læser api.ts'), parent_id: 's-bertram-001' },
        ],
      },
      { user_id: 'ama', name: 'Amalie', agents: [] },
    ])
    const { store } = engine(on, api)
    store.set('session', { access_token: 'jwt', refresh_token: 'r', expires_at: Date.UTC(2030, 0, 1), user_id: 'me' })
    store.set('name', 'Casper')
    await api.handle('https://yqdumafjvdyabojuajeo.supabase.co/rest/v1/rpc/join_office', { body: JSON.stringify({ code: 'TEAM-2026' }) })

    await $.session.start({ source: 'startup', cwd: 'C:/kode/team-chat' } as never)
    const ui = await $.ui.mount({ plugin: 'agent-kontor', surface, component: 'Pane', requestId: 'kontor', props: paneProps })
    const drawn = JSON.stringify(await ui.drawn())

    expect(drawn).toContain('Bertrams agent på crm: Venter på din godkendelse')
    expect(drawn).toContain('1 hjælper')
    expect(drawn).toContain('Casper (dig)')
    expect(drawn).toContain('+12 −3 linjer')
    expect(drawn.lastIndexOf('Bertram')).toBeLessThan(drawn.lastIndexOf('Casper (dig)'))
    if (surface === 'desktop') expect(drawn).toContain('"type":"Svg"')

    await ui.press({ key: 'tab-invite-btn' })
    expect(await ui.find({ text: /TEAM-2026/ })).toBeDefined()
  })
}
