// ── Light ────────────────────────────────────────────────────────────────
// Sunlight through the windows by day, and by night a dark blue over
// everything with the lamps, the screens and the street lights glowing.
import { owns } from './store.js'
import { circle, ctx } from './gfx.js'
import { GROUNDS, PLAN, hasNow, isBuilt, isOpenDoor, rectOf, roomById, shiftOf, sideWindowsOf, topWindowsOf, typeOf } from './plan.js'
import { visibleRect, visibleRooms } from './camera.js'
import { stir } from './util.js'
import { weatherAt } from './weather.js'
import { PIXEL, snap } from './pixel.js'
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
// A beam is drawn in pixel rows (or columns, for a side window): each a
// little wider as it falls, on the grid, and fainter in three steps.
const BEAM_STEPS = [1, 0.62, 0.3]
const beamStep = t => BEAM_STEPS[Math.min(BEAM_STEPS.length - 1, Math.floor(t * BEAM_STEPS.length))]
export const daylight = h => {
  const strength = 1 - darknessAt(h) / NIGHT
  if (strength <= 0) return
  const warm = h < 10 || h > 15
  const colour = warm ? '255, 196, 110' : '255, 232, 160'
  const slant = (12 - h) * 5
  // Down from a window in the north wall: from x0..x1 at the top to the
  // same shifted by `shift` at the bottom.
  const down = (x0, x1, y, length, shift, widen) => {
    const rows = Math.round(length / PIXEL)
    for (let i = 0; i < rows; i++) {
      const t = i / rows
      const left = snap(x0 - widen * t + shift * t)
      const right = snap(x1 + widen * t + shift * t)
      ctx.fillStyle = `rgba(${colour}, ${0.5 * strength * beamStep(t)})`
      ctx.fillRect(left, snap(y) + i * PIXEL, right - left, PIXEL)
    }
  }
  // Across from a window in a side wall, the same way.
  const across = (x, y0, y1, length, direction, widen) => {
    const columns = Math.round(length / PIXEL)
    for (let i = 0; i < columns; i++) {
      const t = i / columns
      const top = snap(y0 - widen * t)
      const bottom = snap(y1 + widen * t)
      const left = snap(x) + (direction > 0 ? i : -i - 1) * PIXEL
      ctx.fillStyle = `rgba(${colour}, ${0.5 * strength * beamStep(t)})`
      ctx.fillRect(left, top, PIXEL, bottom - top)
    }
  }
  for (const { x, y } of topWindows()) down(x, x + 56, y, 76, slant, 8)
  // The low sun reaches in through one side or the other.
  for (const w of sideWindows()) {
    ctx.globalAlpha = w.isLeft ? (h < 12 ? 1 : 0.35) : h >= 12 ? 1 : 0.35
    const inner = w.isLeft ? w.x + 6 : w.x
    across(inner, w.y, w.y + w.h, 84, w.isLeft ? 1 : -1, 18)
  }
  ctx.globalAlpha = 1
}

// A pool of light as pixel art draws one: in steps, with a checker of
// pixels where one step meets the next, never a smooth fade. Each size and
// colour is drawn once, a pixel to a canvas pixel, and laid down scaled up
// with hard edges.
const BAYER = [0, 0.5, 0.75, 0.25]
const LEVELS = 4
const pools = new Map()
const poolOf = (r, colour) => {
  const key = `${r}|${colour}`
  if (pools.has(key)) return pools.get(key)
  const n = Math.max(2, Math.round((2 * r) / PIXEL))
  const sprite = document.createElement('canvas')
  sprite.width = n
  sprite.height = n
  const g = sprite.getContext('2d')
  const mid = n / 2
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(i + 0.5 - mid, j + 0.5 - mid) / mid
      if (d >= 1) continue
      const level = Math.floor((1 - d) ** 1.4 * LEVELS + BAYER[(j % 2) * 2 + (i % 2)])
      if (level <= 0) continue
      g.fillStyle = `rgba(${colour}, ${Math.min(LEVELS, level) / LEVELS})`
      g.fillRect(i, j, 1, 1)
    }
  }
  pools.set(key, sprite)
  return sprite
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
      const size = Math.round(2 + fraction(i, 13) * 2) * pixel
      ctx.fillRect(v.x + fx * v.w, v.y + fy * v.h, size, size)
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
    const sprite = poolOf(r, colour)
    const size = sprite.width * PIXEL
    ctx.globalAlpha = Math.min(1, alpha * k)
    ctx.drawImage(sprite, snap(x - size / 2), snap(y - size / 2), size, size)
    ctx.globalAlpha = 1
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
