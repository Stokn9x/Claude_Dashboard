// The canvas and the small drawing words everything else is made of. All of
// them draw in world units on the main canvas, through the camera.
import { clip } from './util.js'
import { modText } from './i18n.js'

export const canvas = document.getElementById('office')
export const ctx = canvas.getContext('2d')

export const OUTLINE = '#2B2230'
export const FONT = "'Segoe UI', system-ui, -apple-system, sans-serif"
export const stateColor = { working: '#8A94A0', reading: '#2BA39A', editing: '#3B8FE0', running: '#D9932B', browsing: '#7B6BDE', waiting: '#E5484D', idle: '#8A94A0' }

export const rect = (x, y, w, h, fill) => {
  ctx.fillStyle = fill
  ctx.fillRect(x, y, w, h)
}
export const circle = (x, y, r, fill, stroke) => {
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
export const rounded = (x, y, w, h, r, fill, stroke, lineWidth = 1.5) => {
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
export const dashed = (x, y, w, h, r, fill, stroke) => {
  ctx.setLineDash([3, 3])
  rounded(x, y, w, h, r, fill, stroke, 1.2)
  ctx.setLineDash([])
}
export const label = (text, x, y, size, color, weight = 700, align = 'center') => {
  ctx.font = `${weight} ${size}px ${FONT}`
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(text, x, y)
}
export const faint = (alpha, paint) => {
  ctx.globalAlpha = alpha
  paint()
  ctx.globalAlpha = 1
}

// A soft shadow on the floor, under whoever or whatever stands there.
export const shadow = (x, y, rx, ry, alpha = 0.2) => {
  ctx.globalAlpha = alpha
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
  ctx.fillStyle = '#000000'
  ctx.fill()
  ctx.globalAlpha = 1
}

// ── Words that can be read ───────────────────────────────────────────────
// Names, bubbles and signs are drawn in world units, so they shrink with the
// camera. Down to the whole office in view they stay at least a few screen
// pixels high; further out they shrink with it, so they never bury the
// house. The scene tells us how many pixels a world unit is, each frame, and
// how many it is with the whole office in view.
const PPU_FLOOR = 0.75
let unitsPerPixel = 1
export const setPixelsPerUnit = (ppu, homePpu) => {
  unitsPerPixel = 1 / Math.max(ppu, homePpu, PPU_FLOOR)
}
// The size, in world units, of text meant to be `size` units high and never
// less than `min` pixels on the screen.
export const readable = (size, min) => Math.max(size, min * unitsPerPixel)
// Draws `paint` around (x, y), scaled up just enough for its text of `size`
// units to show at least `min` pixels high.
export const legibly = (x, y, size, min, paint) => {
  const k = readable(size, min) / size
  if (k === 1) return paint(x, y)
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(k, k)
  paint(0, 0)
  ctx.restore()
}

// A name or a price on a small rounded plate.
export const tag = (cx, y, text, colour) =>
  legibly(cx, y, 7.5, 11, (cx, y) => {
    ctx.font = `700 7.5px ${FONT}`
    const w = Math.round(ctx.measureText(text).width + 10)
    ctx.globalAlpha = 0.9
    rounded(cx - w / 2, y, w, 11, 5.5, colour)
    ctx.globalAlpha = 1
    label(text, cx, y + 8, 7.5, '#FFFFFF')
  })

// A speech bubble whose tail points down at (cx, bottom).
export const bubble = (cx, bottom, text, isAlert, t, max = 30) => legibly(cx, bottom, 8.5, 12, (cx, bottom) => {
  const words = clip(text, max)
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
})

// Thinking, with nothing to say yet: a cloud with three dots that bob in
// turn, and two small puffs trailing down to the head.
const thought = (cx, bottom, t) => {
  const y = bottom - 15
  const puff = (x, py, r) => circle(x, py, r, '#FFFFFF', OUTLINE)
  puff(cx + 1, bottom + 1, 1.6)
  puff(cx + 4, bottom - 3, 2.4)
  for (const [dx, dy, r] of [[-9, 7, 6], [9, 7, 6], [-4, 3, 7], [5, 3, 7], [0, 8, 6.5]]) puff(cx + dx, y + dy, r)
  // The outlines inside the cloud, painted over
  for (const [dx, dy, r] of [[-9, 7, 5.2], [9, 7, 5.2], [-4, 3, 6.2], [5, 3, 6.2], [0, 8, 5.7]]) circle(cx + dx, y + dy, r, '#FFFFFF')
  for (let i = 0; i < 3; i++) {
    const lift = Math.max(0, Math.sin(t / 170 - i * 0.9)) * 1.6
    circle(cx - 5 + i * 5, y + 7 - lift, 1.3, '#5B6672')
  }
}

// What someone says: a thought cloud while they are only thinking, the
// words otherwise, red while they wait for you.
// `who`, when given, leads the words: at the desks, where the row behind
// covers the name plates.
export const say = (cx, bottom, activity, t, who = null) => {
  if (activity.detail === modText('Tænker') && activity.state !== 'waiting') legibly(cx, bottom, 8.5, 12, (cx, bottom) => thought(cx, bottom, t))
  else bubble(cx, bottom, who ? `${who} · ${activity.detail}` : activity.detail, activity.state === 'waiting', t, who ? 30 + who.length + 3 : 30)
}
