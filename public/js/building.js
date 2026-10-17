// ── The building, drawn once for each light and view ─────────────────────
// The grounds, walls, floors and furniture: everything that does not move,
// drawn on a canvas of its own and again only when the light, the view or
// what is owned changes. Rooms out of view are skipped, so a large office
// costs no more than what is on screen.
import { store } from './store.js'
import { FONT, OUTLINE, canvas, readable } from './gfx.js'
import { clip } from './util.js'
import { MAIN, PLAN, ROOM_NAMES, WORLD, at, topWallOf, doormat, frameOf, isBuilt, isOpenDoor, lotOf, nextStepOf, rectOf, roomById, shiftOf, topWindowsOf, typeOf } from './plan.js'
import { applyView, onResize, visibleRect, visibleRooms, view } from './camera.js'
import { isNightAt, sideWindows, skyAt } from './light.js'
import { drawGrounds } from './outdoors.js'
import { L } from './i18n.js'
import { plant, roomDrawers } from './rooms.js'

const WALL = '#3E4852'
const WALL_TOP = '#5A6672'
export const background = document.createElement('canvas')
let backgroundKey = ''

onResize(() => {
  background.width = canvas.width
  background.height = canvas.height
  backgroundKey = ''
})

// A plot not yet bought: levelled earth with a few tufts, pegged out with
// stakes and a rope round it. Its sign, with the price, is drawn on top each
// frame.
const drawLot = (g, fill, { x, y, w, h }, snow = 0) => {
  fill(x, y, w, h, '#8FA572')
  fill(x + 6, y + 6, w - 12, h - 12, '#A3B184')
  for (let i = 0; i < 18; i++) fill(x + ((i * 53) % (w - 16)) + 8, y + ((i * 37) % (h - 16)) + 8, 6, 3, i % 3 ? '#93A775' : '#B9A27A')
  // Under the snow like the rest of the grounds
  if (snow > 0) {
    g.globalAlpha = 0.85 * snow
    fill(x, y, w, h, '#EEF3F7')
    g.globalAlpha = 1
  }
  // The rope, and a stake every forty units or so along it
  g.strokeStyle = '#E8DCC0'
  g.lineWidth = 1
  g.strokeRect(x + 5.5, y + 5.5, w - 11, h - 11)
  const stake = (px, py) => {
    fill(px - 2, py - 2, 4, 4, '#5E4330')
    fill(px - 1, py - 1, 2, 2, '#8B5E3C')
  }
  for (const [ax, bx] of [[x + 6, x + w - 6]]) {
    const n = Math.max(1, Math.round((bx - ax) / 40))
    for (let i = 0; i <= n; i++) {
      stake(ax + ((bx - ax) * i) / n, y + 6)
      stake(ax + ((bx - ax) * i) / n, y + h - 6)
    }
  }
  const n = Math.max(1, Math.round((h - 12) / 40))
  for (let i = 1; i < n; i++) {
    stake(x + 6, y + 6 + ((h - 12) * i) / n)
    stake(x + w - 6, y + 6 + ((h - 12) * i) / n)
  }
}

// A room's sign on the hall wall, beside its door, on the side with more
// wall to spare: the icon and the name, white on slate, readable at any zoom.
const doorSign = (g, door, room) => {
  const [icon, name] = ROOM_NAMES[room.id] ?? []
  if (!name) return
  const size = readable(8, 11)
  g.font = `700 ${size}px ${FONT}`
  const textW = g.measureText(name).width
  const pad = size * 0.6
  const iconW = size * 1.35
  const w = pad + iconW + textW + pad
  const h = size * 1.65
  const r = rectOf(room)
  const isRight = r.x + r.w - (door.x + door.w) >= door.x - r.x
  const x = isRight ? door.x + door.w + 4 : door.x - 4 - w
  const y = door.y + door.h / 2 - h / 2
  g.globalAlpha = 0.3
  g.fillStyle = '#000000'
  g.beginPath()
  g.roundRect(x + 1, y + 1.5, w, h, h / 3)
  g.fill()
  g.globalAlpha = 1
  g.fillStyle = '#1C232C'
  g.strokeStyle = '#5A6672'
  g.lineWidth = Math.max(0.8, size * 0.08)
  g.beginPath()
  g.roundRect(x, y, w, h, h / 3)
  g.fill()
  g.stroke()
  g.textBaseline = 'middle'
  g.textAlign = 'left'
  g.font = `${size * 0.95}px ${FONT}`
  g.fillText(icon, x + pad, y + h / 2 + size * 0.05)
  g.font = `700 ${size}px ${FONT}`
  g.fillStyle = '#E9EEF2'
  g.fillText(name, x + pad + iconW, y + h / 2 + size * 0.05)
  g.textBaseline = 'alphabetic'
}

// The next step of a room that grows out on the grounds, as a lot. A step
// inside the house has its depot instead.
const nextLot = room => {
  const step = nextStepOf(room)
  if (!step || typeof step.buy !== 'string' || !isBuilt(room)) return null
  const lot = lotOf(room, step)
  const isDepot = PLAN.rooms.some(r => r.until === step.buy && isBuilt(r))
  return isDepot ? null : lot
}

