// The office server against a temporary home folder: which files it hands
// out (and which it refuses), who may talk to it, the daily backup of
// spil.json, and a broken spil.json recovered from the backup.
//
//   node --test tests/server.test.mjs
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SERVER = fileURLToPath(new URL('../server/server.mjs', import.meta.url))
const PORT = 4750
const sleep = ms => new Promise(done => setTimeout(done, ms))
const homes = []
const running = new Set()

const newHome = () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'kontor-server-'))
  fs.mkdirSync(path.join(home, '.claude', 'agent-kontor', 'sessions'), { recursive: true })
  homes.push(home)
  return home
}
const gameFile = home => path.join(home, '.claude', 'agent-kontor', 'spil.json')
const backupDir = home => path.join(home, '.claude', 'agent-kontor', 'backup')

// A GET with any Host header, which fetch() does not allow.
const get = (pathname, host = `127.0.0.1:${PORT}`) =>
  new Promise((done, fail) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, path: pathname, headers: { host } }, res => {
      let body = ''
      res.on('data', chunk => (body += chunk))
      res.on('end', () => done({ status: res.statusCode, type: res.headers['content-type'] ?? '', body }))
    })
    req.on('error', fail)
    req.end()
  })

const start = async home => {
  const child = spawn(process.execPath, [SERVER], { env: { ...process.env, USERPROFILE: home, HOME: home, AGENT_KONTOR_PORT: String(PORT) }, stdio: 'ignore' })
  running.add(child)
  for (let i = 0; i < 50; i++) {
    try {
      if ((await get('/health')).status === 200) return child
    } catch {}
    await sleep(100)
  }
  throw new Error('The server did not start')
}
const stop = async child => {
  child.kill()
  running.delete(child)
  await new Promise(done => child.once('exit', done))
}

after(() => {
  for (const child of running) child.kill()
})

test('the page, its stylesheet and its modules are served, nothing else', async () => {
  const child = await start(newHome())
  try {
    const page = await get('/')
    assert.equal(page.status, 200)
    assert.match(page.type, /text\/html/)
    assert.match(page.body, /js\/main\.js/)
    assert.match((await get('/style.css')).type, /text\/css/)
    for (const name of fs.readdirSync(new URL('../public/js/', import.meta.url)).filter(f => f.endsWith('.js'))) {
      const res = await get(`/js/${name}`)
      assert.equal(res.status, 200, name)
      assert.match(res.type, /javascript/, name)
    }
    for (const bad of ['/app.js', '/js/../../server/server.mjs', '/js/%2e%2e/server.mjs', '/js/Main.js', '/server/server.mjs', '/js/', '/package.json']) {
      assert.equal((await get(bad)).status, 404, bad)
    }
  } finally {
    await stop(child)
  }
})

test('only this computer may talk to it', async () => {
  const child = await start(newHome())
  try {
    assert.equal((await get('/', 'evil.example:4750')).status, 403)
    assert.equal((await get('/api/state', `localhost:${PORT}`)).status, 200)
    const buy = await fetch(`http://127.0.0.1:${PORT}/api/buy`, { method: 'POST', body: '{"item":"desk"}' })
    assert.equal(buy.status, 403, 'a buy without the page’s token is refused')
  } finally {
    await stop(child)
  }
})

test('spil.json is backed up once a day, and only a week of copies is kept', async () => {
  const home = newHome()
  fs.writeFileSync(gameFile(home), JSON.stringify({ v: 1, kroner: 1234, owned: { desks: 3, rooms: ['claude', 'team'] }, credited: {} }))
  fs.mkdirSync(backupDir(home))
  for (let d = 1; d <= 9; d++) fs.writeFileSync(path.join(backupDir(home), `spil-2020-01-0${d}.json`), '{"kroner":1}')
  const child = await start(home)
  try {
    await sleep(800)
    const names = fs.readdirSync(backupDir(home)).sort()
    assert.equal(names.length, 7)
    const today = names.at(-1)
    assert.match(today, /^spil-\d{4}-\d{2}-\d{2}\.json$/)
    // The server may have paid out achievements first: what is owned is the check.
    assert.equal(JSON.parse(fs.readFileSync(path.join(backupDir(home), today), 'utf8')).owned.desks, 3)
    assert.ok(!names.includes('spil-2020-01-01.json'), 'the oldest copies go')
  } finally {
    await stop(child)
  }
})

