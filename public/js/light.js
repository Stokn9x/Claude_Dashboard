// ── Light ────────────────────────────────────────────────────────────────
// Sunlight through the windows by day, and by night a dark blue over
// everything with the lamps, the screens and the street lights glowing.
import { owns } from './store.js'
import { circle, ctx } from './gfx.js'
import { GROUNDS, PLAN, hasNow, isBuilt, isOpenDoor, rectOf, roomById, shiftOf, sideWindowsOf, topWindowsOf, typeOf } from './plan.js'
import { visibleRect, visibleRooms } from './camera.js'
import { stir } from './util.js'
import { weatherAt } from './weather.js'
import { settings } from './settings.js'

// The time of day, in hours (14.5 is half past two). ?tid=21:30 in the
// address shows the office at that time instead, to see the evening by day.
const asked = new URLSearchParams(location.search).get('tid')
export const timeOfDay = () => {
  if (asked) {
    const [h, m = '0'] = asked.split(':')
    if (!Number.isNaN(Number(h))) return Number(h) + Number(m) / 60
  }
  const d = new Date()
  return d.getHours() + d.getMinutes() / 60
}

// The weather now (weather.js). ?vejr=regn, sne, skyet or klart in the
// address shows that weather, and ?maaned=12 that month's season.
const params = new URLSearchParams(location.search)
const WEATHER_WORDS = { klart: 'clear', skyet: 'cloudy', regn: 'rain', sne: 'snow' }
const askedWeather = { kind: WEATHER_WORDS[params.get('vejr')], month: Number(params.get('maaned')) || undefined }
// With the weather turned off in the settings, it is always clear; the
// season and Christmas stay.
export const weatherNow = () => {
  const w = weatherAt(Date.now(), askedWeather)
  return settings.weather || askedWeather.kind ? w : { ...w, kind: 'clear', intensity: 0, snowCover: 0 }
}

// How dark it is: none in the working day, deepening through the evening.
const NIGHT = 0.55
const darknessAt = h => {
  if (h >= 8 && h <= 17) return 0
  if (h > 17 && h < 20) return ((h - 17) / 3) * NIGHT
  if (h >= 6 && h < 8) return ((8 - h) / 2) * NIGHT
  return NIGHT
}
export const isNightAt = h => h < 7 || h >= 19
export const skyAt = h => (isNightAt(h) ? '#16233D' : h < 9 || h >= 17 ? '#F4B88A' : '#A9D8F5')

// The windows in side walls, where the rooms' walls are now: x of the
// wall, y, height, and which way in. A window where an open door now joins
// two rooms is gone.
export const sideWindows = () =>
  PLAN.rooms
    .filter(isBuilt)
    .flatMap(sideWindowsOf)
    .filter(w => !PLAN.doors.some(d => isOpenDoor(d) && d.x < w.x + 6 && w.x < d.x + d.w && d.y < w.y + w.h && w.y < d.y + d.h))
const topWindows = () => PLAN.rooms.filter(isBuilt).flatMap(room => topWindowsOf(room).map(x => ({ x, y: room.y })))

// Sunlight through the windows, falling at an angle that follows the sun:
// from the east in the morning, from the west in the afternoon.
export const daylight = h => {
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
  for (const { x, y } of topWindows()) {
    beam([[x, y], [x + 56, y], [x + 64 + slant, y + 76], [x - 8 + slant, y + 76]], 0, y, 0, y + 76)
  }
  // The low sun reaches in through one side or the other.
  for (const w of sideWindows()) {
    ctx.globalAlpha = w.isLeft ? (h < 12 ? 1 : 0.35) : h >= 12 ? 1 : 0.35
    const inner = w.isLeft ? w.x + 6 : w.x
    const far = w.isLeft ? inner + 84 : inner - 84
    beam([[inner, w.y], [inner, w.y + w.h], [far, w.y + w.h + 18], [far, w.y - 18]], inner, 0, far, 0)
  }
  ctx.globalAlpha = 1
}

