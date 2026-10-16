#!/usr/bin/env node
// Agent-kontor's office server: a small, dependency-free web server on this
// computer only. It reads the status files the Claude sessions write to
// ~/.claude/agent-kontor/sessions and streams them to the office page, which
// draws and animates everything itself, so nothing ever reloads.
//
//   node server.mjs            run in the foreground
//   node server.mjs --detach   start in the background and return at once

import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const VERSION = '0.16.0'
const HOST = '127.0.0.1'
const PORT = Number(process.env.AGENT_KONTOR_PORT || 4747)
const HERE = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC = path.join(HERE, '..', 'public')
const SESSIONS = path.join(os.homedir(), '.claude', 'agent-kontor', 'sessions')
const STALE_MS = 120_000
const IDLE_EXIT_MS = 30 * 60_000
const TICK_MS = 400
// Status files of sessions that ended, or went quiet a day ago, are removed.
const FORGET_MS = 24 * 60 * 60_000

if (process.argv.includes('--detach')) {
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url)], { detached: true, stdio: 'ignore', windowsHide: true })
  child.on('error', err => {
    process.stderr.write(`Kunne ikke starte kontoret: ${err.message}\n`)
    process.exit(1)
  })
  child.unref()
  process.stdout.write(JSON.stringify({ started: child.pid }) + '\n')
  process.exit(0)
}

// ── The game: kroner earned by the work, spent on the office ────────────
//
// The server is the one writer of spil.json, so sessions running side by
// side never overwrite each other's money. Each session's status file
// carries running counts of what it has earned (the mod applies the rules:
// a cap per edit, a pause between test runs); the server credits what has
// grown since it last looked, session by session. See SPIL.md.

const GAME = path.join(os.homedir(), '.claude', 'agent-kontor', 'spil.json')
// Slow on purpose: the office is built over weeks of work, not an afternoon.
// A busy hour (some 2000 lines, ten tasks, a few tests and commits) earns
// around 700 kr.
const RATES = { added: 0.25, removed: 0.1, delivered: 10, tests: 20, commits: 15, prs: 50 }
// What a new office starts with: Claude's corner and an empty team room,
// not a single desk. Everything else is earned. An office saved earlier
// keeps the desks it has.
const START = { desks: 0, rooms: ['claude', 'team'] }
// A session's credited counts are kept this long after it was last seen.
const CREDIT_KEEP_MS = 7 * 24 * 60 * 60_000

const newGame = () => ({ v: 1, kroner: 0, owned: { ...START, rooms: [...START.rooms] }, credited: {}, startedAt: Date.now() })

