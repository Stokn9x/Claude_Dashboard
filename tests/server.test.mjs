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