// The weather over everything: a greyer light under clouds, rain falling
// in streaks and running along the window panes, or snow drifting down.
// Spread over the window, so a wide screen has as much as a small one.
const fraction = (i, salt) => (stir(i, salt) % 10_000) / 10_000
export const drawWeather = (w, t) => {
  const v = visibleRect()
  const k = w.intensity
  const dim = w.kind === 'rain' ? 0.2 : w.kind === 'cloudy' ? 0.1 : w.kind === 'snow' ? 0.06 : 0
  if (dim > 0) {
    ctx.fillStyle = `rgba(40, 52, 72, ${dim * k})`
    ctx.fillRect(v.x, v.y, v.w, v.h)
  }
  const pixel = v.w / ctx.canvas.clientWidth
  if (w.kind === 'rain') {
    ctx.strokeStyle = 'rgba(196, 214, 236, 0.5)'
    ctx.lineWidth = pixel
    ctx.beginPath()
    const length = 16 * pixel
    for (let i = 0; i < Math.round(170 * k); i++) {
      const fy = (fraction(i, 8) + (t / 650) * (0.9 + fraction(i, 9) * 0.5)) % 1
      const fx = (fraction(i, 7) - fy * 0.06 + 1) % 1
      const x = v.x + fx * v.w
      const y = v.y + fy * v.h
      ctx.moveTo(x, y)
      ctx.lineTo(x - length * 0.3, y + length)
    }
    ctx.stroke()
    // Drops running along the panes
    ctx.fillStyle = `rgba(227, 240, 250, ${0.75 * k})`
    for (const { x, y } of topWindows()) {
      for (let i = 0; i < 3; i++) ctx.fillRect(x + ((i * 19 + t / 70 + x) % 54), y + 1.5 + (i % 2), 1.4, 1.4)
    }
  } else if (w.kind === 'snow') {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
    for (let i = 0; i < Math.round(220 * k); i++) {
      const speed = 0.6 + fraction(i, 12) * 0.8
      const fy = (fraction(i, 11) + (t / 14_000) * speed) % 1
      const fx = (fraction(i, 10) + Math.sin(t / 1600 + i) * 0.006 + 1) % 1
      ctx.beginPath()
      ctx.arc(v.x + fx * v.w, v.y + fy * v.h, (1.1 + fraction(i, 13) * 1.6) * pixel, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

// In December, lights along both walls of the hall, twinkling in turn.
const XMAS = ['#E5484D', '#F2C14E', '#3EBD6E', '#5BA4F0']
export const christmasLights = t => {
  const hall = roomById('hall')
  if (!hall || !isBuilt(hall)) return
  const r = rectOf(hall)
  for (const y of [r.y + 2.5, r.y + r.h - 2.5]) {
    for (let x = r.x + 8, i = 0; x < r.x + r.w - 6; x += 14, i++) {
      const isLit = (Math.floor(t / 600) + i) % 4 !== 0
      ctx.globalAlpha = isLit ? 1 : 0.35
      circle(x, y, 1.7, XMAS[i % XMAS.length])
    }
  }
  ctx.globalAlpha = 1
}

// The evening: everything darkens, and what gives light glows: the lamps,
// the pendant over the kitchen table, the ceiling lights, every screen in
// use, the street lights and the cars' headlights.
export const evening = (h, screens, headlights = []) => {
  const dark = darknessAt(h)
  if (dark <= 0) return
  const v = visibleRect()
  ctx.fillStyle = `rgba(12, 18, 42, ${dark})`
  ctx.fillRect(v.x, v.y, v.w, v.h)
  const k = dark / NIGHT
  const glow = (x, y, r, colour, alpha) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, `rgba(${colour}, ${alpha * k})`)
    g.addColorStop(1, `rgba(${colour}, 0)`)
    ctx.fillStyle = g
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }
  const rooms = visibleRooms().filter(isBuilt)
  ctx.globalCompositeOperation = 'lighter'
  for (const room of rooms) {
    const { dx, dy } = shiftOf(room)
    for (const [x, y, r, alpha, kind, needs] of typeOf(room).lights ?? []) {
      if (owns(needs) && hasNow(room, [x, y])) glow(x + dx, y + dy, r, kind === 'ceiling' ? '255, 228, 180' : kind === 'neon' ? '255, 95, 162' : '255, 196, 120', alpha)
    }
  }
  for (const [x, y] of screens) glow(x, y, 26, '130, 180, 255', 0.3)
  for (const lamp of GROUNDS.lamps) glow(lamp.x, lamp.y - 4, 60, '255, 214, 150', 0.42)
  for (const [x, y] of headlights) glow(x, y, 34, '255, 240, 200', 0.5)
  ctx.globalCompositeOperation = 'source-over'
  // The bulbs themselves
  for (const room of rooms) {
    const { dx, dy } = shiftOf(room)
    for (const [x, y, needs] of typeOf(room).bulbs ?? []) if (owns(needs) && hasNow(room, [x, y])) circle(x + dx, y + dy, 1.8, '#FFF3C4')
  }
  for (const lamp of GROUNDS.lamps) circle(lamp.x, lamp.y - 26, 2.4, '#FFF3C4')
}
