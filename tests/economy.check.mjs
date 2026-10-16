// Runs the office server against a temporary home folder and checks that
// kroner are credited once, survive a restart, and include an ending session.
//
//   node tests/economy.check.mjs
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const server = process.argv[2] ?? fileURLToPath(new URL('../server/server.mjs', import.meta.url))
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'kontor-'))
const dir = path.join(home, '.claude', 'agent-kontor', 'sessions')
fs.mkdirSync(dir, { recursive: true })
const PORT = '4749'
const sleep = ms => new Promise(r => setTimeout(r, ms))

const start = () => spawn(process.execPath, [server], { env: { ...process.env, USERPROFILE: home, HOME: home, AGENT_KONTOR_PORT: PORT }, stdio: 'ignore' })
const state = async () => (await fetch(`http://127.0.0.1:${PORT}/api/state`)).json()
const write = (earned, extra = {}) =>
  fs.writeFileSync(path.join(dir, 'sA.json'), JSON.stringify({ v: 2, key: 'sA', project: 'p', updatedAt: Date.now(), main: { state: 'idle', detail: 'x' }, subs: [], earned, ...extra }))
const check = (label, actual, expected) => {
  const ok = actual === expected
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${actual}${ok ? '' : ` (expected ${expected})`}`)
  if (!ok) process.exitCode = 1
}

const zero = { added: 0, removed: 0, delivered: 0, tests: 0, commits: 0, prs: 0 }
write({ ...zero, added: 100, removed: 10, delivered: 1 }) // 100 + 5 + 25 = 130
let child = start()
await sleep(900)
check('first credit', (await state()).game.kroner, 130)
check('starts with two desks', (await state()).game.owned.desks, 2)

write({ ...zero, added: 150, removed: 10, delivered: 1, tests: 1 }) // +50 +50 = 230
await sleep(900)
check('only the growth is credited', (await state()).game.kroner, 230)

child.kill()
await sleep(300)
child = start()
await sleep(900)
check('a restart credits nothing twice', (await state()).game.kroner, 230)

// The session ends with a last commit in its final file.
fs.writeFileSync(path.join(dir, 'sA.json'), JSON.stringify({ key: 'sA', ended: true, earned: { ...zero, added: 150, removed: 10, delivered: 1, tests: 1, commits: 1 }, updatedAt: 0 }))
await sleep(900)
check('the ending file is credited', (await state()).game.kroner, 260)
check('and then removed', fs.existsSync(path.join(dir, 'sA.json')), false)
check('spil.json has the kroner', JSON.parse(fs.readFileSync(path.join(home, '.claude', 'agent-kontor', 'spil.json'), 'utf8')).kroner, 260)

child.kill()
fs.rmSync(home, { recursive: true, force: true })
