// Agent-kontor: the office, drawn and animated on a canvas. The server sends
// what each session's status file says; this page works out every step of
// every walk from those timestamps, so nothing reloads and nothing stutters.
'use strict'

// ── Geometry: must match hooks/register.tsx, which times the same walks ──
const W = 480
const H = 508
// Canvas pixels per scene unit: set by fit() from the window and the screen's
// pixel density, so the office fills the space and stays sharp at any size.
let S = 3
const SPEED = 90
const HANDOVER = 2.6
const SEATS = 6
const seatAt = seat => ({ cx: 92 + (seat % 3) * 148, dy: 202 + Math.floor(seat / 3) * 102 })
const DOOR = { x: 478, y: 256 }
const MAIN = { cx: 128, dy: 78 }
const handoffFor = seat => ({ x: 206 + (seat % 3) * 13, y: 96 + Math.floor(seat / 3) * 16 })
const KITCHEN_SEAT = { x: 318, y: 112 }

const arrivePath = seat => {
  const { cx, dy } = seatAt(seat)
  const lane = dy - 52
  return [DOOR, { x: DOOR.x, y: 256 }, { x: cx + 74, y: 256 }, { x: cx + 74, y: lane }, { x: cx, y: lane }, { x: cx, y: dy - 6 }]
}
const deliverPath = seat => {
  const { cx, dy } = seatAt(seat)
  const lane = dy - 52
  const spot = handoffFor(seat)
  return [{ x: cx, y: dy - 6 }, { x: cx, y: lane }, { x: cx + 74, y: lane }, { x: cx + 74, y: 148 }, { x: 214, y: 148 }, { x: 214, y: spot.y }, spot]
}
const leavePath = seat => {
  const spot = handoffFor(seat)
  return [spot, { x: 214, y: spot.y }, { x: 214, y: 148 }, { x: 446, y: 148 }, { x: 446, y: 256 }, DOOR]
}

const legSeconds = (a, b) => Math.hypot(b.x - a.x, b.y - a.y) / SPEED
const pathSeconds = points => points.slice(1).reduce((t, p, i) => t + legSeconds(points[i], p), 0)
const facingOf = (a, b) => (Math.abs(b.x - a.x) > Math.abs(b.y - a.y) ? (b.x > a.x ? 'right' : 'left') : b.y > a.y ? 'front' : 'back')

// Where a walk has got to after e seconds.
const walkAt = (points, e) => {
  let t = 0
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]
    const b = points[i + 1]
    const d = legSeconds(a, b)
    if (d <= 0) continue
    if (e < t + d) {
      const k = (e - t) / d
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, facing: facingOf(a, b), isWalking: true }
    }
    t += d
  }
  const last = points[points.length - 1]
  return { x: last.x, y: last.y, facing: 'front', isWalking: false }
}

// What a helper is doing in the office at this moment.
const poseOf = (sub, now) => {
  if (sub.seat < 0) return null
  const e = (now - sub.since) / 1000
  if (sub.phase === 'working') return { seated: true }
  if (sub.phase === 'arriving') {
    const p = arrivePath(sub.seat)
    return e < pathSeconds(p) ? walkAt(p, e) : { seated: true }
  }
  if (sub.phase === 'delivering') {
    const p = deliverPath(sub.seat)
    const d = pathSeconds(p)
    if (e < d) return walkAt(p, e)
    if (e < d + HANDOVER) return { ...p[p.length - 1], facing: 'left', isWalking: false, handover: true }
    const l = leavePath(sub.seat)
    const e2 = e - d - HANDOVER
    return e2 < pathSeconds(l) ? walkAt(l, e2) : null
  }
  const l = leavePath(sub.seat)
  return e < pathSeconds(l) ? walkAt(l, e) : null
}

// ── Look ─────────────────────────────────────────────────────────────────
const OUTLINE = '#2B2230'
const P = 3
const FONT = "'Segoe UI', system-ui, -apple-system, sans-serif"
const stateColor = { working: '#8A94A0', reading: '#2BA39A', editing: '#3B8FE0', running: '#D9932B', browsing: '#7B6BDE', waiting: '#E5484D', idle: '#8A94A0' }
const screens = { working: '#5E6B7A', reading: '#E9EEF2', editing: '#1F2A44', running: '#0F1418', browsing: '#D7E9FA', waiting: '#E5484D', idle: '#1B2433' }

const skins = ['#F6D5B8', '#EFC39C', '#D9A06B', '#B9784A', '#8A5634']
const hairs = [['#3A2A22', '#5C4436'], ['#7A4B2A', '#9C6A43'], ['#D9B25C', '#F0D48A'], ['#2B2B33', '#4A4A57'], ['#B5523B', '#D27358'], ['#9AA0A8', '#C3C8CE']]
const shirts = [['#3E7CC9', '#2F5F9C'], ['#2E9E8F', '#21776B'], ['#E07A4F', '#B85E38'], ['#8A6FD6', '#6A52AE'], ['#D6A23C', '#AD7F26'], ['#D45D7A', '#AC4560'], ['#4F9A5B', '#3A7644']]
const hashOf = id => {
  let h = 0
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h
}
const lookFor = id => {
  const h = hashOf(id)
  const [hair, hairLight] = hairs[h % hairs.length]
  const [shirt, shirtShade] = shirts[(h >>> 3) % shirts.length]
  return { hair, hairLight, skin: skins[(h >>> 6) % skins.length], shirt, shirtShade }
}
const claudeLook = { hair: '#C8643B', hairLight: '#E3875E', skin: '#F6D5B8', shirt: '#2F3A4A', shirtShade: '#222B37' }

const BODY = ['..oooooo..', '.ohhhhhho.', 'ohhHhhhhho', 'ohssssssho', 'ohsessesho', '.osssssso.', '.otttttTo.', 'otttttttTo', 'otttttttTo', 'osttttttso']
const BACK = ['..oooooo..', '.ohhhhhho.', 'ohhHhhhhho', 'ohhhhhhhho', 'ohhhhhhhho', '.ohhhhhho.', '.otttttTo.', 'otttttttTo', 'otttttttTo', 'osttttttso']
const SIDE = ['..ooooo...', '.ohhhhhoo.', 'ohHhhhhhho', 'ohhhsssso.', 'ohhsseso..', '.ohsssso..', '..otttTo..', '.ottttTo..', '.ottttTo..', '..osttso..']
const LEGS = ['.oppppppo.', '.opo..opo.', '.obo..obo.', '.oo....oo.']
const FRONT_WALK = [['.oppppppo.', '.opo..opo.', '.obo..oo..', '.oo.......'], LEGS, ['.oppppppo.', '.opo..opo.', '..oo..obo.', '.......oo.'], LEGS]
const SIDE_STAND = ['..opppo...', '..oppo....', '..obbo....', '..oooo....']
const SIDE_STEP = ['..opppo...', '.op..po...', 'ob....bo..', 'oo....oo..']
const SIDE_WALK = [SIDE_STEP, SIDE_STAND, SIDE_STEP, SIDE_STAND]

// ── Canvas ───────────────────────────────────────────────────────────────
const canvas = document.getElementById('office')
const stage = document.getElementById('stage')
const ctx = canvas.getContext('2d')

