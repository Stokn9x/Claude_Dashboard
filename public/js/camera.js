// ── The camera ───────────────────────────────────────────────────────────
// The canvas fills the whole window; the panels float over it. The camera
// says which point of the world sits in the middle of the free part of the
// window (what the panels leave), and how far in it is zoomed: at zoom 1 the
// office just fits that free part, with grass all round. Drag to move, scroll
// or pinch to zoom, double-click to go back to the whole office.
import { store } from './store.js'
import { canvas } from './gfx.js'
import { GROUNDS, PLAN, WORLD, frameOf, typeOf, isBuilt } from './plan.js'

const ZOOM_MIN = 0.55
const ZOOM_MAX = 5
// Room left round the office at zoom 1, in world units
const MARGIN = 26

const HOME = { x: WORLD.x + WORLD.w / 2, y: WORLD.y + WORLD.h / 2, zoom: 1 }
export const view = { ...HOME }
let glideTo = null

// CSS pixels per world unit at zoom 1, the screen's pixel density, and the
// free part of the window in CSS pixels.
let base = 1
let dpr = 1
let free = { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight }

const scale = (zoom = view.zoom) => base * zoom
const middle = () => ({ x: free.x + free.w / 2, y: free.y + free.h / 2 })

// The world rectangle the window shows, all of it, panels included.
export const visibleRect = () => {
  const k = scale()
  const m = middle()
  return { x: view.x - m.x / k, y: view.y - m.y / k, w: window.innerWidth / k, h: window.innerHeight / k }
}
export const isInView = (x, y, w, h) => {
  const v = visibleRect()
  return x < v.x + v.w && x + w > v.x && y < v.y + v.h && y + h > v.y
}
export const visibleRooms = () =>
  PLAN.rooms.filter(room => {
    const f = frameOf(room)
    return isInView(f.x, f.y, f.w, f.h)
  })

// The view kept within its zoom range and over the grounds: the middle of
// the screen never leaves them.
const clampView = v => {
  v.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.zoom))
  const s = GROUNDS.scene
  const k = scale(v.zoom)
  const halfW = free.w / 2 / k
  const halfH = free.h / 2 / k
  v.x = s.w > 2 * halfW ? Math.min(s.x + s.w - halfW, Math.max(s.x + halfW, v.x)) : s.x + s.w / 2
  v.y = s.h > 2 * halfH ? Math.min(s.y + s.h - halfH, Math.max(s.y + halfH, v.y)) : s.y + s.h / 2
  return v
}

// Glide on from where the camera is going, so presses in a row add up.
export const glide = target => {
  glideTo = clampView({ ...(glideTo ?? view), ...target })
}
export const goHome = () => glide(HOME)
export const isHome = () => !glideTo && Math.abs(view.zoom - 1) < 0.01 && Math.hypot(view.x - HOME.x, view.y - HOME.y) < 4
// One step of a glide, every frame: a little closer each time.
export const stepGlide = () => {
  if (!glideTo) return
  const k = 0.18
  view.x += (glideTo.x - view.x) * k
  view.y += (glideTo.y - view.y) * k
  view.zoom += (glideTo.zoom - view.zoom) * k
  if (Math.abs(glideTo.x - view.x) < 0.2 && Math.abs(glideTo.y - view.y) < 0.2 && Math.abs(glideTo.zoom - view.zoom) < 0.002) {
    Object.assign(view, glideTo)
    glideTo = null
  }
}

// World units to canvas pixels, for a 2D context.
export const applyView = g => {
  const k = scale() * dpr
  const m = middle()
  g.setTransform(k, 0, 0, k, m.x * dpr - view.x * k, m.y * dpr - view.y * k)
}
// A point in the world, in CSS pixels from the window's top-left corner.
export const toScreen = (x, y) => {
  const k = scale()
  const m = middle()
  return { x: m.x + (x - view.x) * k, y: m.y + (y - view.y) * k }
}
export const worldAt = e => {
  const k = scale()
  const m = middle()
  return { x: view.x + (e.clientX - m.x) / k, y: view.y + (e.clientY - m.y) / k }
}
export const pixelsPerUnit = () => scale()
export const freeArea = () => free

