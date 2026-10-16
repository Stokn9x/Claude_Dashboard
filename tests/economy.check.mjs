// Runs the office server against a temporary home folder and checks the
// game's money: kroner credited once, across a restart and when a session
// ends; buying only from the page and only with the money; wellbeing.
// Expectations are worked out from the rates and prices the server reports,
// so a change of balance does not break the check.
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
const game = async () => (await state()).game
// The saldo without the rewards for achievements and the daily bonus, which come on top
const earnedKr = async () => {
  const g = await game()
  return g.kroner - g.achievements.filter(a => a.at).reduce((sum, a) => sum + a.reward, 0) - (g.stats.totals.bonus ?? 0)
}
const write = (key, earned, extra = {}) =>
  fs.writeFileSync(path.join(dir, `${key}.json`), JSON.stringify({ v: 2, key, project: 'p', updatedAt: Date.now(), main: { state: 'idle', detail: 'x' }, subs: [], earned, ...extra }))
let failures = 0
const check = (label, actual, expected) => {
  const ok = actual === expected
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${actual}${ok ? '' : ` (expected ${expected})`}`)
  if (!ok) failures += 1
}
// The saldo is shown rounded down: allow a krone either side.
const near = (label, actual, expected) => check(label, Math.abs(actual - expected) <= 1, true)

const zero = { added: 0, removed: 0, delivered: 0, tests: 0, commits: 0, prs: 0 }
const worth = (rates, counts) => Object.entries(counts).reduce((sum, [k, n]) => sum + n * (rates[k] ?? 0), 0)

let child = start()
await sleep(900)
const first = await game()
const { rates } = first
check('starts with no kroner', first.kroner, 0)
check('starts with no desks', first.owned.desks, 0)
check('a bare office has wellbeing 40', first.wellbeing.score, 40)
const bare = first.wellbeing.multiplier

// Earning
let total = 0
write('sA', { ...zero, added: 400, removed: 100, delivered: 2 })
total += worth(rates, { added: 400, removed: 100, delivered: 2 }) * bare
await sleep(900)
near('the first counts are credited', await earnedKr(), total)

write('sA', { ...zero, added: 600, removed: 100, delivered: 2, tests: 1 })
total += worth(rates, { added: 200, tests: 1 }) * bare
await sleep(900)
near('only the growth is credited', await earnedKr(), total)

child.kill()
await sleep(300)
child = start()
await sleep(900)
near('a restart credits nothing twice', await earnedKr(), total)

// The session ends with a last commit in its final file, which then goes.
fs.writeFileSync(path.join(dir, 'sA.json'), JSON.stringify({ key: 'sA', ended: true, earned: { ...zero, added: 600, removed: 100, delivered: 2, tests: 1, commits: 1 }, updatedAt: 0 }))
total += worth(rates, { commits: 1 }) * bare
await sleep(900)
near('the ending file is credited', await earnedKr(), total)
check('and then removed', fs.existsSync(path.join(dir, 'sA.json')), false)
near('spil.json has the kroner', JSON.parse(fs.readFileSync(path.join(home, '.claude', 'agent-kontor', 'spil.json'), 'utf8')).kroner, total + (await game()).kroner - (await earnedKr()))

// Buying: only from the page (Origin and token), and only what you can afford.
const buy = (headers, item = 'desk') =>
  fetch(`http://127.0.0.1:${PORT}/api/buy`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ item }) })
const { token } = await state()
const origin = `http://127.0.0.1:${PORT}`
const page = { origin, 'x-kontor-token': token }
check('a buy without the token is refused', (await buy({ origin })).status, 403)
check('a buy from another site is refused', (await buy({ origin: 'https://example.com', 'x-kontor-token': token })).status, 403)
const deskPrice = (await game()).next.desk
check('a desk you cannot afford is refused', (await buy(page)).status, 409)

// Earn enough for the desk, with lines from a second session.
let linesB = Math.ceil((deskPrice - (await game()).kroner) / (rates.added * bare)) + 40
write('sB', { ...zero, added: linesB })
total += linesB * rates.added * bare
await sleep(900)
near('earned enough', await earnedKr(), total)
check('buying the desk works', (await buy(page)).status, 200)
total -= deskPrice
const afterDesk = await game()
check('one desk now', afterDesk.owned.desks, 1)
near('and the price is paid', await earnedKr(), total)
check('the next desk costs more', afterDesk.next.desk > deskPrice, true)

// Rooms: bought once, and only with the money for them.
const kitchenPrice = afterDesk.next.kitchen
check('the kitchen cannot be afforded yet', (await buy(page, 'kitchen')).status, 409)
const more = Math.ceil((kitchenPrice - (await game()).kroner) / (rates.added * bare)) + 40
linesB += more
write('sB', { ...zero, added: linesB })
total += more * rates.added * bare
await sleep(900)
check('buying the kitchen works', (await buy(page, 'kitchen')).status, 200)
total -= kitchenPrice
const withKitchen = await game()
check('the kitchen is owned', withKitchen.owned.rooms.includes('kitchen'), true)
check('and not for sale again', withKitchen.next.kitchen, null)
check('a second kitchen is refused', (await buy(page, 'kitchen')).status, 409)
check('something unknown is refused', (await buy(page, 'castle')).status, 409)

// Wellbeing: a kitchen lifts it; helpers on the floor bring it down.
check('wellbeing with a kitchen is 55', withKitchen.wellbeing.score, 55)
const helpers = n => Array.from({ length: n }, (_, i) => ({ id: `h${i}`, seat: i, phase: 'working' }))
write('sB', { ...zero, added: linesB }, { subs: helpers(4) })
await sleep(900)
const crowded = await game()
check('three on the floor take 24 off', crowded.wellbeing.score, 31)
check('and earnings are multiplied by 0.92', crowded.wellbeing.multiplier, 0.92)
const before = crowded.kroner
write('sB', { ...zero, added: linesB + 400 }, { subs: helpers(4) })
await sleep(900)
near('400 lines earn less at that wellbeing', (await game()).kroner - before, 400 * rates.added * 0.92)

// Statistics and achievements
const stats = (await game()).stats
check('today counts every line credited', stats.today.added, linesB + 400 + 600)
check('fourteen days of history', stats.days.length, 14)
const achieved = Object.fromEntries((await game()).achievements.map(a => [a.id, a.at !== null]))
check('first line achieved', achieved['lines-1'], true)
check('1.000 lines achieved', achieved['lines-1k'], true)
check('first desk achieved', achieved['desk-3'], true)
check('kitchen achieved', achieved['kitchen'], true)
check('100.000 lines not yet', achieved['lines-100k'], false)
// Decor is for sale, and lifts wellbeing
const g0 = await game()
check('plants are for sale', typeof g0.next.plants, 'number')

// Stepping down for a newer server: only with the token
check('quit without the token is refused', (await fetch(`http://127.0.0.1:${PORT}/api/quit`, { method: 'POST' })).status, 403)
check('quit with the token works', (await fetch(`http://127.0.0.1:${PORT}/api/quit`, { method: 'POST', headers: { 'x-kontor-token': token } })).status, 200)
await sleep(500)
check('and the server is gone', await fetch(`http://127.0.0.1:${PORT}/health`).then(() => 'up', () => 'gone'), 'gone')

child.kill()
fs.rmSync(home, { recursive: true, force: true })
process.exitCode = failures ? 1 : 0