test('a broken spil.json is kept aside, and the game goes on from the newest backup', async () => {
  const home = newHome()
  fs.writeFileSync(gameFile(home), '{"kroner": 50, "owned": {"desks"')
  fs.mkdirSync(backupDir(home))
  fs.writeFileSync(path.join(backupDir(home), 'spil-2020-01-01.json'), JSON.stringify({ v: 1, kroner: 100, owned: { desks: 2, rooms: ['claude', 'team'] }, credited: {} }))
  fs.writeFileSync(path.join(backupDir(home), 'spil-2020-01-02.json'), JSON.stringify({ v: 1, kroner: 4321, owned: { desks: 5, rooms: ['claude', 'team', 'kitchen'] }, credited: {} }))
  const child = await start(home)
  try {
    const { game } = JSON.parse((await get('/api/state')).body)
    assert.ok(game.kroner >= 4321, 'the newest backup, plus any achievements it unlocks')
    assert.equal(game.owned.desks, 5)
    assert.ok(fs.existsSync(`${gameFile(home)}.broken`))
    await sleep(800)
    assert.equal(JSON.parse(fs.readFileSync(gameFile(home), 'utf8')).owned.desks, 5, 'written back whole')
  } finally {
    await stop(child)
  }
})

test('with no spil.json at all, a new office starts small', async () => {
  const child = await start(newHome())
  try {
    const { game } = JSON.parse((await get('/api/state')).body)
    assert.equal(game.kroner, 0)
    assert.deepEqual(game.owned.rooms, ['claude', 'team'])
  } finally {
    await stop(child)
  }
})