// A small Christmas tree with a star, in December, in a corner of the
// reception.
const XMAS_TREE = { x: 200, y: 336 }
const christmasTree = (g, fill, dot, { x, y }) => {
  fill(x - 6, y + 12, 12, 7, '#B5683E')
  fill(x - 1.5, y + 8, 3, 5, '#6E4B32')
  for (const [w, top] of [[13, -2], [10, -9], [7, -15]]) {
    g.beginPath()
    g.moveTo(x, top + y - 6)
    g.lineTo(x + w, top + y + 9)
    g.lineTo(x - w, top + y + 9)
    g.closePath()
    g.fillStyle = '#2F7A4A'
    g.fill()
    g.lineWidth = 1
    g.strokeStyle = OUTLINE
    g.stroke()
  }
  for (const [dx, dy, c] of [[-6, 4, '#E5484D'], [5, 1, '#F2C14E'], [-2, -4, '#5BA4F0'], [3, -9, '#E5484D'], [-8, 9, '#F2C14E'], [8, 8, '#5BA4F0']]) dot(x + dx, y + dy, 1.5, c)
  dot(x, y - 22, 2.4, '#F2C14E', '#AD7F26')
}

// `look` is the weather and the season (weather.js): the trees' colours,
// snow on the ground and the walls, and Christmas.
export const drawBuilding = (project, hour, look = {}) => {
  const isNight = isNightAt(hour)
  const owned = (store.state.game?.owned?.rooms ?? ['*']).join(',')
  const snow = Math.round((look.snowCover ?? 0) * 5) / 5
  const key = `${project}|${skyAt(hour)}|${background.width}x${background.height}|${view.x.toFixed(2)},${view.y.toFixed(2)},${view.zoom.toFixed(4)}|${owned}|${look.season}|${snow}|${look.isChristmas}`
  if (key === backgroundKey) return
  backgroundKey = key
  const g = background.getContext('2d')
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.clearRect(0, 0, background.width, background.height)
  applyView(g)
  g.imageSmoothingEnabled = false
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
  const sky = skyAt(hour)
  const rooms = visibleRooms()

  // The grounds, then each room's walls, with a soft shadow on the grass
  drawGrounds(g, visibleRect(), { season: look.season, snow })
  g.globalAlpha = isNight ? 0.12 : 0.18
  for (const room of rooms.filter(isBuilt)) {
    const f = frameOf(room)
    fill(f.x + 5, f.y + 6, f.w, f.h, '#000000')
  }
  g.globalAlpha = 1
  for (const room of rooms) {
    if (!isBuilt(room)) continue
    const f = frameOf(room)
    fill(f.x, f.y, f.w, f.h, WALL)
    if (topWallOf(room) > 6) {
      fill(f.x, f.y, f.w, 6, snow > 0.4 ? '#E6ECF0' : WALL_TOP)
      for (const wx of topWindowsOf(room)) {
        fill(wx, f.y + 1, 56, 5, sky)
        fill(wx + 27, f.y + 1, 2, 5, WALL_TOP)
      }
    }
  }
  // Floors and furniture, each room in its own place, clipped to the steps
  // it has; a room not yet bought is an empty lot with a fence, and so is
  // the next step of one that grows out on the grounds.
  for (const room of rooms) {
    if (!isBuilt(room)) {
      if (!room.until) drawLot(g, fill, rectOf(room), snow)
      continue
    }
    const lot = nextLot(room)
    if (lot) drawLot(g, fill, lot, snow)
    const { dx, dy } = shiftOf(room)
    const t = typeOf(room)
    const r = rectOf(room)
    g.save()
    // Nothing a room draws spills into its walls
    g.beginPath()
    g.rect(r.x, r.y, r.w, r.h)
    g.clip()
    g.translate(dx, dy)
    roomDrawers[room.type]?.(g, fill, dot, { ...r, x: r.x - dx, y: r.y - dy })
    for (const [x, y, isBig] of t.plants ?? []) plant(fill, dot, x, y, isBig)
    g.restore()
  }
  // Doors, a depot's closed door, the front door's mat, and windows in the side walls
  for (const d of PLAN.doors) {
    if (isOpenDoor(d)) fill(d.x, d.y, d.w, d.h, d.colour)
    else if (d.closed && isBuilt(roomById(d.closed))) {
      fill(d.x + 3, d.y + 1, d.w - 6, d.h - 2, '#6E5A44')
      fill(d.x + d.w - 8, d.y + d.h / 2 - 1, 2, 2, '#D6A23C')
    }
  }
  // Christmas in the reception
  const reception = roomById('reception')
  if (look.isChristmas && reception && isBuilt(reception)) christmasTree(g, fill, dot, at(reception, XMAS_TREE))
  // Every built room's sign on the hall, beside its door
  for (const d of PLAN.doors) {
    const id = (d.between ?? []).find(x => x !== 'hall')
    if (isOpenDoor(d) && id && (d.between ?? []).includes('hall')) doorSign(g, d, roomById(id))
  }
  fill(...doormat(), '#6E5A44')
  for (const w of sideWindows()) {
    fill(w.x, w.y, 6, w.h, sky)
    fill(w.x + 1, w.y + w.h / 2 - 1, 4, 2, WALL_TOP)
  }
  // The name plate over Claude's office, in the middle of the house
  g.fillStyle = '#20262E'
  g.beginPath()
  g.roundRect(MAIN.cx - 60, WORLD.y + 3, 120, 11, 2)
  g.fill()
  g.font = `700 8px ${FONT}`
  g.fillStyle = '#E9EEF2'
  g.textAlign = 'center'
  g.fillText(clip(project || L('Kontoret', 'The office'), 26), MAIN.cx, WORLD.y + 11.5)
}