// The office as large as its space allows, whole and in proportion. The scene
// keeps its own units (W × H), so a bigger office later only changes those.
const fit = () => {
  const room = stage.getBoundingClientRect()
  const scale = Math.max(0.5, Math.min(room.width / W, room.height / H))
  const dpr = window.devicePixelRatio || 1
  const next = scale * dpr
  canvas.style.width = `${Math.floor(W * scale)}px`
  canvas.style.height = `${Math.floor(H * scale)}px`
  if (Math.abs(next - S) < 0.01 && canvas.width === Math.round(W * S)) return
  S = next
  canvas.width = Math.round(W * S)
  canvas.height = Math.round(H * S)
  background.width = canvas.width
  background.height = canvas.height
  backgroundKey = ''
}

const rect = (x, y, w, h, fill) => {
  ctx.fillStyle = fill
  ctx.fillRect(x, y, w, h)
}
const circle = (x, y, r, fill, stroke) => {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = fill
  ctx.fill()
  if (stroke) {
    ctx.lineWidth = 1
    ctx.strokeStyle = stroke
    ctx.stroke()
  }
}
const rounded = (x, y, w, h, r, fill, stroke, lineWidth = 1.5) => {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.fillStyle = fill
  ctx.fill()
  if (stroke) {
    ctx.lineWidth = lineWidth
    ctx.strokeStyle = stroke
    ctx.stroke()
  }
}
const label = (text, x, y, size, color, weight = 700, align = 'center') => {
  ctx.font = `${weight} ${size}px ${FONT}`
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(text, x, y)
}
const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

const paintRows = (rows, look, x, y) => {
  const colour = { o: OUTLINE, h: look.hair, H: look.hairLight, s: look.skin, e: OUTLINE, t: look.shirt, T: look.shirtShade, p: '#3B4A6B', b: OUTLINE }
  rows.forEach((row, r) => {
    let c = 0
    while (c < row.length) {
      const ch = row[c]
      let end = c
      while (end < row.length && row[end] === ch) end++
      if (colour[ch]) rect(x + c * P, y + r * P, (end - c) * P, P, colour[ch])
      c = end
    }
  })
}

// A person on their feet at (x, y).
const standing = (x, y, look, facing, isWalking, t) => {
  const body = facing === 'back' ? BACK : facing === 'front' ? BODY : SIDE
  const isSide = facing === 'left' || facing === 'right'
  const frames = isWalking ? (isSide ? SIDE_WALK : FRONT_WALK) : [isSide ? SIDE_STAND : LEGS]
  const i = isWalking ? Math.floor(t / 130) % 4 : 0
  // Down a pixel as a foot lands: the bob of a step, body over the waist.
  const sink = isWalking && i % 2 === 0 ? P : 0
  const top = y - (body.length + 4) * P
  shadow(x, y + 1, 8, 2.6)
  ctx.save()
  if (facing === 'left') {
    ctx.translate(x * 2, 0)
    ctx.scale(-1, 1)
  }
  paintRows(body, look, x - 5 * P, top + sink)
  paintRows(frames[i], look, x - 5 * P, top + body.length * P)
  ctx.restore()
}

// A person sitting at a desk, feet hidden: the body from (x, y) up.
const sitting = (x, y, look, handUp, t) => {
  const top = y - BODY.length * P
  paintRows(BODY, look, x - 5 * P, top)
  if (handUp) {
    const wave = Math.floor(t / 350) % 2
    const left = x + 5 * P + wave
    rect(left, top - wave, 2 * P, 8 * P, OUTLINE)
    rect(left, top + P - wave, P, 2 * P, look.skin)
    rect(left, top + 3 * P - wave, P, 4 * P, look.shirt)
  }
}

// A soft shadow on the floor, under whoever or whatever stands there.
const shadow = (x, y, rx, ry, alpha = 0.2) => {
  ctx.globalAlpha = alpha
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
  ctx.fillStyle = '#000000'
  ctx.fill()
  ctx.globalAlpha = 1
}

const chair = (cx, dy) => {
  shadow(cx + 2, dy + 4, 22, 5, 0.14)
  rounded(cx - 21, dy - 18, 42, 22, 5, OUTLINE)
  rounded(cx - 19, dy - 16, 38, 18, 4, '#465566')
  rounded(cx - 17, dy - 14, 34, 3, 1.5, '#5A6B7E')
}

const screenArt = (x, y, state, t) => {
  if (state === 'editing') {
    const shift = Math.floor(t / 500) % 2
    ;['#7FB4F0', '#E8A33D', '#9BD58B'].forEach((c, i) => rect(x + 2 + (i % 2) * 2, y + 2 + i * 3 - shift, 8 - i * 2, 1.5, c))
  } else if (state === 'running') {
    rect(x + 2, y + 2, 7, 1.5, '#3DDC84')
    if (Math.floor(t / 400) % 2 === 0) rect(x + 2, y + 6, 2, 2, '#3DDC84')
  } else if (state === 'reading') {
    ;[0, 1, 2].forEach(i => rect(x + 2, y + 2 + i * 3, 10 - (i % 2) * 3, 1.5, '#AEB8C2'))
  } else if (state === 'browsing') {
    rect(x, y, 14, 2.5, '#3E7CC9')
    rect(x + 2, y + 4, 6, 4, '#9CC4EC')
  } else if (state === 'waiting' && Math.floor(t / 450) % 2 === 0) {
    rect(x + 6, y + 2, 2, 5, '#FFFFFF')
    rect(x + 6, y + 8, 2, 2, '#FFFFFF')
  }
}

const monitor = (x, dy, state, t) => {
  rect(x - 1, dy + 1, 22, 16, OUTLINE)
  rect(x, dy + 2, 20, 13, state ? screens[state] : '#141A22')
  if (state) screenArt(x + 2, dy + 4, state, t)
  rect(x + 8, dy + 17, 4, 3, OUTLINE)
}

const desk = (cx, dy, w, state, t, monitors = 1) => {
  const left = cx - w / 2
  ctx.globalAlpha = 0.13
  rounded(left + 3, dy + 4, w, 28, 2, '#000000')
  ctx.globalAlpha = 1
  rounded(left - 1, dy - 1, w + 2, 30, 2, OUTLINE)
  rect(left, dy, w, 22, '#E4C79C')
  rect(left, dy, w, 2, '#F1DBB8')
  rect(left, dy + 22, w, 6, '#B98F5E')
  monitor(cx + w / 2 - 28, dy, state, t)
  if (monitors > 1) monitor(cx - w / 2 + 8, dy, state, t)
  rounded(cx - 12, dy + 12, 24, 7, 1, '#D3D8DD', OUTLINE, 1)
  rect(cx - 9, dy + 14, 18, 1, '#AEB6BF')
  rect(cx - 9, dy + 16, 18, 1, '#AEB6BF')
}

