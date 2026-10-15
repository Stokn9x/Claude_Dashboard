import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

const bandProps = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 12,
  bodyColumns: 100,
  scroll: { offset: 0, bodyRows: 12 },
  view: {},
}

const START = Date.UTC(2026, 9, 15, 9, 0)

const engine = (on: On) => {
  on('ui.render', () => ({ type: 'Box', props: {}, children: [] }))
  on('clock.now', () => ({ value: START + 42 * 60_000 }))
  on('clock.every', () => ({ value: undefined }) as never)
  on('command.register', () => ({ value: { command: 'dashboard' } }) as never)
  on('session.start', (_, e) => e as never)
  on('session.usage', () => ({
    value: {
      startedAt: START,
      context: { tokens: 84_000, window: 200_000, percent: 42 },
      rateLimits: [
        { kind: 'five_hour', percentUsed: 37, resetsAt: '2026-10-15T12:30:00Z' },
        { kind: 'seven_day', percentUsed: 86, resetsAt: '2026-10-20T08:00:00Z' },
      ],
      cost: { usd: 1.234 },
    },
  }))
  on('turn.complete', () => ({ text: 'svar' }))
  on('session.measure', (_, e) => ({ changed: e.changed }) as never)
}

const patch = (added: number, removed: number) => [
  { oldStart: 1, oldLines: removed, newStart: 1, newLines: added, lines: [...Array(removed).fill('-gammel'), ...Array(added).fill('+ny'), ' uændret'] },
]

for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: shows context, limits, cost and the session's lines of code`, async ($, on) => {
    engine(on)
    on('tool.call', (_, e) => {
      if (e.tool === 'Edit') {
        return { result: { filePath: 'C:/x/a.ts', structuredPatch: patch(5, 2), staged: false } } as never
      }
      if (e.tool === 'Write') {
        return { result: { type: 'create', filePath: 'C:/x/b.ts', content: 'en\nto\ntre\n', structuredPatch: [], originalFile: null } } as never
      }
      return { result: {} } as never
    })

    await $.session.start({ source: 'startup', cwd: 'C:/x' } as never)
    await $.tool.call({ tool: 'Edit', input: { file_path: 'C:/x/a.ts', old_string: 'a', new_string: 'b' }, tool_use_id: 't1' } as never)
    await $.tool.call({ tool: 'Edit', input: { file_path: 'C:/x/a.ts', old_string: 'c', new_string: 'd' }, tool_use_id: 't2' } as never)
    await $.tool.call({ tool: 'Write', input: { file_path: 'C:/x/b.ts', content: 'en\nto\ntre\n' }, tool_use_id: 't3' } as never)
    await $.turn.complete({
      reason: 'answer',
      answer: 'ok',
      durationMs: 1,
      isAborted: false,
      turnId: 'u1',
      usage: { model: 'claude-opus-5-5', input_tokens: 1200, output_tokens: 3400, cache_read_input_tokens: 9000, cache_creation_input_tokens: 800 },
    } as never)

    const ui = await $.ui.mount({ plugin: 'session-dashboard', surface, component: 'AbovePrompt', props: bandProps as never })
    const drawn = JSON.stringify(await ui.drawn())

    // Two edits of +5/−2 and a new three-line file: +13 −4 over two files.
    expect(drawn).toContain('+13')
    expect(drawn).toContain('−4')
    expect(drawn).toContain('42%')
    expect(drawn).toContain('$1.23')
    if (surface === 'desktop') {
      expect(drawn).toContain('KONTEKST')
      expect(drawn).toContain('84k/200k')
      expect(drawn).toContain('5 TIMER')
      expect(drawn).toContain('86%')
      expect(drawn).toContain('2 filer')
      expect(drawn).toContain('42 min')
      expect(drawn).toContain('1 tur · 3.4k ud')
    } else {
      expect(drawn).toContain('5 timer')
      expect(drawn).toContain('2 filer')
    }

    await ui.press({ key: 'dash-close' })
    const folded = JSON.stringify(await ui.drawn())
    expect(folded).toContain('42% kontekst')
    expect(folded).not.toContain('KONTEKST')
    expect(await ui.find({ key: 'dash-open' })).toBeDefined()
  })

  test(`${surface}: a failed or staged edit counts no lines`, async ($, on) => {
    engine(on)
    on('tool.call', (_, e) =>
      e.tool_use_id === 'bad'
        ? ({ result: { filePath: 'C:/x/a.ts', structuredPatch: patch(9, 9) }, isError: true } as never)
        : ({ result: { filePath: 'C:/x/a.ts', structuredPatch: patch(7, 7), staged: true } } as never),
    )

    await $.session.start({ source: 'startup', cwd: 'C:/x' } as never)
    await $.tool.call({ tool: 'Edit', input: { file_path: 'C:/x/a.ts', old_string: 'a', new_string: 'b' }, tool_use_id: 'bad' } as never)
    await $.tool.call({ tool: 'Edit', input: { file_path: 'C:/x/a.ts', old_string: 'a', new_string: 'b' }, tool_use_id: 'staged' } as never)

    const ui = await $.ui.mount({ plugin: 'session-dashboard', surface, component: 'AbovePrompt', props: bandProps as never })
    const drawn = JSON.stringify(await ui.drawn())
    expect(drawn).toContain('+0')
    expect(drawn).toContain('−0')
  })
}