// The figure, or the sign, under the pointer.
export const hitAt = e => {
  const { x, y } = worldAt(e)
  for (let i = store.hits.length - 1; i >= 0; i--) {
    const h = store.hits[i]
    if (x >= h.x0 && x <= h.x1 && y >= h.y0 && y <= h.y1) return h
  }
  return null
}

// The free part of the window: what the header above and the panel beside
// (or, on a phone, under) the office leave.
const measureFree = () => {
  const width = window.innerWidth
  const height = window.innerHeight
  const header = document.querySelector('header')?.getBoundingClientRect()
  // A fixed element has no offsetParent: its box says whether it shows.
  const side = document.getElementById('side')?.getBoundingClientRect()
  const box = side && side.width > 0 ? side : null
  const top = header ? header.bottom + 4 : 0
  if (!box) return { x: 0, y: top, w: width, h: height - top }
  // A panel along the bottom (narrow windows) takes height; one along the
  // left takes width. On a narrow screen the banner for someone waiting
  // for you spans the width too, so the office starts under it.
  if (box.width > width * 0.7) {
    const alert = document.getElementById('alert')?.getBoundingClientRect()
    const under = alert && alert.height > 0 ? Math.max(top, alert.bottom + 4) : top
    return { x: 0, y: under, w: width, h: Math.max(120, box.top - under - 4) }
  }
  return { x: box.right + 4, y: top, w: Math.max(120, width - box.right - 4), h: height - top }
}

const resizers = []
export const onResize = fn => resizers.push(fn)

// The canvas as large as the window and sharp at the screen's density; the
// office as large as the free part allows at zoom 1.
export const fit = () => {
  dpr = window.devicePixelRatio || 1
  free = measureFree()
  base = Math.max(0.2, Math.min(free.w / (WORLD.w + 2 * MARGIN), free.h / (WORLD.h + 2 * MARGIN)))
  const width = Math.round(window.innerWidth * dpr)
  const height = Math.round(window.innerHeight * dpr)
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }
  clampView(view)
  if (glideTo) clampView(glideTo)
  for (const fn of resizers) fn()
}

// ── Moving it ────────────────────────────────────────────────────────────
const zoomAt = (e, zoom) => {
  const p = worldAt(e)
  const m = middle()
  const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom))
  glideTo = null
  Object.assign(view, clampView({ x: p.x - (e.clientX - m.x) / scale(z), y: p.y - (e.clientY - m.y) / scale(z), zoom: z }))
}

// Pointers down on the picture: one drags, two pinch. A click that moved
// the picture is no click; `wasDrag()` tells the click handler so.
const pointers = new Map()
let drag = null
let pinch = null
let hasDragged = false
export const wasDrag = () => {
  const was = hasDragged
  hasDragged = false
  return was
}

canvas.addEventListener(
  'wheel',
  e => {
    e.preventDefault()
    zoomAt(e, view.zoom * Math.exp(-e.deltaY * 0.0015))
  },
  { passive: false },
)
canvas.addEventListener('pointerdown', e => {
  pointers.set(e.pointerId, e)
  canvas.setPointerCapture(e.pointerId)
  hasDragged = false
  if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY, view: { ...view } }
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()]
    pinch = { distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), zoom: view.zoom }
    drag = null
  }
})
canvas.addEventListener('pointermove', e => {
  if (!pointers.has(e.pointerId)) {
    canvas.style.cursor = hitAt(e) ? 'pointer' : 'grab'
    return
  }
  pointers.set(e.pointerId, e)
  if (pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()]
    const centre = { clientX: (a.clientX + b.clientX) / 2, clientY: (a.clientY + b.clientY) / 2 }
    zoomAt(centre, (pinch.zoom * Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)) / pinch.distance)
    hasDragged = true
    return
  }
  if (!drag) return
  const dx = e.clientX - drag.x
  const dy = e.clientY - drag.y
  if (!hasDragged && Math.hypot(dx, dy) < 4) return
  hasDragged = true
  canvas.style.cursor = 'grabbing'
  glideTo = null
  Object.assign(view, clampView({ x: drag.view.x - dx / scale(), y: drag.view.y - dy / scale(), zoom: view.zoom }))
})
const release = e => {
  pointers.delete(e.pointerId)
  if (pointers.size < 2) pinch = null
  if (pointers.size === 0) drag = null
}
canvas.addEventListener('pointerup', release)
canvas.addEventListener('pointercancel', release)
canvas.addEventListener('dblclick', goHome)