// Little things on a helper's desk, left of the keyboard: two of these,
// chosen by its id, so the same helper always has the same desk.
const deskThings = [
  // a mug
  (x, y) => {
    rect(x, y, 6, 6, OUTLINE)
    rect(x + 1, y + 1, 4, 4, '#FFFFFF')
    rect(x + 1, y + 1, 4, 1.5, '#7A4B2A')
    rect(x + 6, y + 2, 1.5, 2.5, OUTLINE)
  },
  // a little plant
  (x, y) => {
    rect(x + 1, y + 4, 5, 4, '#B5683E')
    circle(x + 3.5, y + 3, 3.4, '#3E8A55', OUTLINE)
    circle(x + 2.5, y + 2, 1.4, '#6CC082')
  },
  // a stack of papers
  (x, y) => {
    rect(x + 1, y + 1, 9, 7, '#C9CED3')
    rect(x, y, 9, 7, '#FFFFFF')
    rect(x + 1.5, y + 2, 6, 0.8, '#AEB6BF')
    rect(x + 1.5, y + 4, 4, 0.8, '#AEB6BF')
  },
  // a rubber duck
  (x, y) => {
    circle(x + 3, y + 4.5, 3, '#F2C94C', OUTLINE)
    circle(x + 5, y + 2, 1.8, '#F2C94C', OUTLINE)
    rect(x + 6.3, y + 1.8, 1.6, 1, '#E07A4F')
  },
  // headphones
  (x, y) => {
    ctx.beginPath()
    ctx.arc(x + 4, y + 4, 3.4, Math.PI, 0)
    ctx.lineWidth = 1.2
    ctx.strokeStyle = OUTLINE
    ctx.stroke()
    rect(x - 0.5, y + 3.5, 2.5, 3.5, OUTLINE)
    rect(x + 6, y + 3.5, 2.5, 3.5, OUTLINE)
  },
  // a framed photo
  (x, y) => {
    rect(x, y, 7, 6, OUTLINE)
    rect(x + 1, y + 1, 5, 4, '#9CC4EC')
    rect(x + 1, y + 3.5, 5, 1.5, '#56A86B')
  },
  // a snack
  (x, y) => {
    rect(x, y + 1, 8, 5, OUTLINE)
    rect(x + 1, y + 2, 6, 3, '#E5484D')
    rect(x + 2.5, y + 2.5, 3, 1, '#FFFFFF')
  },
]
const deskThingsFor = (id, cx, dy) => {
  const h = hashOf(id)
  const first = h % deskThings.length
  const second = (first + 1 + ((h >>> 5) % (deskThings.length - 1))) % deskThings.length
  deskThings[first](cx - 38, dy + 3)
  deskThings[second](cx - 27, dy + 12)
}

const hands = (cx, dy, look, isTyping, t) => {
  const lift = isTyping ? [0, -1.5, 0, -0.5][Math.floor(t / 75) % 4] : 0
  rect(cx - 11, dy + 9 + lift, 7, 5, OUTLINE)
  rect(cx - 10, dy + 10 + lift, 5, 3, look.skin)
  rect(cx + 4, dy + 9 - lift, 7, 5, OUTLINE)
  rect(cx + 5, dy + 10 - lift, 5, 3, look.skin)
}

const bubble = (cx, bottom, text, isAlert, t) => {
  const words = clip(text, 30)
  ctx.font = `600 8.5px ${FONT}`
  const w = Math.round(ctx.measureText(words).width + 14)
  const x = Math.round(cx - w / 2)
  const y = bottom - 16
  ctx.globalAlpha = isAlert ? 0.75 + 0.25 * Math.sin(t / 140) : 1
  const fill = isAlert ? '#E5484D' : '#FFFFFF'
  rounded(x, y, w, 14, 3, fill, OUTLINE)
  ctx.beginPath()
  ctx.moveTo(cx - 3, y + 13.5)
  ctx.lineTo(cx, y + 18)
  ctx.lineTo(cx + 3, y + 13.5)
  ctx.fillStyle = fill
  ctx.fill()
  ctx.lineWidth = 1.5
  ctx.strokeStyle = OUTLINE
  ctx.stroke()
  rect(cx - 2.5, y + 12, 5, 2, fill)
  label(words, cx, y + 10, 8.5, isAlert ? '#FFFFFF' : OUTLINE, 600)
  ctx.globalAlpha = 1
}

const tag = (cx, y, text, colour) => {
  ctx.font = `700 7.5px ${FONT}`
  const w = Math.round(ctx.measureText(text).width + 10)
  ctx.globalAlpha = 0.9
  rounded(cx - w / 2, y, w, 11, 5.5, colour)
  ctx.globalAlpha = 1
  label(text, cx, y + 8, 7.5, '#FFFFFF')
}

const plant = (x, y, big = false) => {
  const r = big ? 9 : 7
  rect(x - 5, y, 10, 8, '#B5683E')
  circle(x, y - 2, r, '#3E8A55', OUTLINE)
  circle(x - r / 2, y - 4, r / 2, '#56A86B')
  circle(x + r / 3, y - r, r / 3, '#6CC082')
}

// ── Things on the walls that change ──────────────────────────────────────
const BOARD = { x: 196, y: 46, w: 44, h: 30 }
const CLOCK = { x: 461, y: 8, r: 6 }

// The day's numbers on Claude's whiteboard, in marker.
const board = stats => {
  const left = BOARD.x + 4
  label('I dag', left, BOARD.y + 7, 5.5, '#5B6672', 700, 'left')
  if (!stats || (!stats.linesAdded && !stats.linesRemoved && typeof stats.costUsd !== 'number')) {
    rect(left, BOARD.y + 12, 26, 1.5, '#3E7CC9')
    rect(left, BOARD.y + 17, 18, 1.5, '#E07A4F')
    return
  }
  label(`+${stats.linesAdded ?? 0}`, left, BOARD.y + 15, 7, '#2E9E8F', 700, 'left')
  ctx.font = `700 7px ${FONT}`
  const shift = ctx.measureText(`+${stats.linesAdded ?? 0} `).width
  label(`−${stats.linesRemoved ?? 0}`, left + shift, BOARD.y + 15, 7, '#E5484D', 700, 'left')
  if (typeof stats.costUsd === 'number') label(`$${stats.costUsd.toFixed(2)}`, left, BOARD.y + 24, 7, '#3E7CC9', 700, 'left')
}

// A wall clock showing the time it is.
const clock = date => {
  const { x, y, r } = CLOCK
  circle(x, y, r + 1, OUTLINE)
  circle(x, y, r, '#FFFFFF')
  for (let i = 0; i < 12; i += 3) {
    const a = (i / 12) * Math.PI * 2
    rect(x + Math.sin(a) * (r - 1.5) - 0.5, y - Math.cos(a) * (r - 1.5) - 0.5, 1, 1, '#8A94A0')
  }
  const hand = (turn, length, width, colour) => {
    const a = turn * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + Math.sin(a) * length, y - Math.cos(a) * length)
    ctx.lineWidth = width
    ctx.lineCap = 'round'
    ctx.strokeStyle = colour
    ctx.stroke()
  }
  const minutes = date.getMinutes() + date.getSeconds() / 60
  hand(((date.getHours() % 12) + minutes / 60) / 12, r * 0.5, 1.2, OUTLINE)
  hand(minutes / 60, r * 0.8, 0.8, OUTLINE)
  hand(date.getSeconds() / 60, r * 0.85, 0.4, '#E5484D')
}

// ── Light ────────────────────────────────────────────────────────────────
// The time of day, in hours (14.5 is half past two). ?tid=21:30 in the
// address shows the office at that time instead, to see the evening by day.
const timeOfDay = () => {
  const asked = new URLSearchParams(location.search).get('tid')
  if (asked) {
    const [h, m = '0'] = asked.split(':')
    if (!Number.isNaN(Number(h))) return Number(h) + Number(m) / 60
  }
  const d = new Date()
  return d.getHours() + d.getMinutes() / 60
}

// How dark it is: none in the working day, deepening through the evening.
const NIGHT = 0.55
const darknessAt = h => {
  if (h >= 8 && h <= 17) return 0
  if (h > 17 && h < 20) return ((h - 17) / 3) * NIGHT
  if (h >= 6 && h < 8) return ((8 - h) / 2) * NIGHT
  return NIGHT
}

const TOP_WINDOWS = [30, 120, 290, 390]
// The team room's windows in the side walls: x, y, height.
const SIDE_WINDOWS = [[0, 284, 40], [W - 6, 300, 40]]