// A copy of spil.json is put aside once a day, and the last week of them
// kept: one bad write must never cost all the kroner.
const BACKUPS = path.join(path.dirname(GAME), 'backup')
const BACKUPS_KEPT = 7
const backupNames = () => {
  try {
    return fs.readdirSync(BACKUPS).filter(name => /^spil-\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort()
  } catch {
    return []
  }
}

const readGame = file => {
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (!saved || typeof saved.kroner !== 'number') throw new Error('Ikke et spil')
  return saved
}

// A spil.json that cannot be read is kept as spil.json.broken, and the game
// goes on from the newest backup that can; with none, from the start.
let isRecovered = false
const loadGame = () => {
  let saved = null
  try {
    saved = readGame(GAME)
  } catch {
    if (fs.existsSync(GAME)) {
      try {
        fs.copyFileSync(GAME, `${GAME}.broken`)
      } catch {}
      for (const name of backupNames().reverse()) {
        try {
          saved = readGame(path.join(BACKUPS, name))
          isRecovered = true
          break
        } catch {}
      }
    }
  }
  if (!saved) return newGame()
  return { ...newGame(), ...saved, owned: { ...START, ...(saved.owned ?? {}) }, credited: saved.credited ?? {} }
}

let game = loadGame()
let isGameChanged = isRecovered

// Written whole to a side file first, then moved into place: a crash
// half-way never leaves a broken spil.json.
const saveGame = () => {
  if (!isGameChanged) return
  try {
    fs.mkdirSync(path.dirname(GAME), { recursive: true })
    fs.writeFileSync(`${GAME}.tmp`, JSON.stringify(game, null, 2))
    fs.renameSync(`${GAME}.tmp`, GAME)
    isGameChanged = false
  } catch {
    // Kept in memory; the next tick tries again.
  }
}

let backedUpDay = ''
const backupGame = now => {
  const day = dayOf(now)
  if (day === backedUpDay || !fs.existsSync(GAME)) return
  try {
    fs.mkdirSync(BACKUPS, { recursive: true })
    fs.copyFileSync(GAME, path.join(BACKUPS, `spil-${day}.json`))
    for (const old of backupNames().slice(0, -BACKUPS_KEPT)) fs.unlinkSync(path.join(BACKUPS, old))
    backedUpDay = day
  } catch {
    // The next tick tries again.
  }
}

// ── Wellbeing ───────────────────────────────────────────────────────────
// How the office feels, 0 to 100: a bare office is so-so, every room and
// piece of furniture makes it better, every helper on the floor worse. It
// multiplies what the work earns by 0.8 to 1.2.
const WELLBEING = {
  base: 40,
  kitchen: 15, toilet: 10, lounge: 10, pingpong: 10, meeting: 5,
  plants: 3, art: 3, neon: 2, espresso: 3, aquarium: 5, chairs: 6, screens: 5,
  perFloorSitter: -8,
}
const LIFTS = ['kitchen', 'toilet', 'lounge', 'pingpong', 'meeting', 'plants', 'art', 'neon', 'espresso', 'aquarium', 'chairs', 'screens']
// Helpers on the floor right now: the most any session has beyond the
// desks, and which session that is (the page names it when it is not the
// one in view).
let floorNow = 0
let floorWhere = ''

const wellbeing = () => {
  const parts = [{ what: 'Grundniveau', points: WELLBEING.base }]
  for (const item of LIFTS) {
    if (game.owned.rooms.includes(item)) parts.push({ what: item, points: WELLBEING[item] })
  }
  if (floorNow > 0) parts.push({ what: 'floor', count: floorNow, project: floorWhere, points: floorNow * WELLBEING.perFloorSitter })
  const score = Math.max(0, Math.min(100, parts.reduce((sum, p) => sum + p.points, 0)))
  return { score, multiplier: 0.8 + (0.4 * score) / 100, parts }
}

const floorSittersIn = sessions => {
  let most = { count: 0, project: '' }
  for (const s of sessions) {
    const count = (s.subs ?? []).filter(sub => sub.phase === 'arriving' || sub.phase === 'working').length - game.owned.desks
    if (count > most.count) most = { count, project: s.project ?? '' }
  }
  return most
}

const credit = (status, now) => {
  const earned = status.earned
  if (!status.key || !earned || typeof earned !== 'object') return
  const before = game.credited[status.key]?.earned ?? {}
  let kroner = 0
  for (const [k, rate] of Object.entries(RATES)) {
    const count = Number(earned[k]) || 0
    const was = Number(before[k]) || 0
    // A count that went down was started over: all of it is new.
    kroner += (count >= was ? count - was : count) * rate
  }
  const isNewCount = Object.keys(RATES).some(k => (Number(earned[k]) || 0) !== (Number(before[k]) || 0))
  if (!isNewCount) {
    // Still around: kept from being pruned, noted once a day.
    const seen = game.credited[status.key]
    if (seen && now - (seen.at ?? 0) > 24 * 60 * 60_000) {
      seen.at = now
      isGameChanged = true
    }
    return
  }
  const gained = kroner * wellbeing().multiplier
  game.kroner += gained
  // The same growth, counted for statistics: in all, and for today.
  const day = dayOf(now)
  game.totals ??= {}
  game.days ??= {}
  game.days[day] ??= {}
  for (const k of Object.keys(RATES)) {
    const count = Number(earned[k]) || 0
    const was = Number(before[k]) || 0
    const grew = count >= was ? count - was : count
    game.totals[k] = (game.totals[k] ?? 0) + grew
    game.days[day][k] = (game.days[day][k] ?? 0) + grew
  }
  game.totals.kroner = (game.totals.kroner ?? 0) + gained
  game.days[day].kroner = (game.days[day].kroner ?? 0) + gained
  game.credited[status.key] = { earned: { ...earned }, at: now }
  if (gained > 0) payDailyBonus(day, now)
  isGameChanged = true
}

// The first work of each day pays a small bonus, a little more for every
// day in a row before it, up to a week. Not multiplied by wellbeing.
const DAILY_BONUS = 25
const STREAK_BONUS = 10
const STREAK_MAX = 7
const payDailyBonus = (day, now) => {
  if (game.streak?.day === day) return
  const count = game.streak?.day === dayOf(now - 24 * 60 * 60_000) ? game.streak.count + 1 : 1
  const bonus = DAILY_BONUS + STREAK_BONUS * (Math.min(count, STREAK_MAX) - 1)
  game.kroner += bonus
  game.streak = { day, count, bonus, at: now }
  game.totals.bonus = (game.totals.bonus ?? 0) + bonus
  game.days[day].bonus = bonus
}
// The streak as it stands: it lives while the last day with work is today
// or yesterday.
const streakView = () => {
  const s = game.streak
  const now = Date.now()
  const isAlive = s && (s.day === dayOf(now) || s.day === dayOf(now - 24 * 60 * 60_000))
  return { count: isAlive ? s.count : 0, isToday: !!s && s.day === dayOf(now), bonus: s?.bonus ?? 0, at: s?.at ?? null, next: DAILY_BONUS + STREAK_BONUS * (Math.min(isAlive ? s.count + 1 : 1, STREAK_MAX) - 1) }
}

// The local date, as YYYY-MM-DD, for the day's statistics.
const dayOf = at => {
  const d = new Date(at)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const DAYS_KEPT = 60
const pruneDays = () => {
  const days = Object.keys(game.days ?? {}).sort()
  for (const day of days.slice(0, Math.max(0, days.length - DAYS_KEPT))) {
    delete game.days[day]
    isGameChanged = true
  }
}

const pruneCredited = now => {
  for (const [key, entry] of Object.entries(game.credited)) {
    if (now - (entry.at ?? 0) > CREDIT_KEEP_MS) {
      delete game.credited[key]
      isGameChanged = true
    }
  }
}

// ── The shop ────────────────────────────────────────────────────────────
// Prices live here and only here: the page asks to buy, the server decides.
// Every desk is bought, the first two cheaply; the team room has room for six, the
// quiet room for four more.
const DESK_PRICES = [300, 500, 800, 1200, 1800, 2500, 3500, 4500, 6000, 8000]
const MAX_DESKS = DESK_PRICES.length
// Rooms, and furniture for the team room, bought once each.
const ROOM_PRICES = { kitchen: 3000, toilet: 2500, lounge: 4000, pingpong: 6000, meeting: 12000 }
// Decor and upgrades: bought once each, for the look and for wellbeing.
const DECOR_PRICES = { plants: 600, art: 900, neon: 1200, espresso: 1500, aquarium: 2500, chairs: 4000, screens: 5000 }
const THING_PRICES = { ...ROOM_PRICES, ...DECOR_PRICES }

const priceOf = item => {
  if (item === 'desk') return game.owned.desks < MAX_DESKS ? DESK_PRICES[game.owned.desks] : null
  if (item in THING_PRICES) return game.owned.rooms.includes(item) ? null : THING_PRICES[item]
  return null
}

const buy = item => {
  const price = priceOf(item)
  if (price === null) return { status: 409, error: 'Det kan ikke købes lige nu' }
  if (game.kroner < price) return { status: 409, error: `Det koster ${price} kr, og du har ${Math.floor(game.kroner)} kr` }
  game.kroner -= price
  if (item === 'desk') game.owned.desks += 1
  else game.owned.rooms = [...game.owned.rooms, item]
  game.log = [...(game.log ?? []), { at: Date.now(), item, price }].slice(-50)
  isGameChanged = true
  checkAchievements(Date.now())
  saveGame()
  return { status: 200 }
}

// ── Achievements ────────────────────────────────────────────────────────
// Milestones over all sessions and days. Each is unlocked once, with a
// small reward in kroner (not multiplied by wellbeing), and the page shows
// a notice when it happens.
const total = k => game.totals?.[k] ?? 0
const daysActive = () => Object.values(game.days ?? {}).filter(d => (d.added ?? 0) + (d.delivered ?? 0) + (d.commits ?? 0) > 0).length
const bestDay = k => Math.max(0, ...Object.values(game.days ?? {}).map(d => d[k] ?? 0))
const ALL_ROOMS = Object.keys(ROOM_PRICES)

const ACHIEVEMENTS = [
  { id: 'lines-1', name: 'Første linje', about: 'Skriv den første linje', reward: 10, value: () => total('added'), target: 1 },
  { id: 'lines-1k', name: '1.000 linjer', about: 'Skriv 1.000 linjer i alt', reward: 100, value: () => total('added'), target: 1000 },
  { id: 'lines-10k', name: '10.000 linjer', about: 'Skriv 10.000 linjer i alt', reward: 500, value: () => total('added'), target: 10_000 },
  { id: 'lines-100k', name: '100.000 linjer', about: 'Skriv 100.000 linjer i alt', reward: 2000, value: () => total('added'), target: 100_000 },
  { id: 'day-1k', name: 'En god dag', about: 'Skriv 1.000 linjer på én dag', reward: 300, value: () => bestDay('added'), target: 1000 },
  { id: 'tasks-10', name: 'Holdspiller', about: 'Få 10 opgaver afleveret af hjælpere', reward: 100, value: () => total('delivered'), target: 10 },
  { id: 'tasks-100', name: 'Teamleder', about: 'Få 100 opgaver afleveret af hjælpere', reward: 500, value: () => total('delivered'), target: 100 },
  { id: 'tests-10', name: 'Grøn bølge', about: 'Kør grønne tests 10 gange', reward: 150, value: () => total('tests'), target: 10 },
  { id: 'commits-10', name: 'Committed', about: 'Lav 10 commits', reward: 150, value: () => total('commits'), target: 10 },
  { id: 'prs-5', name: 'Ship it', about: 'Åbn 5 pull requests', reward: 300, value: () => total('prs'), target: 5 },
  { id: 'desk-3', name: 'Indflytning', about: 'Køb det første skrivebord', reward: 50, value: () => game.owned.desks, target: 1 },
  { id: 'desk-10', name: 'Fuldt hus', about: 'Køb alle ti skriveborde', reward: 1000, value: () => game.owned.desks, target: MAX_DESKS },
  { id: 'kitchen', name: 'Kaffekultur', about: 'Byg køkkenet', reward: 100, value: () => (game.owned.rooms.includes('kitchen') ? 1 : 0), target: 1 },
  { id: 'all-rooms', name: 'Hele kontoret', about: 'Byg alle rum og alt inventar', reward: 2000, value: () => ALL_ROOMS.filter(r => game.owned.rooms.includes(r)).length, target: ALL_ROOMS.length },
  { id: 'wellbeing-90', name: 'Trivselsguru', about: 'Nå en trivsel på 90', reward: 500, value: () => wellbeing().score, target: 90 },
  { id: 'days-5', name: 'Stabil', about: 'Arbejd på 5 forskellige dage', reward: 300, value: daysActive, target: 5 },
  { id: 'days-20', name: 'Stamgæst', about: 'Arbejd på 20 forskellige dage', reward: 1000, value: daysActive, target: 20 },
  { id: 'streak-5', name: 'I stødet', about: 'Arbejd 5 dage i træk', reward: 300, value: () => game.streak?.count ?? 0, target: 5 },
]

const checkAchievements = now => {
  game.achieved ??= {}
  for (const a of ACHIEVEMENTS) {
    if (game.achieved[a.id] || a.value() < a.target) continue
    game.achieved[a.id] = now
    game.kroner += a.reward
    isGameChanged = true
  }
}

// What the page sees of the game: the money, what is owned, what the next
// things cost, and the latest purchases (for a celebration).
const gameView = () => ({
  kroner: Math.floor(game.kroner),
  owned: game.owned,
  next: Object.fromEntries(['desk', ...Object.keys(THING_PRICES)].map(item => [item, priceOf(item)])),
  maxDesks: MAX_DESKS,
  rates: RATES,
  wellbeing: (() => {
    const w = wellbeing()
    return { score: w.score, multiplier: Math.round(w.multiplier * 100) / 100, parts: w.parts }
  })(),
  bought: (game.log ?? []).slice(-5),
  streak: streakView(),
  stats: statsView(),
  achievements: ACHIEVEMENTS.map(a => ({ id: a.id, name: a.name, about: a.about, reward: a.reward, value: Math.min(a.value(), a.target), target: a.target, at: game.achieved?.[a.id] ?? null })),
})

// The last two weeks day by day, today, the best day and the totals.
const statsView = () => {
  const now = Date.now()
  const days = []
  for (let i = 13; i >= 0; i--) {
    const day = dayOf(now - i * 24 * 60 * 60_000)
    const d = game.days?.[day] ?? {}
    days.push({ day, added: d.added ?? 0, delivered: d.delivered ?? 0, kroner: Math.floor(d.kroner ?? 0) })
  }
  return {
    days,
    today: days[days.length - 1],
    best: { added: bestDay('added') },
    totals: { added: total('added'), removed: total('removed'), delivered: total('delivered'), tests: total('tests'), commits: total('commits'), prs: total('prs'), kroner: Math.floor(total('kroner')), bonus: total('bonus') },
    daysActive: daysActive(),
  }
}

// ── The sessions, as their files say ────────────────────────────────────

const previous = new Map()

const forget = name => {
  try {
    fs.unlinkSync(path.join(SESSIONS, name))
  } catch {
    // Gone already, or held by its session for a moment: the next tick tries again.
  }
  previous.delete(name)
}

const readSessions = () => {
  let names = []
  try {
    names = fs.readdirSync(SESSIONS).filter(name => name.endsWith('.json'))
  } catch {
    return []
  }
  const now = Date.now()
  const sessions = []
  for (const name of previous.keys()) if (!names.includes(name)) previous.delete(name)
  for (const name of names) {
    let status = null
    try {
      status = JSON.parse(fs.readFileSync(path.join(SESSIONS, name), 'utf8'))
      previous.set(name, status)
    } catch {
      // Half-written: what the last read said, until the next tick reads it whole.
      status = previous.get(name) ?? null
    }
    if (status) credit(status, now)
    if (status && (status.ended || now - (status.updatedAt ?? 0) > FORGET_MS)) forget(name)
    if (!status || status.ended || !status.main || now - (status.updatedAt ?? 0) > STALE_MS) continue
    sessions.push(status)
  }
  return sessions.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
}

// updatedAt moves with every heartbeat; only what the page draws counts as news.
const shapeOf = sessions => JSON.stringify([sessions.map(({ updatedAt, ...rest }) => rest), gameView()])
// A buy must carry this token, which only the office's own page can read:
// another site in the browser can neither read the state nor send the header.
const TOKEN = randomBytes(16).toString('hex')
const stateOf = sessions => JSON.stringify({ sessions, game: gameView(), token: TOKEN })

let sessionsNow = readSessions()
saveGame()
let current = stateOf(sessionsNow)
let currentShape = shapeOf(sessionsNow)
let lastBusyAt = Date.now()
const listeners = new Set()

const send = (res, text) => {
  // A stream that cannot keep up (a sleeping laptop, a half-open connection)
  // is closed; its page reconnects and starts from the whole state.
  if (res.writableLength > 1_000_000) {
    listeners.delete(res)
    res.destroy()
    return
  }
  res.write(text)
}

const publish = (isForced = false) => {
  sessionsNow = readSessions()
  ;({ count: floorNow, project: floorWhere } = floorSittersIn(sessionsNow))
  checkAchievements(Date.now())
  pruneCredited(Date.now())
  pruneDays()
  saveGame()
  backupGame(Date.now())
  if (sessionsNow.length > 0) lastBusyAt = Date.now()
  current = stateOf(sessionsNow)
  const shape = shapeOf(sessionsNow)
  if (shape === currentShape && !isForced) return
  currentShape = shape
  for (const res of listeners) send(res, `data: ${current}\n\n`)
}

setInterval(publish, TICK_MS)

// The folder is watched for quick news; a burst of events from one write is
// one read. The interval does the work alone while watching fails.
let soon = null
const watchSessions = () => {
  try {
    fs.mkdirSync(SESSIONS, { recursive: true })
    const watcher = fs.watch(SESSIONS, () => {
      soon ??= setTimeout(() => {
        soon = null
        publish()
      }, 50)
    })
    watcher.on('error', () => {
      watcher.close()
      setTimeout(watchSessions, 5000)
    })
  } catch {
    setTimeout(watchSessions, 5000)
  }
}
watchSessions()

// Off when no Claude session has run for a while. An open page does not keep
// it on: a session that wants the office starts it again.
setInterval(() => {
  if (Date.now() - lastBusyAt > IDLE_EXIT_MS) process.exit(0)
}, 60_000)

// ── HTTP ─────────────────────────────────────────────────────────────────

// The page, its stylesheet and its modules: only these names, so no path
// from the address ever reaches outside the public folder.
const MODULE = /^\/js\/[a-z]+\.js$/
const fileFor = pathname => {
  if (pathname === '/' || pathname === '/index.html') return ['index.html', 'text/html; charset=utf-8']
  if (pathname === '/style.css') return ['style.css', 'text/css; charset=utf-8']
  if (MODULE.test(pathname)) return [pathname.slice(1), 'text/javascript; charset=utf-8']
  return null
}

// Only this computer's own page may talk to it: a page elsewhere that points
// a hostname at 127.0.0.1 carries a foreign Host header.
const isLocalHost = host => host === `${HOST}:${PORT}` || host === `localhost:${PORT}`
const isLocalOrigin = origin => origin === `http://${HOST}:${PORT}` || origin === `http://localhost:${PORT}`

// POST /api/buy {"item":"desk"}: from the office page only (its Host, its
// Origin and its token), a small body, and the server checks price and saldo.
const handleBuy = (req, res) => {
  const json = (status, body) => res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(body))
  if (!isLocalOrigin(req.headers.origin ?? '') || req.headers['x-kontor-token'] !== TOKEN) return json(403, { error: 'Ikke tilladt' })
  let body = ''
  req.setEncoding('utf8')
  req.on('data', chunk => {
    body += chunk
    if (body.length > 1024) req.destroy()
  })
  req.on('end', () => {
    let item = null
    try {
      item = JSON.parse(body).item
    } catch {
      return json(400, { error: 'Forkert forespørgsel' })
    }
    const result = buy(item)
    if (result.status === 200) {
      publish(true)
      return json(200, { ok: true, game: gameView() })
    }
    return json(result.status, { error: result.error, game: gameView() })
  })
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${HOST}:${PORT}`)
  if (!isLocalHost(req.headers.host ?? '')) {
    res.writeHead(403).end()
    return
  }
  if (req.method === 'POST' && url.pathname === '/api/buy') return handleBuy(req, res)
  // A newer mod asks an older server to step down: it saves and stops, and
  // the mod starts the new one.
  if (req.method === 'POST' && url.pathname === '/api/quit') {
    if (req.headers['x-kontor-token'] !== TOKEN) return res.writeHead(403).end()
    res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}')
    saveGame()
    for (const listener of listeners) listener.end()
    setTimeout(() => process.exit(0), 100)
    return
  }
  if (req.method !== 'GET') {
    res.writeHead(403).end()
    return
  }

  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, app: 'agent-kontor', version: VERSION }))
    return
  }
  if (url.pathname === '/api/state') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(current)
    return
  }
  if (url.pathname === '/api/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' })
    // retry: how soon the page tries again after losing the stream.
    res.write(`retry: 2000\ndata: ${current}\n\n`)
    listeners.add(res)
    const ping = setInterval(() => send(res, ': ping\n\n'), 15_000)
    const done = () => {
      clearInterval(ping)
      listeners.delete(res)
    }
    res.on('close', done)
    res.on('error', done)
    return
  }

  const file = fileFor(url.pathname)
  if (!file) {
    res.writeHead(404).end('Ikke fundet')
    return
  }
  fs.readFile(path.join(PUBLIC, file[0]), (err, body) => {
    if (err) {
      res.writeHead(500).end('Kunne ikke læse siden')
      return
    }
    res.writeHead(200, { 'content-type': file[1], 'cache-control': 'no-store' }).end(body)
  })
})

server.on('error', err => {
  // Another copy already serves the office: nothing to do.
  if (err.code === 'EADDRINUSE') process.exit(0)
  throw err
})

server.listen(PORT, HOST, () => {
  process.stdout.write(`Agent-kontor kører på http://${HOST}:${PORT}\n`)
})
