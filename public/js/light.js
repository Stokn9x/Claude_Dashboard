// ── Light ────────────────────────────────────────────────────────────────
// Sunlight through the windows by day, and by night a dark blue over
// everything with the lamps, the screens and the street lights glowing.
import { owns } from './store.js'
import { circle, ctx } from './gfx.js'
import { GROUNDS, PLAN, hasNow, isBuilt, isOpenDoor, shiftOf, sideWindowsOf, topWindowsOf, typeOf } from './plan.js'
import { visibleRect, visibleRooms } from './camera.js'

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