// Sunlight through the windows, falling at an angle that follows the sun:
// from the east in the morning, from the west in the afternoon.
const daylight = h => {
  const strength = 1 - darknessAt(h) / NIGHT
  if (strength <= 0) return
  const warm = h < 10 || h > 15
  const colour = warm ? '255, 196, 110' : '255, 232, 160'
  const slant = (12 - h) * 5
  const beam = (points, x0, y0, x1, y1) => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1)
    g.addColorStop(0, `rgba(${colour}, ${0.6 * strength})`)
    g.addColorStop(1, `rgba(${colour}, 0)`)
    ctx.fillStyle = g
    ctx.beginPath()
    points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
    ctx.closePath()
    ctx.fill()
  }
  for (const x of TOP_WINDOWS) {
    beam([[x, 16], [x + 56, 16], [x + 64 + slant, 92], [x - 8 + slant, 92]], 0, 16, 0, 92)
  }
  const [[lx, ly, lh], [rx, ry, rh]] = SIDE_WINDOWS
  // The low sun reaches in through one side or the other.
  const fromLeft = h < 12 ? 1 : 0.35
  const fromRight = h >= 12 ? 1 : 0.35
  ctx.globalAlpha = fromLeft
  beam([[lx + 6, ly], [lx + 6, ly + lh], [lx + 90, ly + lh + 18], [lx + 90, ly - 18]], lx + 6, 0, lx + 90, 0)
  ctx.globalAlpha = fromRight
  beam([[rx, ry], [rx, ry + rh], [rx - 84, ry + rh + 18], [rx - 84, ry - 18]], rx, 0, rx - 84, 0)
  ctx.globalAlpha = 1
}

// The evening: the room darkens, and what gives light glows: the lamps, the
// pendant over the kitchen table, the ceiling lights and every screen in use.
const evening = (h, screens) => {
  const dark = darknessAt(h)
  if (dark <= 0) return
  ctx.fillStyle = `rgba(12, 18, 42, ${dark})`
  ctx.fillRect(0, 0, W, H)
  const k = dark / NIGHT
  const glow = (x, y, r, colour, alpha) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, `rgba(${colour}, ${alpha * k})`)
    g.addColorStop(1, `rgba(${colour}, 0)`)
    ctx.fillStyle = g
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }
  ctx.globalCompositeOperation = 'lighter'
  const lamp = '255, 196, 120'
  glow(130, 366, 54, lamp, 0.42)
  glow(176, 120, 44, lamp, 0.4)
  glow(368, 92, 64, lamp, 0.34)
  glow(276, 91, 30, lamp, 0.22)
  for (const [x, y] of [[166, 200], [314, 200], [166, 300], [314, 300], [92, 440], [240, 440], [388, 440]]) glow(x, y, 66, '255, 228, 180', 0.16)
  for (const [x, y] of screens) glow(x, y, 26, '130, 180, 255', 0.3)
  ctx.globalCompositeOperation = 'source-over'
  // The bulbs themselves
  for (const [x, y] of [[130, 366], [176, 120]]) circle(x, y, 1.8, '#FFF3C4')
}

// ── The building, drawn once per light ───────────────────────────────────
const WALL = '#3E4852'
const WALL_TOP = '#5A6672'
const background = document.createElement('canvas')
let backgroundKey = ''