const dayOf = at => {
  const d = new Date(at)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const work = (home, added) =>
  fs.writeFileSync(
    path.join(home, '.claude', 'agent-kontor', 'sessions', 'sw.json'),
    JSON.stringify({ v: 2, key: 'sw', project: 'p', updatedAt: Date.now(), main: { state: 'idle', detail: 'x' }, subs: [], earned: { added, removed: 0, delivered: 0, tests: 0, commits: 0, prs: 0 } }),
  )

test('the first work of the day pays a bonus, once', async () => {
  const home = newHome()
  const child = await start(home)
  try {
    work(home, 10)
    await sleep(900)
    const { game } = JSON.parse((await get('/api/state')).body)
    assert.equal(game.streak.count, 1)
    assert.equal(game.streak.isToday, true)
    assert.equal(game.streak.bonus, 25)
    assert.equal(game.stats.totals.bonus, 25)
    work(home, 20)
    await sleep(900)
    assert.equal(JSON.parse((await get('/api/state')).body).game.stats.totals.bonus, 25, 'not twice in a day')
  } finally {
    await stop(child)
  }
})

test('a streak from yesterday grows, and pays more', async () => {
  const home = newHome()
  const yesterday = dayOf(Date.now() - 24 * 60 * 60_000)
  fs.writeFileSync(gameFile(home), JSON.stringify({ v: 1, kroner: 0, owned: { desks: 0, rooms: ['claude', 'team'] }, credited: {}, streak: { day: yesterday, count: 3, bonus: 45, at: 1 } }))
  const child = await start(home)
  try {
    assert.equal(JSON.parse((await get('/api/state')).body).game.streak.count, 3, 'still alive before today’s work')
    work(home, 10)
    await sleep(900)
    const { game } = JSON.parse((await get('/api/state')).body)
    assert.equal(game.streak.count, 4)
    assert.equal(game.streak.bonus, 25 + 3 * 10)
  } finally {
    await stop(child)
  }
})

test('a streak with a day missing starts over', async () => {
  const home = newHome()
  fs.writeFileSync(gameFile(home), JSON.stringify({ v: 1, kroner: 0, owned: { desks: 0, rooms: ['claude', 'team'] }, credited: {}, streak: { day: '2020-01-01', count: 6, bonus: 75, at: 1 } }))
  const child = await start(home)
  try {
    assert.equal(JSON.parse((await get('/api/state')).body).game.streak.count, 0)
    work(home, 10)
    await sleep(900)
    assert.equal(JSON.parse((await get('/api/state')).body).game.streak.count, 1)
  } finally {
    await stop(child)
  }
})

test('a room grows one step at a time, and each team room step makes room for three desks', async () => {
  const home = newHome()
  fs.writeFileSync(gameFile(home), JSON.stringify({ v: 1, plan: 2, kroner: 0, owned: { desks: 7, rooms: ['claude', 'team'] }, credited: {} }))
  const first = await start(home)
  try {
    const { game } = JSON.parse((await get('/api/state')).body)
    assert.equal(game.maxDesks, 7, 'three in team room 1, four in the quiet room')
    assert.equal(game.next.desk, null)
    assert.equal(typeof game.next['team1-2'], 'number')
    assert.equal(game.next['team1-3'], null, 'not before step 2')
    assert.equal(game.next.team2, null, 'team room 2 comes once team room 1 is full grown')
    assert.equal(game.next['kitchen-2'], null, 'not before the kitchen')
    assert.equal(game.next['toilet'], 2500)
    assert.equal(game.next.pingpong, null, 'the ping-pong table stands in the lounge')
  } finally {
    await stop(first)
  }
  fs.writeFileSync(gameFile(home), JSON.stringify({ v: 1, plan: 2, kroner: 0, owned: { desks: 13, rooms: ['claude', 'team', 'team1-2', 'team1-3'] }, credited: {} }))
  const second = await start(home)
  try {
    const { game } = JSON.parse((await get('/api/state')).body)
    assert.equal(game.maxDesks, 13)
    assert.equal(game.next.team2, 10_000)
    assert.equal(game.next['team1-2'], null, 'bought already')
  } finally {
    await stop(second)
  }
})

test('a game saved for the old floor plan is moved over, and nobody loses anything', async () => {
  const home = newHome()
  fs.writeFileSync(gameFile(home), JSON.stringify({ v: 1, kroner: 100, owned: { desks: 16, rooms: ['claude', 'team', 'team2', 'hobby', 'lounge', 'kitchen', 'plants'] }, credited: {} }))
  const child = await start(home)
  try {
    const { game } = JSON.parse((await get('/api/state')).body)
    const rooms = game.owned.rooms
    for (const item of ['team1-2', 'team1-3', 'team2', 'team2-2', 'lounge', 'lounge-2', 'kitchen', 'plants']) assert.ok(rooms.includes(item), item)
    assert.ok(!rooms.includes('hobby'))
    assert.equal(game.owned.desks, 16)
    assert.ok(game.maxDesks >= 16, 'room for every desk bought')
    assert.equal(game.kroner, 4100, 'the sofa corner is paid back, as the old lounge became the new one')
  } finally {
    await stop(child)
  }
  const saved = JSON.parse(fs.readFileSync(gameFile(home), 'utf8'))
  assert.equal(saved.plan, 2, 'moved once, and saved')
  const again = await start(home)
  try {
    assert.equal(JSON.parse((await get('/api/state')).body).game.kroner, 4100, 'not paid back twice')
  } finally {
    await stop(again)
  }
  // A small office keeps its six places in team room 1, and its ping-pong
  // table brings the lounge it now stands in
  const small = newHome()
  fs.writeFileSync(gameFile(small), JSON.stringify({ v: 1, kroner: 0, owned: { desks: 10, rooms: ['claude', 'team', 'pingpong'] }, credited: {} }))
  const third = await start(small)
  try {
    const { game } = JSON.parse((await get('/api/state')).body)
    assert.ok(game.owned.rooms.includes('team1-2') && game.owned.rooms.includes('lounge'))
    assert.equal(game.maxDesks, 10)
  } finally {
    await stop(third)
  }
})

test('a count read late, lower than before, is not paid again', async () => {
  const home = newHome()
  const child = await start(home)
  const added = async () => JSON.parse((await get('/api/state')).body).game.stats.totals.added
  try {
    work(home, 100)
    await sleep(900)
    assert.equal(await added(), 100)
    work(home, 90)
    await sleep(900)
    assert.equal(await added(), 100, 'an older status file pays nothing')
    work(home, 120)
    await sleep(900)
    assert.equal(await added(), 120, 'only what lies above the highest count is new')
  } finally {
    await stop(child)
  }
})

test('a session not seen for a week is retired, and not paid again when it comes back', async () => {
  const home = newHome()
  const day = 24 * 60 * 60_000
  const counts = (added, at) => ({ earned: { added, removed: 0, delivered: 0, tests: 0, commits: 0, prs: 0 }, at })
  fs.writeFileSync(
    gameFile(home),
    JSON.stringify({ v: 1, plan: 2, kroner: 0, owned: { desks: 0, rooms: ['claude', 'team'] }, credited: { sw: counts(500, Date.now() - 8 * day), sx: counts(40, Date.now() - day) }, retired: { gone: [1, 0, 0, 0, 0, 0, Date.now() - 500 * day] } }),
  )
  const child = await start(home)
  try {
    await sleep(900)
    const saved = JSON.parse(fs.readFileSync(gameFile(home), 'utf8'))
    assert.equal(saved.credited.sw, undefined)
    assert.deepEqual(saved.retired.sw.slice(0, 6), [500, 0, 0, 0, 0, 0])
    assert.ok(saved.credited.sx, 'a session seen yesterday is kept whole')
    assert.equal(saved.retired.gone, undefined, 'a long retired session is forgotten')
    work(home, 520)
    await sleep(900)
    assert.equal(JSON.parse((await get('/api/state')).body).game.stats.totals.added, 20)
    const back = JSON.parse(fs.readFileSync(gameFile(home), 'utf8'))
    assert.equal(back.credited.sw.earned.added, 520)
    assert.equal(back.retired.sw, undefined)
  } finally {
    await stop(child)
  }
})

test('a spil.json that cannot be read just now is never replaced by a backup', async () => {
  const home = newHome()
  // A folder in its place: read fails, but not because it is broken.
  fs.mkdirSync(gameFile(home))
  fs.mkdirSync(backupDir(home))
  fs.writeFileSync(path.join(backupDir(home), 'spil-2020-01-01.json'), JSON.stringify({ v: 1, kroner: 100, owned: { desks: 2, rooms: ['claude', 'team'] }, credited: {} }))
  const child = spawn(process.execPath, [SERVER], { env: { ...process.env, USERPROFILE: home, HOME: home, AGENT_KONTOR_PORT: String(PORT) }, stdio: 'ignore' })
  const code = await new Promise(done => child.once('exit', done))
  assert.equal(code, 1, 'it stops, to be started again later')
  assert.ok(fs.statSync(gameFile(home)).isDirectory(), 'nothing written over it')
  assert.ok(!fs.existsSync(`${gameFile(home)}.broken`))
})

test('the old lounge id is put right at every start, and only a name can be bought', async () => {
  const home = newHome()
  fs.writeFileSync(gameFile(home), JSON.stringify({ v: 1, plan: 2, kroner: 0, owned: { desks: 0, rooms: ['claude', 'team', 'lounge', 'lounge-2', 'hobby', ['desk']] }, credited: {} }))
  const child = await start(home)
  try {
    const { game, token } = JSON.parse((await get('/api/state')).body)
    assert.deepEqual([...game.owned.rooms].sort(), ['claude', 'lounge', 'lounge-2', 'team'])
    assert.ok(game.kroner >= 9000, 'the old lounge paid back')
    const odd = await fetch(`http://127.0.0.1:${PORT}/api/buy`, { method: 'POST', headers: { origin: `http://127.0.0.1:${PORT}`, 'x-kontor-token': token }, body: '{"item":["plants"]}' })
    assert.equal(odd.status, 400)
  } finally {
    await stop(child)
  }
})

test("today's backup is the game as the day began: a restart keeps it", async () => {
  const home = newHome()
  fs.writeFileSync(gameFile(home), JSON.stringify({ v: 1, plan: 2, kroner: 777, owned: { desks: 4, rooms: ['claude', 'team'] }, credited: {} }))
  const first = await start(home)
  await sleep(800)
  await stop(first)
  const today = fs.readdirSync(backupDir(home)).sort().at(-1)
  fs.writeFileSync(gameFile(home), JSON.stringify({ v: 1, plan: 2, kroner: 1, owned: { desks: 9, rooms: ['claude', 'team'] }, credited: {} }))
  const second = await start(home)
  try {
    await sleep(800)
    assert.equal(JSON.parse(fs.readFileSync(path.join(backupDir(home), today), 'utf8')).owned.desks, 4)
  } finally {
    await stop(second)
  }
})

test("the day's tasks are noted once each, for the summary", async () => {
  const home = newHome()
  const child = await start(home)
  const file = path.join(home, '.claude', 'agent-kontor', 'sessions', 'st.json')
  const status = subs => JSON.stringify({ v: 2, key: 'st', project: 'kontor', updatedAt: Date.now(), main: { state: 'idle', detail: 'x' }, subs, earned: { added: 0, removed: 0, delivered: 0, tests: 0, commits: 0, prs: 0 } })
  const since = Date.now() - 1000
  try {
    fs.writeFileSync(file, status([{ id: 'a1', name: 'Freja', task: 'Kortlæg API’et', phase: 'delivering', since, seat: 0 }, { id: 'demo-1', name: 'Oskar', task: 'Demo', phase: 'delivering', since, seat: 1 }]))
    await sleep(900)
    fs.writeFileSync(file, status([{ id: 'a1', name: 'Freja', task: 'Kortlæg API’et', phase: 'delivering', since, seat: 0 }, { id: 'a2', name: 'Ida', task: 'Find fejlen', phase: 'delivering', since, seat: 2, outcome: 'failed' }]))
    await sleep(900)
    const { tasks } = JSON.parse((await get('/api/state')).body).game.stats.today
    assert.deepEqual(tasks.map(t => [t.name, t.task, t.project, !!t.failed]), [['Freja', 'Kortlæg API’et', 'kontor', false], ['Ida', 'Find fejlen', 'kontor', true]])
  } finally {
    await stop(child)
  }
})

test('each name keeps a tally for the month, and the most tasks lead it', async () => {
  const home = newHome()
  const lastMonth = (() => {
    const d = new Date()
    const m = d.getMonth() === 0 ? `${d.getFullYear() - 1}-12` : `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`
    return m
  })()
  fs.writeFileSync(gameFile(home), JSON.stringify({ v: 1, plan: 2, kroner: 0, owned: { desks: 0, rooms: ['claude', 'team'] }, credited: {}, staff: { [lastMonth]: { Viggo: { tasks: 9, stuck: 0, lines: 400 }, Alma: { tasks: 3, stuck: 1, lines: 50 } } } }))
  const child = await start(home)
  const file = path.join(home, '.claude', 'agent-kontor', 'sessions', 'sm.json')
  const since = Date.now() - 1000
  const sub = (id, name, extra = {}) => ({ id, name, task: 't', phase: 'delivering', since, seat: 0, linesAdded: 10, ...extra })
  try {
    fs.writeFileSync(file, JSON.stringify({ v: 2, key: 'sm', project: 'p', updatedAt: Date.now(), main: { state: 'idle', detail: 'x' }, subs: [sub('a', 'Ida'), sub('b', 'Ida'), sub('c', 'Emil', { outcome: 'failed' }), sub('d', 'Emil')], earned: { added: 0, removed: 0, delivered: 0, tests: 0, commits: 0, prs: 0 } }))
    await sleep(900)
    const { staff } = JSON.parse((await get('/api/state')).body).game.stats
    assert.deepEqual(staff.ranking.map(r => [r.name, r.tasks, r.stuck]), [['Ida', 2, 0], ['Emil', 1, 1]])
    assert.equal(staff.winner.name, 'Viggo')
  } finally {
    await stop(child)
  }
})

test("a helper's answer is kept with its task, also when it comes after the hand-over", async () => {
  const home = newHome()
  const child = await start(home)
  const file = path.join(home, '.claude', 'agent-kontor', 'sessions', 'sa.json')
  const since = Date.now() - 1000
  const write = sub => fs.writeFileSync(file, JSON.stringify({ v: 2, key: 'sa', project: 'p', updatedAt: Date.now(), main: { state: 'idle', detail: 'x' }, subs: [sub], earned: { added: 0, removed: 0, delivered: 0, tests: 0, commits: 0, prs: 0 } }))
  try {
    write({ id: 'a', name: 'Alma', task: 'Find fejlen', phase: 'delivering', since, seat: 0 })
    await sleep(900)
    write({ id: 'a', name: 'Alma', task: 'Find fejlen', phase: 'delivering', since, seat: 0, answer: 'Fejlen sad i parseren.' })
    await sleep(900)
    const { tasks } = JSON.parse((await get('/api/state')).body).game.stats.today
    assert.equal(tasks.length, 1)
    assert.equal(tasks[0].answer, 'Fejlen sad i parseren.')
  } finally {
    await stop(child)
  }
})

test('a regular can be named, taken off the staff and on again, and the change lands in crew.json', async () => {
  const home = newHome()
  const child = await start(home)
  const crewFile = path.join(home, '.claude', 'agent-kontor', 'crew.json')
  try {
    const { token } = JSON.parse((await get('/api/state')).body)
    const post = change => fetch(`http://127.0.0.1:${PORT}/api/crew`, { method: 'POST', headers: { origin: `http://127.0.0.1:${PORT}`, 'x-kontor-token': token }, body: JSON.stringify(change) })
    assert.equal((await post({ agent: 'code-reviewer', name: '  Rikke   Reviewer  ' })).status, 200)
    assert.equal((await post({ agent: 'qa-tester', isRemoved: true })).status, 200)
    assert.equal((await post({ agent: 'wiki-writer', isRemoved: true })).status, 200)
    assert.equal((await post({ agent: 'wiki-writer', isRemoved: false })).status, 200)
    assert.equal((await post({ agent: '../evil', name: 'x' })).status, 400)
    // A plugin's agent, its name with a space, is put on the staff.
    assert.equal((await post({ agent: 'stripe:Company Researcher', isAdded: true })).status, 200)
    // Without the page's token, nothing changes.
    const foreign = await fetch(`http://127.0.0.1:${PORT}/api/crew`, { method: 'POST', body: JSON.stringify({ agent: 'qa-tester', isRemoved: false }) })
    assert.equal(foreign.status, 403)
    const { crew } = JSON.parse((await get('/api/state')).body).game
    assert.deepEqual(crew, { names: { 'code-reviewer': 'Rikke Reviewer' }, removed: ['qa-tester'], added: ['stripe:Company Researcher'] })
    assert.deepEqual(JSON.parse(fs.readFileSync(crewFile, 'utf8')), crew)
    // An empty name gives it its own name back.
    await post({ agent: 'code-reviewer', name: '' })
    assert.deepEqual(JSON.parse((await get('/api/state')).body).game.crew.names, {})
  } finally {
    await stop(child)
  }
  // Read again at the next start.
  const again = await start(home)
  try {
    assert.deepEqual(JSON.parse((await get('/api/state')).body).game.crew.removed, ['qa-tester'])
  } finally {
    await stop(again)
  }
})

test('a regular between jobs on the floor costs no wellbeing; one at work does', async () => {
  const home = newHome()
  const child = await start(home)
  const file = path.join(home, '.claude', 'agent-kontor', 'sessions', 'fl.json')
  const status = subs => JSON.stringify({ v: 2, key: 'fl', project: 'kontor', updatedAt: Date.now(), main: { state: 'idle', detail: 'x' }, subs, earned: { added: 0, removed: 0, delivered: 0, tests: 0, commits: 0, prs: 0 } })
  const regular = (seat, isOnJob) => ({ id: `staff-r${seat}`, name: `r${seat}`, task: '', phase: 'working', since: 0, seat, staff: `r${seat}`, isOnJob, activity: { state: 'idle', detail: 'Klar til en opgave' } })
  const floor = async () => JSON.parse((await get('/api/state')).body).game.wellbeing.parts.find(p => p.what === 'floor')?.count ?? 0
  try {
    // No desks: two regulars ready on the floor, one helper at work.
    fs.writeFileSync(file, status([regular(0, false), regular(1, false), { id: 'h', name: 'Ida', task: 't', phase: 'working', since: 0, seat: 2, activity: { state: 'reading', detail: 'x' } }]))
    await sleep(900)
    assert.equal(await floor(), 1)
    fs.writeFileSync(file, status([regular(0, true), regular(1, false), { id: 'h', name: 'Ida', task: 't', phase: 'working', since: 0, seat: 2, activity: { state: 'reading', detail: 'x' } }]))
    await sleep(900)
    assert.equal(await floor(), 2)
  } finally {
    await stop(child)
  }
})
