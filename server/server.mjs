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

const VERSION = '0.11.0'
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
const RATES = { added: 1, removed: 0.5, delivered: 25, tests: 50, commits: 30, prs: 100 }
// What a new office starts with: Claude's corner and a small team room with
// two desks. The rest is earned (phase 1 and on).
const START = { desks: 2, rooms: ['claude', 'team'] }
// A session's credited counts are kept this long after it was last seen.
const CREDIT_KEEP_MS = 7 * 24 * 60 * 60_000

const newGame = () => ({ v: 1, kroner: 0, owned: { ...START, rooms: [...START.rooms] }, credited: {}, startedAt: Date.now() })

const loadGame = () => {
  try {
    const saved = JSON.parse(fs.readFileSync(GAME, 'utf8'))
    return { ...newGame(), ...saved, owned: { ...START, ...(saved.owned ?? {}) }, credited: saved.credited ?? {} }
  } catch {
    return newGame()
  }
}

let game = loadGame()
let isGameChanged = false

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

// ── Wellbeing ───────────────────────────────────────────────────────────
// How the office feels, 0 to 100: a bare office is so-so, every room and
// piece of furniture makes it better, every helper on the floor worse. It
// multiplies what the work earns by 0.8 to 1.2.
const WELLBEING = { base: 40, kitchen: 15, toilet: 10, lounge: 10, pingpong: 10, meeting: 5, perFloorSitter: -8 }
// Helpers on the floor right now: the most any session has beyond the desks.
let floorNow = 0

const wellbeing = () => {
  const parts = [{ what: 'Grundniveau', points: WELLBEING.base }]
  for (const item of ['kitchen', 'toilet', 'lounge', 'pingpong', 'meeting']) {
    if (game.owned.rooms.includes(item)) parts.push({ what: item, points: WELLBEING[item] })
  }
  if (floorNow > 0) parts.push({ what: 'floor', count: floorNow, points: floorNow * WELLBEING.perFloorSitter })
  const score = Math.max(0, Math.min(100, parts.reduce((sum, p) => sum + p.points, 0)))
  return { score, multiplier: 0.8 + (0.4 * score) / 100, parts }
}

const floorSittersIn = sessions =>
  Math.max(0, ...sessions.map(s => (s.subs ?? []).filter(sub => sub.phase === 'arriving' || sub.phase === 'working').length - game.owned.desks))

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
  game.kroner += kroner * wellbeing().multiplier
  game.credited[status.key] = { earned: { ...earned }, at: now }
  isGameChanged = true
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
// Desks 1-2 come with the office; the team room has room for six, the
// quiet room for four more.
const DESK_PRICES = [0, 0, 500, 750, 1000, 1500, 2000, 2500, 3000, 3500]
const MAX_DESKS = DESK_PRICES.length
// Rooms, and furniture for the team room, bought once each.
const ROOM_PRICES = { kitchen: 2000, toilet: 1500, lounge: 2500, pingpong: 3000, meeting: 5000 }

const priceOf = item => {
  if (item === 'desk') return game.owned.desks < MAX_DESKS ? DESK_PRICES[game.owned.desks] : null
  if (item in ROOM_PRICES) return game.owned.rooms.includes(item) ? null : ROOM_PRICES[item]
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
  saveGame()
  return { status: 200 }
}

// What the page sees of the game: the money, what is owned, what the next
// things cost, and the latest purchases (for a celebration).
const gameView = () => ({
  kroner: Math.floor(game.kroner),
  owned: game.owned,
  next: Object.fromEntries(['desk', ...Object.keys(ROOM_PRICES)].map(item => [item, priceOf(item)])),
  maxDesks: MAX_DESKS,
  rates: RATES,
  wellbeing: (() => {
    const w = wellbeing()
    return { score: w.score, multiplier: Math.round(w.multiplier * 100) / 100, parts: w.parts }
  })(),
  bought: (game.log ?? []).slice(-5),
})

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
  floorNow = floorSittersIn(sessionsNow)
  pruneCredited(Date.now())
  saveGame()
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

const files = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
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

  const file = files[url.pathname]
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