const drawBuilding = (project, hour) => {
  const isNight = hour < 7 || hour >= 19
  const key = `${project}|${isNight}|${hour < 9 || hour >= 17}`
  if (key === backgroundKey) return
  backgroundKey = key
  const g = background.getContext('2d')
  g.setTransform(S, 0, 0, S, 0, 0)
  g.imageSmoothingEnabled = false
  g.clearRect(0, 0, W, H)
  const fill = (x, y, w, h, c) => {
    g.fillStyle = c
    g.fillRect(x, y, w, h)
  }
  const dot = (x, y, r, c, s) => {
    g.beginPath()
    g.arc(x, y, r, 0, Math.PI * 2)
    g.fillStyle = c
    g.fill()
    if (s) {
      g.lineWidth = 1
      g.strokeStyle = s
      g.stroke()
    }
  }
  const sky = isNight ? '#16233D' : hour < 9 || hour >= 17 ? '#F4B88A' : '#A9D8F5'

  fill(0, 0, W, H, isNight ? '#1C2430' : '#7FB069')
  // Claude's corner office: oak planks
  fill(6, 16, 240, 116, '#DCC194')
  for (let i = 0; i < 11; i++) {
    fill(6, 18 + i * 10, 240, 1, '#C9AC7E')
    fill(20 + ((i * 47) % 210), 18 + i * 10, 1, 10, '#C9AC7E')
  }
  // Kitchen: tiles
  fill(252, 16, 222, 116, '#F3F5F6')
  for (let c = 0; c < 19; c++) for (let r = 0; r < 10; r++) if ((c + r) % 2 === 0) fill(252 + c * 12, 16 + r * 12, 12, 12, '#E4E8EB')
  // Team room: sage carpet
  fill(6, 138, 468, 240, '#CBD9C7')
  for (let c = 0; c < 20; c++) fill(6 + c * 24, 138, 1, 240, '#BCCBB8')
  for (let r = 0; r < 10; r++) fill(6, 138 + r * 24, 468, 1, '#BCCBB8')
  // Project room
  fill(6, 384, 468, H - 390, '#D6DCE6')
  for (let r = 0; r < 5; r++) fill(6, 384 + r * 24, 468, 1, '#C7CED9')

  // Walls and windows
  fill(0, 0, W, 16, WALL)
  fill(0, 0, W, 6, WALL_TOP)
  for (const x of [30, 120, 290, 390]) {
    fill(x, 1, 56, 5, sky)
    fill(x + 27, 1, 2, 5, WALL_TOP)
  }
  fill(0, 0, 6, H, WALL)
  fill(W - 6, 0, 6, H, WALL)
  fill(246, 16, 6, 74, WALL)
  fill(246, 122, 6, 16, WALL)
  fill(0, 132, 196, 6, WALL)
  fill(236, 132, 64, 6, WALL)
  fill(340, 132, W - 340, 6, WALL)
  fill(246, 90, 6, 32, '#CDB892')
  fill(196, 132, 40, 6, '#CDB892')
  fill(300, 132, 40, 6, '#D5DAD2')
  fill(0, 378, 214, 6, WALL)
  fill(262, 378, W - 262, 6, WALL)
  fill(214, 378, 48, 6, '#C3CCD6')
  fill(0, H - 6, W, 6, WALL)
  fill(W - 6, 236, 6, 40, '#8C6B4A')
  for (const [x, y, h] of SIDE_WINDOWS) {
    fill(x, y, 6, h, sky)
    fill(x + 1, y + h / 2 - 1, 4, 2, WALL_TOP)
  }
  fill(W - 18, 242, 12, 28, '#6E5A44')
  // Name plate on the top wall
  g.fillStyle = '#20262E'
  g.beginPath()
  g.roundRect(W / 2 - 60, 3, 120, 11, 2)
  g.fill()
  g.font = `700 8px ${FONT}`
  g.fillStyle = '#E9EEF2'
  g.textAlign = 'center'
  g.fillText(clip(project || 'Kontoret', 26), W / 2, 11.5)

  // Corner office
  g.globalAlpha = 0.35
  fill(52, 40, 152, 86, OUTLINE)
  g.globalAlpha = 1
  fill(54, 42, 148, 82, '#6F9C8E')
  g.strokeStyle = '#9CC2B5'
  g.lineWidth = 2
  g.strokeRect(58, 46, 140, 74)
  for (const k of [0, 1]) {
    fill(10, 22 + k * 44, 12, 40, OUTLINE)
    fill(11, 23 + k * 44, 10, 38, '#8B5E3C')
    ;['#D45D7A', '#3E7CC9', '#D6A23C', '#2E9E8F', '#8A6FD6'].forEach((c, i) => fill(12, 25 + k * 44 + i * 7, 8, 5, ['#D45D7A', '#3E7CC9', '#D6A23C', '#2E9E8F', '#8A6FD6'][(i + k) % 5]))
  }
  // An armchair by the door, and a side table with a lamp
  fill(194, 106, 28, 24, OUTLINE)
  fill(195, 107, 26, 6, '#A9512E')
  fill(195, 107, 5, 22, '#B85A33')
  fill(216, 107, 5, 22, '#B85A33')
  fill(200, 113, 16, 15, '#D9744A')
  fill(202, 115, 12, 3, '#E99A73')
  dot(176, 120, 7, OUTLINE)
  dot(176, 120, 5.8, '#B98F5E')
  dot(176, 120, 3.2, '#F6E3A8', '#C9A55A')
  // The whiteboard; board() writes the day's numbers on it
  fill(BOARD.x - 1, BOARD.y - 1, BOARD.w + 2, BOARD.h + 2, OUTLINE)
  fill(BOARD.x, BOARD.y, BOARD.w, BOARD.h, '#F6F7F8')
  fill(BOARD.x + 2, BOARD.y + BOARD.h - 1, BOARD.w - 4, 2, '#B9C3CC')
  fill(BOARD.x + 6, BOARD.y + BOARD.h - 1.5, 5, 1.5, '#E5484D')
  fill(BOARD.x + 13, BOARD.y + BOARD.h - 1.5, 5, 1.5, '#3E7CC9')

  // Kitchen
  fill(256, 18, 150, 16, OUTLINE)
  fill(257, 19, 148, 14, '#F7F7F5')
  fill(257, 31, 148, 2, '#C9CED3')
  fill(266, 20, 14, 12, '#2B2F36')
  dot(273, 26, 2, '#E07A4F')
  fill(300, 21, 22, 9, '#B9C3CC')
  fill(330, 21, 20, 10, '#9CB4C6')
  fill(336, 23, 8, 5, '#D7E9FA')
  dot(386, 26, 4, '#E9EEF2', OUTLINE)
  for (const x of [280, 312, 344, 376]) {
    dot(x, 44, 5, OUTLINE)
    dot(x, 44, 3.8, '#C9A273')
  }
  fill(440, 18, 28, 34, OUTLINE)
  fill(441, 19, 26, 32, '#E9EEF2')
  fill(441, 33, 26, 1, '#B9C3CC')
  // A round rug under the big table
  dot(368, 92, 34, '#DDE6E0')
  dot(368, 92, 31, '#E8EFEA')
  g.strokeStyle = '#C9D6CD'
  g.lineWidth = 1
  g.beginPath()
  g.arc(368, 92, 26, 0, Math.PI * 2)
  g.stroke()
  dot(368, 92, 20, OUTLINE)
  dot(368, 92, 18.5, '#C9A273')
  dot(368, 92, 15, '#D9B88A')
  dot(368, 92, 6, '#F7F7F5', OUTLINE)
  dot(366, 90, 2, '#E07A4F')
  dot(370, 91, 2, '#D6A23C')
  dot(368, 94, 2, '#56A86B')
  for (const [x, y] of [[368, 64], [396, 92], [368, 120]]) {
    dot(x, y, 7, OUTLINE)
    dot(x, y, 5.5, '#465566')
  }
  // A small bistro table for two in the corner
  for (const y of [74, 108]) {
    dot(276, y, 5.5, OUTLINE)
    dot(276, y, 4.2, '#C9A273')
  }
  dot(276, 91, 9, OUTLINE)
  dot(276, 91, 7.8, '#F7F7F5')
  dot(273, 89, 2, '#FFFFFF', '#B9C3CC')
  dot(279, 93, 1.6, '#7A4B2A')
  // A snack machine under the fridge
  fill(436, 64, 32, 30, OUTLINE)
  fill(437, 65, 30, 28, '#3E7CC9')
  fill(439, 67, 19, 22, '#D7E9FA')
  ;['#E5484D', '#D6A23C', '#2E9E8F', '#E07A4F', '#8A6FD6', '#56A86B'].forEach((c, i) => fill(441 + (i % 3) * 6, 69 + Math.floor(i / 3) * 10, 4, 6, c))
  fill(460, 69, 5, 3, '#2B2F36')
  fill(460, 76, 5, 10, '#2F5F9C')

  // Team room. A soft rug under each desk, each its own colour.
  const rugs = [['#BCD0C4', '#AFC4B7'], ['#CFC6DC', '#C2B8D1'], ['#DDCDB7', '#D1BFA6'], ['#BFD0DD', '#B0C3D2'], ['#DCC7CB', '#D0B7BC'], ['#CBD5B5', '#BDC9A5']]
  for (let seat = 0; seat < SEATS; seat++) {
    const { cx, dy } = seatAt(seat)
    const [base, edge] = rugs[seat]
    g.fillStyle = edge
    g.beginPath()
    g.roundRect(cx - 52, dy - 26, 104, 64, 6)
    g.fill()
    g.fillStyle = base
    g.beginPath()
    g.roundRect(cx - 49, dy - 23, 98, 58, 4)
    g.fill()
  }

  // A bookshelf along the left wall
  fill(8, 178, 14, 76, OUTLINE)
  fill(9, 179, 12, 74, '#8B5E3C')
  ;['#D45D7A', '#3E7CC9', '#D6A23C', '#2E9E8F', '#8A6FD6', '#E07A4F', '#56A86B', '#D45D7A', '#3E7CC9', '#D6A23C'].forEach((c, i) => fill(10, 181 + i * 7, 10, 5, c))

  // The printer, and a plant beside it
  fill(14, 356, 30, 18, OUTLINE)
  fill(15, 357, 28, 16, '#D3D8DD')
  fill(19, 360, 20, 3, '#2B2F36')
  fill(21, 365, 16, 6, '#F6F7F8')

  // The lounge corner: a rug, a sofa against the wall, a coffee table, a lamp
  g.fillStyle = '#E6D3B3'
  g.beginPath()
  g.roundRect(138, 346, 84, 31, 4)
  g.fill()
  g.strokeStyle = '#D2BC97'
  g.lineWidth = 1
  g.strokeRect(141.5, 349.5, 77, 24)
  fill(146, 361, 66, 16, OUTLINE)
  fill(147, 368, 64, 8, '#4F7FA8')
  fill(147, 362, 64, 7, '#3D6A92')
  fill(147, 362, 6, 14, '#3D6A92')
  fill(205, 362, 6, 14, '#3D6A92')
  fill(155, 369, 22, 6, '#6C9BC4')
  fill(181, 369, 22, 6, '#6C9BC4')
  fill(163, 349, 32, 9, OUTLINE)
  fill(164, 350, 30, 7, '#B98F5E')
  fill(167, 351, 8, 4, '#F6F7F8')
  dot(186, 353, 2.2, '#FFFFFF', '#B9C3CC')
  dot(130, 366, 6, OUTLINE)
  dot(130, 366, 4.8, '#F6E3A8')
  dot(130, 366, 1.6, '#D6A23C')

  // A ping-pong table, net across the middle
  fill(290, 350, 52, 26, OUTLINE)
  fill(291, 351, 50, 24, '#2E8B6E')
  fill(291, 362.5, 50, 1, '#FFFFFF')
  fill(315.5, 351, 1, 24, '#E9EEF2')
  fill(315, 349, 2, 28, '#2B2F36')
  dot(300, 356, 1.6, '#FFFFFF')
  dot(286, 358, 3, '#E5484D', OUTLINE)
  dot(346, 368, 3, '#3E7CC9', OUTLINE)

  fill(452, 334, 16, 24, OUTLINE)
  fill(453, 335, 14, 10, '#9CC4EC')
  fill(453, 346, 14, 11, '#E9EEF2')
  g.font = `700 8.5px ${FONT}`
  g.fillStyle = '#5B6672'
  g.textAlign = 'left'
  g.fillText('Dine andre sessioner', 16, H - 12)

  // Plants
  for (const [x, y, big] of [[228, 36, true], [22, 116], [462, 120], [462, 150, true], [20, 150], [380, 368], [56, 368], [234, 366, true], [262, 120]]) {
    const r = big ? 9 : 7
    fill(x - 5, y, 10, 8, '#B5683E')
    dot(x, y - 2, r, '#3E8A55', OUTLINE)
    dot(x - r / 2, y - 4, r / 2, '#56A86B')
    dot(x + r / 3, y - r, r / 3, '#6CC082')
  }
}

