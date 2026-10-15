#!/usr/bin/env node
// Agent-kontor's office server: a small, dependency-free web server on this
// computer only. It reads the status files the Claude sessions write to
// ~/.claude/agent-kontor/sessions and streams them to the office page, which
// draws and animates everything itself, so nothing ever reloads.
//
//   node server.mjs            run in the foreground
//   node server.mjs --detach   start in the background and return at once

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const VERSION = '0.7.3'
const HOST = '127.0.0.1'
const PORT = Number(process.env.AGENT_KONTOR_PORT || 4747)
const HERE = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC = path.join(HERE, '..', 'public')
const SESSIONS = path.join(os.homedir(), '.claude', 'agent-kontor', 'sessions')
const STALE_MS = 120_000
const IDLE_EXIT_MS = 30 * 60_000
const TICK_MS = 400

if (process.argv.includes('--detach')) {
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url)], { detached: true, stdio: 'ignore', windowsHide: true })
  child.unref()
  process.stdout.write(JSON.stringify({ started: child.pid }) + '\n')
  process.exit(0)
}

// ── The sessions, as their files say ────────────────────────────────────

const previous = new Map()

const readSessions = () => {
  let names = []
  try {
    names = fs.readdirSync(SESSIONS).filter(name => name.endsWith('.json'))
  } catch {
    return []
  }
  const now = Date.now()
  const sessions = []
  for (const name of names) {
    let status = null
    try {
      status = JSON.parse(fs.readFileSync(path.join(SESSIONS, name), 'utf8'))
      previous.set(name, status)
    } catch {
      // Half-written: what the last read said, until the next tick reads it whole.
      status = previous.get(name) ?? null
    }
    if (!status || status.ended || !status.main || now - (status.updatedAt ?? 0) > STALE_MS) continue
    sessions.push(status)
  }
  return sessions.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
}

let current = JSON.stringify({ sessions: readSessions() })
let lastBusyAt = Date.now()
const listeners = new Set()

const publish = () => {
  const sessions = readSessions()
  if (sessions.length > 0 || listeners.size > 0) lastBusyAt = Date.now()
  // updatedAt moves with every heartbeat; only what the page draws counts as news.
  const next = JSON.stringify({ sessions })
  const shape = s => JSON.stringify(JSON.parse(s).sessions.map(({ updatedAt, ...rest }) => rest))
  if (shape(next) === shape(current)) {
    current = next
    return
  }
  current = next
  for (const res of listeners) res.write(`data: ${current}\n\n`)
}

setInterval(publish, TICK_MS)
try {
  fs.mkdirSync(SESSIONS, { recursive: true })
  fs.watch(SESSIONS, () => publish())
} catch {
  // Watching is a nicety; the interval does the work without it.
}

// Off when nobody has used the office for a while.
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

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${HOST}:${PORT}`)
  if (req.method !== 'GET' || !isLocalHost(req.headers.host ?? '')) {
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
    res.write(`data: ${current}\n\n`)
    listeners.add(res)
    const ping = setInterval(() => res.write(': ping\n\n'), 15_000)
    req.on('close', () => {
      clearInterval(ping)
      listeners.delete(res)
    })
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