// The keyboard: arrows or WASD move, + and - zoom, 0 or Home shows the whole
// office. Not while typing, and not inside the panel or the card, whose
// lists the arrows scroll.
const PAN_PX = 90
document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('input, textarea, select, #side, .card')) return
  const to = glideTo ?? view
  const step = PAN_PX / scale(to.zoom)
  const moves = {
    ArrowLeft: { x: to.x - step }, a: { x: to.x - step },
    ArrowRight: { x: to.x + step }, d: { x: to.x + step },
    ArrowUp: { y: to.y - step }, w: { y: to.y - step },
    ArrowDown: { y: to.y + step }, s: { y: to.y + step },
    '+': { zoom: to.zoom * 1.25 }, '=': { zoom: to.zoom * 1.25 },
    '-': { zoom: to.zoom / 1.25 },
  }
  if (e.key === '0' || e.key === 'Home') goHome()
  else if (moves[e.key]) glide(moves[e.key])
  else return
  e.preventDefault()
})

// ── The minimap and "Vis hele" ───────────────────────────────────────────
// Once the view has moved from the whole office, a small map in the corner
// shows where it is and takes you anywhere with a click.
const minimap = document.getElementById('minimap')
const fitAllButton = document.getElementById('fit-all')
const mini = minimap.getContext('2d')
// The map shows the office and a little of the grounds round it.
const MAP = { x: WORLD.x - 60, y: WORLD.y - 50, w: WORLD.w + 120, h: WORLD.h + 100 }
const MAP_COLOURS = { corner: '#DCC194', kitchen: '#F3F5F6', team: '#CBD9C7', quiet: '#D6DCE6', toilet: '#E3EEF2', meeting: '#B48A64' }

export const drawMinimap = () => {
  const isAway = !isHome()
  minimap.hidden = !isAway
  fitAllButton.hidden = !isAway
  if (!isAway) return
  const width = Math.round(Math.min(150, free.w * 0.22))
  const height = Math.round((width * MAP.h) / MAP.w)
  if (minimap.width !== Math.round(width * dpr)) {
    minimap.width = Math.round(width * dpr)
    minimap.height = Math.round(height * dpr)
    minimap.style.width = `${width}px`
    minimap.style.height = `${height}px`
  }
  const k = (width * dpr) / MAP.w
  mini.setTransform(k, 0, 0, k, -MAP.x * k, -MAP.y * k)
  mini.fillStyle = '#6E9E5A'
  mini.fillRect(MAP.x, MAP.y, MAP.w, MAP.h)
  mini.fillStyle = '#3E4852'
  mini.fillRect(WORLD.x, WORLD.y, WORLD.w, WORLD.h)
  for (const room of PLAN.rooms) {
    mini.fillStyle = isBuilt(room) ? (MAP_COLOURS[room.type] ?? '#C9CED3') : '#A9C08A'
    mini.fillRect(room.x, room.y, typeOf(room).w, typeOf(room).h)
  }
  // What the free part of the window shows
  const kv = scale()
  mini.lineWidth = 3 / k
  mini.strokeStyle = '#2F86D6'
  mini.strokeRect(view.x - free.w / 2 / kv, view.y - free.h / 2 / kv, free.w / kv, free.h / kv)
}

fitAllButton.addEventListener('click', goHome)
minimap.addEventListener('click', e => {
  const box = minimap.getBoundingClientRect()
  glide({ x: MAP.x + ((e.clientX - box.left) / box.width) * MAP.w, y: MAP.y + ((e.clientY - box.top) / box.height) * MAP.h })
})