// ── Clicking on someone ──────────────────────────────────────────────────
const seatedBox = (cx, dy) => ({ x0: cx - 22, y0: dy - 30, x1: cx + 22, y1: dy + 42 })
const standingBox = (x, y) => ({ x0: x - 17, y0: y - 46, x1: x + 17, y1: y + 15 })

// ── Celebrations ─────────────────────────────────────────────────────────
const party = (p, spot, t) => {
  const age = (t - p.at) / 1000
  if (age < 0 || age > 5) return
  if (p.kind === 'confetti') {
    const colours = ['#E5484D', '#3E7CC9', '#D6A23C', '#2E9E8F', '#8A6FD6', '#E07A4F']
    for (let i = 0; i < 40; i++) {
      const dur = 1.3 + (i % 5) * 0.18
      const k = ((age + (i % 7) * 0.12) % dur) / dur
      const x = spot.cx + (((i * 37 + 11) % 97) / 97) * 120 - 60 + Math.sin(age * 3 + i) * 3
      ctx.globalAlpha = 1 - k
      rect(x, spot.dy - 60 + k * 75, 3, i % 3 === 0 ? 2 : 3, colours[i % colours.length])
    }
    ctx.globalAlpha = 1
  } else if (p.kind === 'rain') {
    for (let i = 0; i < 9; i++) {
      const k = ((age + (i % 4) * 0.17) % 0.7) / 0.7
      rect(spot.cx - 18 + i * 4.5, spot.dy - 50 + k * 28, 1.5, 4, '#5DA9E9')
    }
    for (const [dx, dy, r] of [[-14, 6, 9], [0, 2, 12], [14, 6, 9], [-6, 10, 9], [8, 10, 9]]) circle(spot.cx + dx, spot.dy - 66 + dy, r, '#8B97A6', OUTLINE)
    rect(spot.cx - 18, spot.dy - 56, 36, 6, '#8B97A6')
  } else {
    ;['#E5484D', '#D6A23C', '#3E7CC9'].forEach((c, i) => {
      const rise = Math.min(1, age / (3 + i * 0.4)) * 80
      const x = spot.cx - 22 + i * 22 + Math.sin(age * 2 + i) * 2
      const y = spot.dy - 10 - rise
      ctx.strokeStyle = OUTLINE
      ctx.lineWidth = 0.8
      ctx.beginPath()
      ctx.moveTo(x, y + 8)
      ctx.quadraticCurveTo(x - 3, y + 16, x, y + 24)
      ctx.stroke()
      ctx.beginPath()
      ctx.ellipse(x, y, 7, 9, 0, 0, Math.PI * 2)
      ctx.fillStyle = c
      ctx.fill()
      ctx.lineWidth = 1
      ctx.stroke()
    })
  }
  tag(spot.cx, spot.dy - 78, p.label, p.kind === 'rain' ? '#5B6B7E' : '#2E9E8F')
}

// ── One frame ────────────────────────────────────────────────────────────
let state = { sessions: [] }
let focusKey = null
try {
  focusKey = localStorage.getItem('agent-kontor:focus')
} catch {}
let isChosen = focusKey !== null

const focused = () => state.sessions.find(s => s.key === focusKey) ?? state.sessions[0] ?? null

// Where each figure stood in the last frame, for clicks: { kind, id, x0, y0, x1, y1 }
// in scene units, later entries drawn on top.
let hits = []
let selected = null // { kind: 'claude' | 'sub', id }

