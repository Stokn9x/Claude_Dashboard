// Agent-kontor: the office, drawn and animated on a canvas. The server sends
// what each session's status file says; this page works out every step of
// every walk from those timestamps, so nothing reloads and nothing stutters.
'use strict'

// ── Geometry: must match hooks/register.tsx, which times the same walks ──
const W = 480
const H = 508
const S = 3 // canvas pixels per scene unit
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
canvas.width = W * S
canvas.height = H * S
const ctx = canvas.getContext('2d')
ctx.imageSmoothingEnabled = false

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

const chair = (cx, dy) => {
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

// ── The building, drawn once per light ───────────────────────────────────
const WALL = '#3E4852'
const WALL_TOP = '#5A6672'
const background = document.createElement('canvas')
background.width = W * S
background.height = H * S
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
  fill(196, 112, 26, 18, OUTLINE)
  fill(198, 114, 22, 14, '#C8643B')
  fill(200, 116, 18, 4, '#E3875E')
  fill(200, 54, 34, 18, OUTLINE)
  fill(201, 55, 32, 16, '#F6F7F8')
  fill(204, 59, 18, 1.5, '#3E7CC9')
  fill(204, 63, 24, 1.5, '#E07A4F')
  fill(204, 67, 12, 1.5, '#2E9E8F')

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

  // Team room
  fill(40, 346, 2, 12, OUTLINE)
  fill(88, 346, 2, 12, OUTLINE)
  fill(34, 342, 62, 8, OUTLINE)
  fill(35, 343, 60, 6, '#F6F7F8')
  fill(38, 344, 14, 1.5, '#3E7CC9')
  fill(56, 344, 20, 1.5, '#E07A4F')
  fill(80, 344, 10, 1.5, '#2E9E8F')
  fill(14, 356, 30, 18, OUTLINE)
  fill(15, 357, 28, 16, '#D3D8DD')
  fill(19, 360, 20, 3, '#2B2F36')
  dot(300, 360, 9, OUTLINE)
  dot(300, 360, 7.5, '#E07A4F')
  dot(324, 364, 9, OUTLINE)
  dot(324, 364, 7.5, '#3E7CC9')
  fill(452, 334, 16, 24, OUTLINE)
  fill(453, 335, 14, 10, '#9CC4EC')
  fill(453, 346, 14, 11, '#E9EEF2')
  g.font = `700 8.5px ${FONT}`
  g.fillStyle = '#5B6672'
  g.textAlign = 'left'
  g.fillText('Dine andre sessioner', 16, H - 12)

  // Plants
  for (const [x, y, big] of [[228, 36, true], [22, 116], [462, 120], [462, 150, true], [20, 150], [380, 368]]) {
    const r = big ? 9 : 7
    fill(x - 5, y, 10, 8, '#B5683E')
    dot(x, y - 2, r, '#3E8A55', OUTLINE)
    dot(x - r / 2, y - 4, r / 2, '#56A86B')
    dot(x + r / 3, y - r, r / 3, '#6CC082')
  }
}

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

const draw = () => {
  const now = Date.now()
  const t = performance.now()
  const s = focused()
  const hour = new Date().getHours()
  drawBuilding(s?.project ?? '', hour)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.drawImage(background, 0, 0)
  ctx.setTransform(S, 0, 0, S, 0, 0)

  const main = s?.main ?? { state: 'idle', detail: 'Ingen session' }
  const isOut = main.state === 'idle'
  const subs = s?.subs ?? []

  // Claude
  chair(MAIN.cx, MAIN.dy)
  if (!isOut) sitting(MAIN.cx, MAIN.dy + 4, claudeLook, main.state === 'waiting', t)
  desk(MAIN.cx, MAIN.dy, 128, isOut ? null : main.state, t, 2)
  if (!isOut) {
    hands(MAIN.cx, MAIN.dy, claudeLook, main.state !== 'waiting', t)
    tag(MAIN.cx, MAIN.dy + 30, 'Claude', '#C8643B')
  } else {
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
  }

  // The team room
  const walkers = []
  for (let seat = 0; seat < SEATS; seat++) {
    const { cx, dy } = seatAt(seat)
    const sub = subs.find(x => x.seat === seat && poseOf(x, now)?.seated)
    chair(cx, dy)
    if (sub) sitting(cx, dy + 4, lookFor(sub.id), sub.activity.state === 'waiting', t)
    desk(cx, dy, 84, sub ? sub.activity.state : null, t)
    if (sub) {
      hands(cx, dy, lookFor(sub.id), sub.activity.state !== 'waiting', t + seat * 37)
      tag(cx, dy + 30, sub.name, '#4A5868')
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
  })
  for (let i = others.length; i < 4; i++) {
    chair(72 + i * 112, 440)
    desk(72 + i * 112, 440, 80, null, t)
  }

  // Speech, on top of everyone
  const thanking = walkers.find(w => w.pose.handover)
  if (isOut) {
    const lines = ['Kaffepause', s?.stats?.linesAdded ? `${s.stats.linesAdded} linjer i dag` : 'Klar når du er', 'Godt arbejde, team', 'Hvad nu?']
    bubble(KITCHEN_SEAT.x, KITCHEN_SEAT.y - 46, lines[Math.floor(t / 3000) % lines.length], false, t)
  } else if (thanking) {
    bubble(MAIN.cx, MAIN.dy - 30, `Tak, ${thanking.sub.name}!`, false, t)
  } else {
    bubble(MAIN.cx, MAIN.dy - 30, main.detail, main.state === 'waiting', t)
  }
  for (let seat = 0; seat < SEATS; seat++) {
    const sub = subs.find(x => x.seat === seat && poseOf(x, now)?.seated)
    if (sub) bubble(seatAt(seat).cx, seatAt(seat).dy - 30, sub.activity.detail, sub.activity.state === 'waiting', t)
  }
  for (const { sub, pose } of walkers) if (pose.handover) bubble(pose.x, pose.y - 46, `Afleverer: ${sub.task}`, false, t)
  others.forEach((o, i) => {
    if (o.main.state === 'idle') tag(72 + i * 112, 418, 'Holder pause', '#8A94A0')
    else bubble(72 + i * 112, 410, o.main.detail, o.main.state === 'waiting', t)
  })
  const waitingAtDoor = subs.filter(x => x.seat < 0).length
  if (waitingAtDoor) tag(DOOR.x - 40, 230, `+${waitingAtDoor} venter ved døren`, '#C8643B')

  if (s?.party) {
    const who = subs.find(x => x.id === s.party.who && x.seat >= 0)
    party({ ...s.party, at: performance.now() - (now - s.party.at) }, who ? seatAt(who.seat) : MAIN, t)
  }

  requestAnimationFrame(draw)
}
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
  events.onerror = () => {
    statusLine.textContent = 'Forbindelsen til kontoret er tabt. Prøver igen…'
    statusLine.classList.add('lost')
  }
}
connect()