const draw = () => {
  const now = Date.now()
  const t = performance.now()
  const s = focused()
  const frameHits = []
  const timeNow = timeOfDay()
  const hour = Math.floor(timeNow)
  drawBuilding(s?.project ?? '', hour)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(background, 0, 0)
  ctx.setTransform(S, 0, 0, S, 0, 0)

  const main = s?.main ?? { state: 'idle', detail: 'Ingen session' }
  const isOut = main.state === 'idle'
  const subs = s?.subs ?? []

  daylight(timeNow)
  board(s?.stats)
  clock(new Date())
  // Screens in use, which glow in the dark
  const glowing = []

  // Claude
  chair(MAIN.cx, MAIN.dy)
  if (!isOut) sitting(MAIN.cx, MAIN.dy + 4, claudeLook, main.state === 'waiting', t)
  desk(MAIN.cx, MAIN.dy, 128, isOut ? null : main.state, t, 2)
  if (!isOut) glowing.push([MAIN.cx + 46, MAIN.dy + 8], [MAIN.cx - 46, MAIN.dy + 8])
  if (!isOut) {
    hands(MAIN.cx, MAIN.dy, claudeLook, main.state !== 'waiting', t)
    tag(MAIN.cx, MAIN.dy + 30, 'Claude', '#C8643B')
    frameHits.push({ kind: 'claude', id: 'claude', ...seatedBox(MAIN.cx, MAIN.dy) })
  } else {
    frameHits.push({ kind: 'claude', id: 'claude', ...standingBox(KITCHEN_SEAT.x, KITCHEN_SEAT.y) })
    standing(KITCHEN_SEAT.x, KITCHEN_SEAT.y, claudeLook, 'front', false, t)
    // The mug, and its steam
    const mx = KITCHEN_SEAT.x + 15
    const my = KITCHEN_SEAT.y - 22
    rect(mx + 8, my + 2, 3, 5, OUTLINE)
    rect(mx + 8.5, my + 3, 1.5, 3, '#FFFFFF')
    rect(mx, my, 9, 10, OUTLINE)
    rect(mx + 1, my + 1, 7, 8, '#FFFFFF')
    rect(mx + 1, my + 1, 7, 2, '#7A4B2A')
    ctx.globalAlpha = 0.7
    for (let i = 0; i < 2; i++) rect(mx + 2 + i * 3, my - 3 - ((t / 40 + i * 10) % 12), 1.5, 3, '#C9D2DA')
    ctx.globalAlpha = 1
    tag(KITCHEN_SEAT.x, KITCHEN_SEAT.y + 3, 'Claude', '#C8643B')
    // The coffee machine on the counter, just used
    ctx.globalAlpha = 0.55
    for (let i = 0; i < 3; i++) {
      const rise = (t / 50 + i * 7) % 18
      rect(270 + i * 2.5 + Math.sin((t / 300) + i) * 1.2, 20 - rise * 0.4 + 14 - rise, 1.5, 3, '#E9EEF2')
    }
    ctx.globalAlpha = 1
  }

  // The team room
  const walkers = []
  for (let seat = 0; seat < SEATS; seat++) {
    const { cx, dy } = seatAt(seat)
    const sub = subs.find(x => x.seat === seat && poseOf(x, now)?.seated)
    chair(cx, dy)
    if (sub) sitting(cx, dy + 4, lookFor(sub.id), sub.activity.state === 'waiting', t)
    desk(cx, dy, 84, sub ? sub.activity.state : null, t)
    if (sub) deskThingsFor(sub.id, cx, dy)
    if (sub) glowing.push([cx + 24, dy + 8])
    if (sub) {
      hands(cx, dy, lookFor(sub.id), sub.activity.state !== 'waiting', t + seat * 37)
      tag(cx, dy + 30, sub.name, '#4A5868')
      frameHits.push({ kind: 'sub', id: sub.id, ...seatedBox(cx, dy) })
    }
  }
  for (const sub of subs) {
    const pose = poseOf(sub, now)
    if (pose && !pose.seated) walkers.push({ sub, pose })
  }
  walkers.sort((a, b) => a.pose.y - b.pose.y)
  for (const { sub, pose } of walkers) {
    standing(pose.x, pose.y, lookFor(sub.id), pose.facing, pose.isWalking, t)
    tag(pose.x, pose.y + 3, sub.name, '#4A5868')
    frameHits.push({ kind: 'sub', id: sub.id, ...standingBox(pose.x, pose.y) })
  }

  // The project room: the other sessions
  const others = state.sessions.filter(x => x !== s).slice(0, 4)
  others.forEach((o, i) => {
    const cx = 72 + i * 112
    const dy = 440
    const look = { ...claudeLook, shirt: shirts[hashOf(o.key) % shirts.length][0], shirtShade: shirts[hashOf(o.key) % shirts.length][1] }
    const away = o.main.state === 'idle'
    chair(cx, dy)
    if (!away) sitting(cx, dy + 4, look, o.main.state === 'waiting', t)
    desk(cx, dy, 80, away ? null : o.main.state, t)
    if (!away) hands(cx, dy, look, o.main.state !== 'waiting', t + i * 51)
    tag(cx, dy + 30, clip(o.project, 16), '#C8643B')
    if (o.subs?.length) tag(cx + 30, dy + 44, `+${o.subs.length}`, '#4A5868')
    frameHits.push({ kind: 'session', id: o.key, x0: cx - 42, y0: dy - 40, x1: cx + 42, y1: dy + 44 })
  })
  for (let i = others.length; i < 4; i++) {
    chair(72 + i * 112, 440)
    desk(72 + i * 112, 440, 80, null, t)
  }

  evening(timeNow, glowing)

  // Speech, on top of everyone
  const thanking = walkers.find(w => w.pose.handover)
  if (isOut) {
    const lines = ['Kaffepause', s?.stats?.linesAdded ? `${s.stats.linesAdded} linjer i dag` : 'Klar når du er', 'Godt arbejde, team', 'Hvad nu?']
    bubble(KITCHEN_SEAT.x, KITCHEN_SEAT.y - 46, lines[Math.floor(t / 3000) % lines.length], false, t)
  } else if (thanking) {
    bubble(MAIN.cx, MAIN.dy - 30, thanking.sub.outcome === 'failed' ? `Øv, ${thanking.sub.name}` : `Tak, ${thanking.sub.name}!`, false, t)
  } else {
    bubble(MAIN.cx, MAIN.dy - 30, main.detail, main.state === 'waiting', t)
  }
  for (let seat = 0; seat < SEATS; seat++) {
    const sub = subs.find(x => x.seat === seat && poseOf(x, now)?.seated)
    if (sub) bubble(seatAt(seat).cx, seatAt(seat).dy - 30, sub.activity.detail, sub.activity.state === 'waiting', t)
  }
  for (const { sub, pose } of walkers) {
    if (pose.handover) bubble(pose.x, pose.y - 46, sub.outcome === 'failed' ? `Gik i stå: ${sub.task}` : `Afleverer: ${sub.task}`, sub.outcome === 'failed', t)
  }
  others.forEach((o, i) => {
    if (o.main.state === 'idle') tag(72 + i * 112, 418, 'Holder pause', '#8A94A0')
    else bubble(72 + i * 112, 410, o.main.detail, o.main.state === 'waiting', t)
  })
  // The one whose card is open, ringed.
  const ring = selected && frameHits.find(h => h.kind === selected.kind && h.id === selected.id)
  if (ring) {
    ctx.setLineDash([3, 2])
    rounded(ring.x0, ring.y0, ring.x1 - ring.x0, ring.y1 - ring.y0, 6, 'rgba(47,134,214,0.08)', '#2F86D6', 1.2)
    ctx.setLineDash([])
  }
  hits = frameHits

  const waitingAtDoor = subs.filter(x => x.seat < 0).length
  if (waitingAtDoor) tag(DOOR.x - 40, 230, `+${waitingAtDoor} venter ved døren`, '#C8643B')

  if (s?.party) {
    const who = subs.find(x => x.id === s.party.who && x.seat >= 0)
    party({ ...s.party, at: performance.now() - (now - s.party.at) }, who ? seatAt(who.seat) : MAIN, t)
  }

  requestAnimationFrame(draw)
}
document.documentElement.style.setProperty('--office', String(W / H))
fit()
new ResizeObserver(fit).observe(stage)
// Dragged to a screen with another pixel density: draw sharp for that one.
window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener('change', fit)
requestAnimationFrame(draw)

// ── The page around the picture ──────────────────────────────────────────
const tabs = document.getElementById('tabs')
const people = document.getElementById('people')
const alertBox = document.getElementById('alert')
const statusLine = document.getElementById('status')

const el = (tagName, props = {}, children = []) => {
  const node = Object.assign(document.createElement(tagName), props)
  for (const child of children) node.append(child)
  return node
}
const dot = state => el('span', { className: 'dot', style: `background:${stateColor[state] ?? '#8A94A0'}` })

const renderPage = () => {
  const s = focused()
  tabs.replaceChildren(
    ...state.sessions.map(x =>
      el('button', { className: 'tab', type: 'button', onclick: () => choose(x.key), ariaPressed: String(x === s) }, [dot(x.main.state), x.project || 'Session']),
    ),
  )
  if (!s) {
    people.replaceChildren(el('li', { className: 'empty' }, ['Ingen Claude-sessioner kører lige nu. Start en session med Agent-kontor installeret, så sætter Claude sig her.']))
    alertBox.textContent = ''
    return
  }
  const waiting = [s, ...state.sessions.filter(x => x !== s)].filter(x => x.main.state === 'waiting')
  alertBox.textContent = waiting.map(x => `Claude i ${x.project} venter på dig: ${x.main.detail}`).join(' · ')

  const stats = s.stats ?? {}
  const facts = [
    stats.linesAdded || stats.linesRemoved ? `+${stats.linesAdded} −${stats.linesRemoved} linjer` : null,
    typeof stats.costUsd === 'number' ? `$${stats.costUsd.toFixed(2)}` : null,
    typeof stats.fiveHour === 'number' ? `${Math.round(stats.fiveHour)} % af 5-timers-grænsen` : null,
  ].filter(Boolean)
  const row = (name, what, stateName, note) =>
    el('li', {}, [dot(stateName), el('span', { className: 'name' }, [name]), el('span', { className: 'what', style: `color:${stateColor[stateName]}` }, [what]), ...(note ? [el('span', { className: 'note' }, [note])] : [])])
  people.replaceChildren(
    row('Claude', s.main.detail, s.main.state, facts.join(', ') || null),
    ...(s.subs ?? []).map(sub => row(sub.name, sub.activity.detail, sub.activity.state, sub.task)),
  )
}

// ── The details card ─────────────────────────────────────────────────────
const card = document.getElementById('card')

const sceneAt = e => {
  const box = canvas.getBoundingClientRect()
  return { x: ((e.clientX - box.left) / box.width) * W, y: ((e.clientY - box.top) / box.height) * H }
}
const hitAt = e => {
  const { x, y } = sceneAt(e)
  for (let i = hits.length - 1; i >= 0; i--) {
    const h = hits[i]
    if (x >= h.x0 && x <= h.x1 && y >= h.y0 && y <= h.y1) return h
  }
  return null
}

const ago = (now, at) => {
  const minutes = Math.floor((now - at) / 60_000)
  if (minutes < 1) return 'under et minut'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  return `${hours} t ${minutes % 60} min`
}
const clockTime = at => new Date(at).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' })
const phaseNote = sub =>
  sub.outcome === 'failed' && (sub.phase === 'delivering' || sub.phase === 'leaving')
    ? 'Gik i stå'
    : { arriving: 'På vej ind', working: sub.seat < 0 ? 'Venter ved døren' : null, delivering: 'Afleverer', leaving: 'Går igen' }[sub.phase] ?? null

// Who the card is about, as the newest state says; null once they are gone.
const subject = () => {
  const s = focused()
  if (!selected || !s) return null
  if (selected.kind === 'claude') {
    const stats = s.stats ?? {}
    return {
      name: 'Claude',
      task: s.project,
      activity: s.main,
      startedAt: s.startedAt,
      tools: stats.tools,
      linesAdded: stats.linesAdded,
      linesRemoved: stats.linesRemoved,
      note: typeof stats.costUsd === 'number' ? `$${stats.costUsd.toFixed(2)} i denne session` : null,
      recent: stats.recent,
    }
  }
  const sub = (s.subs ?? []).find(x => x.id === selected.id)
  if (!sub) return null
  return { ...sub, note: phaseNote(sub) }
}

const renderCard = () => {
  const who = subject()
  if (!who) {
    selected = null
    card.hidden = true
    return
  }
  const now = Date.now()
  const facts = [
    who.startedAt ? `I gang i ${ago(now, who.startedAt)}` : null,
    typeof who.tools === 'number' ? `${who.tools} ${who.tools === 1 ? 'værktøj' : 'værktøjer'}` : null,
    who.linesAdded || who.linesRemoved ? `+${who.linesAdded ?? 0} −${who.linesRemoved ?? 0} linjer` : null,
  ].filter(Boolean)
  const steps = [...(who.recent ?? [])].reverse()
  card.replaceChildren(
    el('div', { className: 'card-head' }, [
      dot(who.activity.state),
      el('strong', {}, [who.name]),
      el('button', { className: 'card-close', type: 'button', ariaLabel: 'Luk', onclick: () => select(null) }, ['×']),
    ]),
    ...(who.task ? [el('div', { className: 'card-task' }, [who.task])] : []),
    el('div', { className: 'card-now', style: `color:${stateColor[who.activity.state] ?? 'inherit'}` }, [who.activity.detail]),
    ...(who.note ? [el('div', { className: 'card-note' }, [who.note])] : []),
    ...(facts.length ? [el('div', { className: 'card-facts' }, [facts.join(' · ')])] : []),
    ...(steps.length
      ? [
          el('div', { className: 'card-label' }, ['Seneste']),
          el('ol', { className: 'card-steps' }, steps.map(step => el('li', {}, [el('time', {}, [clockTime(step.at)]), step.detail]))),
        ]
      : []),
  )
  card.hidden = false
  placeCard()
}

// Beside the figure, inside the picture; above it when there is no room below.
const placeCard = () => {
  const h = selected && hits.find(x => x.kind === selected.kind && x.id === selected.id)
  if (!h || card.hidden) return
  const box = canvas.getBoundingClientRect()
  const stageBox = stage.getBoundingClientRect()
  const scale = box.width / W
  const left = box.left - stageBox.left
  const top = box.top - stageBox.top
  const cardWidth = card.offsetWidth
  const cardHeight = card.offsetHeight
  const right = left + h.x1 * scale + 8
  const leftSide = left + h.x0 * scale - cardWidth - 8
  let x
  let y
  if (right + cardWidth <= left + box.width || leftSide >= left) {
    x = right + cardWidth <= left + box.width ? right : leftSide
    y = top + h.y0 * scale
  } else {
    // No room beside it (a narrow window): under the figure, over it if
    // there is room there, or else on under the picture, but never over it.
    x = left + ((h.x0 + h.x1) / 2) * scale - cardWidth / 2
    const below = top + h.y1 * scale + 6
    const above = top + h.y0 * scale - cardHeight - 6
    y = below + cardHeight <= top + box.height || above < top ? below : above
    card.style.transform = `translate(${Math.round(Math.max(left + 4, Math.min(x, left + box.width - cardWidth - 4)))}px, ${Math.round(y)}px)`
    return
  }
  x = Math.max(left + 4, Math.min(x, left + box.width - cardWidth - 4))
  y = Math.max(top + 4, Math.min(y, top + box.height - cardHeight - 4))
  card.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`
}

const select = next => {
  selected = next
  renderCard()
}

canvas.addEventListener('click', e => {
  const h = hitAt(e)
  if (h?.kind === 'session') {
    select(null)
    choose(h.id)
  } else {
    select(h && !(selected && selected.kind === h.kind && selected.id === h.id) ? { kind: h.kind, id: h.id } : null)
  }
})
canvas.addEventListener('mousemove', e => {
  canvas.style.cursor = hitAt(e) ? 'pointer' : 'default'
})
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') select(null)
})
// Times move on, and walkers move the card with them.
setInterval(() => selected && renderCard(), 1000)
const follow = () => {
  placeCard()
  requestAnimationFrame(follow)
}
requestAnimationFrame(follow)

const choose = key => {
  focusKey = key
  isChosen = true
  try {
    localStorage.setItem('agent-kontor:focus', key)
  } catch {}
  renderPage()
}

const receive = next => {
  state = next
  if (selected) renderCard()
  // A session picked by hand stays in view while it lives. Until then the
  // view follows the work: away from a session on a break to one that isn't.
  const current = state.sessions.find(x => x.key === focusKey)
  const busy = state.sessions.find(x => x.main.state !== 'idle')
  if (!current) focusKey = (busy ?? state.sessions[0])?.key ?? null
  else if (!isChosen && current.main.state === 'idle' && busy) focusKey = busy.key
  renderPage()
}

const connect = () => {
  const events = new EventSource('/api/events')
  events.onopen = () => {
    statusLine.textContent = 'Live'
    statusLine.classList.remove('lost')
  }
  events.onmessage = e => receive(JSON.parse(e.data))
  // The browser tries again by itself every two seconds; a session that has
  // the office open starts the server again within a minute.
  events.onerror = () => {
    statusLine.textContent = 'Forbindelsen er tabt. Prøver igen… Er Claude lukket, så tryk på 🏢 Åbn kontor i Claude.'
    statusLine.classList.add('lost')
  }
}
connect()
