// ── The building, drawn once for each light and view ─────────────────────
// The grounds, walls, floors and furniture: everything that does not move,
// drawn on a canvas of its own and again only when the light, the view or
// what is owned changes. Rooms out of view are skipped, so a large office
// costs no more than what is on screen.
import { store, owns } from './store.js'
import { OUTLINE, FONT, canvas } from './gfx.js'
import { clip } from './util.js'
import { PLAN, ROOM_TYPES, WORLD, frameOf, isBuilt, isOpenDoor, shiftOf, typeOf } from './plan.js'
import { applyView, onResize, visibleRect, visibleRooms, view } from './camera.js'
import { isNightAt, sideWindows, skyAt } from './light.js'
import { drawGrounds } from './outdoors.js'

const WALL = '#3E4852'
const WALL_TOP = '#5A6672'
export const background = document.createElement('canvas')
let backgroundKey = ''

onResize(() => {
  background.width = canvas.width
  background.height = canvas.height
  backgroundKey = ''
})

// A framed painting on a wall: sky, hills and a sun, in three colours.
const painting = (g, fill, x, y, w, h, [land, sky, sun]) => {
  fill(x - 1, y - 1, w + 2, h + 2, '#6E4B32')
  fill(x, y, w, h, sky)
  fill(x, y + h * 0.55, w, h * 0.45, land)
  g.fillStyle = sun
  g.beginPath()
  g.arc(x + w * 0.72, y + h * 0.35, h * 0.18, 0, Math.PI * 2)
  g.fill()
}

// A big potted plant, for the decor
const bigPlant = (g, fill, x, y) => {
  fill(x - 6, y, 12, 9, '#9C5A34')
  for (const [dx, dy, r, c] of [[0, -4, 10, '#3E8A55'], [-5, -7, 6, '#56A86B'], [5, -9, 5, '#6CC082'], [-2, -12, 4, '#6CC082']]) {
    g.fillStyle = c
    g.beginPath()
    g.arc(x + dx, y + dy, r, 0, Math.PI * 2)
    g.fill()
  }
}

// A small potted plant, as every room has a few
const plant = (fill, dot, x, y, isBig) => {
  const r = isBig ? 9 : 7
  fill(x - 5, y, 10, 8, '#B5683E')
  dot(x, y - 2, r, '#3E8A55', OUTLINE)
  dot(x - r / 2, y - 4, r / 2, '#56A86B')
  dot(x + r / 3, y - r, r / 3, '#6CC082')
}

// A rounded rectangle, filled
const slab = (g, x, y, w, h, r, colour) => {
  g.fillStyle = colour
  g.beginPath()
  g.roundRect(x, y, w, h, r)
  g.fill()
}

// A rug under each desk, each its own colour
const rugs = (g, desks, colours, w, h) =>
  desks.forEach(({ cx, dy }, i) => {
    const [base, edge] = colours[i % colours.length]
    slab(g, cx - w / 2, dy - 26, w, h, 6, edge)
    slab(g, cx - w / 2 + 3, dy - 23, w - 6, h - 6, 4, base)
  })

// Each room type's own floor and furniture, in its home coordinates.
const roomDrawers = {
  corner: (g, fill, dot) => {
    // Oak planks
    fill(6, 16, 240, 116, '#DCC194')
    for (let i = 0; i < 11; i++) {
      fill(6, 18 + i * 10, 240, 1, '#C9AC7E')
      fill(20 + ((i * 47) % 210), 18 + i * 10, 1, 10, '#C9AC7E')
    }
    // The rug under Claude's desk
    g.globalAlpha = 0.35
    fill(52, 40, 152, 86, OUTLINE)
    g.globalAlpha = 1
    fill(54, 42, 148, 82, '#6F9C8E')
    g.strokeStyle = '#9CC2B5'
    g.lineWidth = 2
    g.strokeRect(58, 46, 140, 74)
    const books = ['#D45D7A', '#3E7CC9', '#D6A23C', '#2E9E8F', '#8A6FD6']
    for (const k of [0, 1]) {
      fill(10, 22 + k * 44, 12, 40, OUTLINE)
      fill(11, 23 + k * 44, 10, 38, '#8B5E3C')
      books.forEach((_, i) => fill(12, 25 + k * 44 + i * 7, 8, 5, books[(i + k) % 5]))
    }
    // A reading corner by the shelves: an armchair and a side table with a
    // lamp, out of the way to the door
    fill(28, 22, 28, 24, OUTLINE)
    fill(29, 23, 26, 6, '#A9512E')
    fill(29, 23, 5, 22, '#B85A33')
    fill(50, 23, 5, 22, '#B85A33')
    fill(34, 29, 16, 15, '#D9744A')
    fill(36, 31, 12, 3, '#E99A73')
    dot(70, 31, 7, OUTLINE)
    dot(70, 31, 5.8, '#B98F5E')
    dot(70, 31, 3.2, '#F6E3A8', '#C9A55A')
    if (owns('art')) painting(g, fill, 140, 18, 34, 14, ['#3E7CC9', '#8A6FD6', '#F6F7F8'])
    // The whiteboard; board() writes the day's numbers on it
    const b = ROOM_TYPES.corner.board
    fill(b.x - 1, b.y - 1, b.w + 2, b.h + 2, OUTLINE)
    fill(b.x, b.y, b.w, b.h, '#F6F7F8')
    fill(b.x + 2, b.y + b.h - 1, b.w - 4, 2, '#B9C3CC')
    fill(b.x + 6, b.y + b.h - 1.5, 5, 1.5, '#E5484D')
    fill(b.x + 13, b.y + b.h - 1.5, 5, 1.5, '#3E7CC9')
  },

  kitchen: (g, fill, dot) => {
    // Tiles
    fill(252, 16, 222, 116, '#F3F5F6')
    for (let c = 0; c < 19; c++) for (let r = 0; r < 10; r++) if ((c + r) % 2 === 0) fill(252 + c * 12, 16 + r * 12, 12, 12, '#E4E8EB')
    // The counter, with the coffee machine, sink and stove
    fill(256, 18, 150, 16, OUTLINE)
    fill(257, 19, 148, 14, '#F7F7F5')
    fill(257, 31, 148, 2, '#C9CED3')
    if (owns('espresso')) {
      // A chrome espresso machine with two cups
      fill(262, 19, 22, 13, OUTLINE)
      fill(263, 20, 20, 11, '#C9CED3')
      fill(265, 21, 16, 3, '#E9EEF2')
      fill(266, 26, 3, 3, '#2B2F36')
      fill(277, 26, 3, 3, '#2B2F36')
      dot(286, 28, 2, '#FFFFFF', OUTLINE)
      dot(291, 28, 2, '#FFFFFF', OUTLINE)
    } else {
      fill(266, 20, 14, 12, '#2B2F36')
      dot(273, 26, 2, '#E07A4F')
    }
    fill(300, 21, 22, 9, '#B9C3CC')
    fill(330, 21, 20, 10, '#9CB4C6')
    fill(336, 23, 8, 5, '#D7E9FA')
    dot(386, 26, 4, '#E9EEF2', OUTLINE)
    for (const x of [280, 312, 344, 376]) {
      dot(x, 44, 5, OUTLINE)
      dot(x, 44, 3.8, '#C9A273')
    }
    // The fridge
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
  },

  team: (g, fill, dot) => {
    // Sage carpet
    fill(6, 138, 468, 240, '#CBD9C7')
    for (let c = 0; c < 20; c++) fill(6 + c * 24, 138, 1, 240, '#BCCBB8')
    for (let r = 0; r < 10; r++) fill(6, 138 + r * 24, 468, 1, '#BCCBB8')
    rugs(g, ROOM_TYPES.team.desks, [['#BCD0C4', '#AFC4B7'], ['#CFC6DC', '#C2B8D1'], ['#DDCDB7', '#D1BFA6'], ['#BFD0DD', '#B0C3D2'], ['#DCC7CB', '#D0B7BC'], ['#CBD5B5', '#BDC9A5']], 104, 64)
    // A bookshelf along the left wall
    fill(8, 178, 14, 76, OUTLINE)
    fill(9, 179, 12, 74, '#8B5E3C')
    ;['#D45D7A', '#3E7CC9', '#D6A23C', '#2E9E8F', '#8A6FD6', '#E07A4F', '#56A86B', '#D45D7A', '#3E7CC9', '#D6A23C'].forEach((c, i) => fill(10, 181 + i * 7, 10, 5, c))
    // The printer
    fill(14, 356, 30, 18, OUTLINE)
    fill(15, 357, 28, 16, '#D3D8DD')
    fill(19, 360, 20, 3, '#2B2F36')
    fill(21, 365, 16, 6, '#F6F7F8')
    // The lounge corner: a rug, a sofa against the wall, a coffee table, a lamp
    if (owns('lounge')) {
      slab(g, 138, 346, 84, 31, 4, '#E6D3B3')
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
    }
    // A ping-pong table, net across the middle
    if (owns('pingpong')) {
      fill(290, 350, 52, 26, OUTLINE)
      fill(291, 351, 50, 24, '#2E8B6E')
      fill(291, 362.5, 50, 1, '#FFFFFF')
      fill(315.5, 351, 1, 24, '#E9EEF2')
      fill(315, 349, 2, 28, '#2B2F36')
      dot(300, 356, 1.6, '#FFFFFF')
      dot(286, 358, 3, '#E5484D', OUTLINE)
      dot(346, 368, 3, '#3E7CC9', OUTLINE)
    }
    // Art on the top wall, and a neon sign between the paintings
    if (owns('art')) {
      painting(g, fill, 52, 141, 30, 14, ['#7FB069', '#A9D8F5', '#F6E3A8'])
      painting(g, fill, 398, 141, 30, 14, ['#D45D7A', '#E07A4F', '#F6D77A'])
    }
    if (owns('neon')) {
      slab(g, 210, 140, 60, 13, 3, '#2B1F33')
      g.font = `800 8px ${FONT}`
      g.textAlign = 'center'
      g.shadowColor = '#FF5FA2'
      g.shadowBlur = 6
      g.fillStyle = '#FF8CC2'
      g.fillText('SHIP IT', 240, 150)
      g.shadowBlur = 0
    }
    if (owns('plants')) for (const [x, y] of [[112, 156], [368, 156]]) bigPlant(g, fill, x, y)
    // The water cooler
    fill(452, 334, 16, 24, OUTLINE)
    fill(453, 335, 14, 10, '#9CC4EC')
    fill(453, 346, 14, 11, '#E9EEF2')
  },

  toilet: (g, fill, dot) => {
    // Small pale tiles
    fill(6, 514, 114, 90, '#E3EEF2')
    for (let c = 0; c < 15; c++) for (let r = 0; r < 12; r++) if ((c + r) % 2 === 0) fill(6 + c * 8, 514 + r * 8, 8, 8, '#D4E3E9')
    // Two stalls along the bottom wall, their doors facing the room
    for (const x of [8, 60]) {
      fill(x, 566, 52, 38, OUTLINE)
      fill(x + 1, 567, 50, 37, '#F4F7F8')
      dot(x + 26, 590, 7, OUTLINE)
      dot(x + 26, 590, 5.8, '#FFFFFF')
      dot(x + 26, 589, 3.2, '#CFE3EC')
      fill(x + 19, 598, 14, 5, '#E9EEF2')
      fill(x + 9, 566, 34, 3, '#7FA7C2')
      dot(x + 40, 571, 1.3, '#5B6672')
    }
    // A sink and a mirror on the top wall, right of the door
    fill(70, 516, 46, 16, OUTLINE)
    fill(71, 517, 44, 14, '#F4F7F8')
    dot(93, 524, 5, '#CFE3EC', '#9CB4C6')
    fill(76, 516, 34, 2, '#9CC4EC')
  },

  meeting: (g, fill, dot) => {
    // Dark wooden floor
    fill(126, 514, 348, 90, '#B48A64')
    for (let i = 0; i < 9; i++) {
      fill(126, 516 + i * 10, 348, 1, '#A47A55')
      fill(140 + ((i * 61) % 320), 516 + i * 10, 1, 10, '#A47A55')
    }
    // A screen on the wall, and a whiteboard in the corner
    fill(270, 515, 60, 6, OUTLINE)
    fill(271, 516, 58, 4, '#1F2A44')
    fill(424, 516, 40, 16, OUTLINE)
    fill(425, 517, 38, 14, '#F6F7F8')
    fill(428, 520, 20, 1.5, '#3E7CC9')
    fill(428, 524, 28, 1.5, '#E07A4F')
    // The long table and its chairs
    for (let i = 0; i < 6; i++) {
      for (const y of [538, 584]) {
        dot(190 + i * 44, y, 6, OUTLINE)
        dot(190 + i * 44, y, 4.8, '#465566')
      }
    }
    slab(g, 168, 544, 264, 34, 10, OUTLINE)
    slab(g, 169, 545, 262, 32, 9, '#6E4B32')
    fill(180, 548, 240, 2, '#8A6143')
    for (const x of [214, 300, 386]) {
      fill(x, 556, 12, 9, '#F6F7F8')
      dot(x + 18, 560, 2.4, '#FFFFFF', '#B9C3CC')
    }
  },

  quiet: (g, fill) => {
    // A soft blue carpet, a rug under each desk, a sign on the floor
    fill(6, 384, 468, 118, '#D6DCE6')
    for (let r = 0; r < 5; r++) fill(6, 384 + r * 24, 468, 1, '#C7CED9')
    rugs(g, ROOM_TYPES.quiet.desks, [['#C9D3E3', '#BCC6D8'], ['#D3CFE3', '#C6C1D8'], ['#CFDDD8', '#C1D1CB'], ['#E0D6CB', '#D4C8BB']], 100, 62)
    g.font = `700 8.5px ${FONT}`
    g.fillStyle = '#5B6672'
    g.textAlign = 'left'
    g.fillText('Stillerum', 16, 496)
    // The aquarium along the top wall; its fish swim in the frame
    if (owns('aquarium')) {
      const [x, y, w, h] = ROOM_TYPES.quiet.aquarium
      fill(x - 1, y - 1, w + 2, h + 2, OUTLINE)
      fill(x, y, w, h, '#3E8FC9')
      fill(x, y, w, 2, '#9CD3F5')
      for (let i = 0; i < 5; i++) fill(x + 4 + i * 11, y + h - 3, 3, 3, i % 2 ? '#56A86B' : '#D9B88A')
    }
    if (owns('plants')) for (const [x, y] of [[124, 398], [302, 398]]) bigPlant(g, fill, x, y)
  },
}

// A plot not yet bought: rough ground, a few tufts, and a fence of stakes
// and rope. Its sign, with the price, is drawn on top each frame.
const drawLot = (g, fill, room) => {
  const t = typeOf(room)
  fill(room.x, room.y, t.w, t.h, '#A9C08A')
  for (let i = 0; i < 14; i++) {
    const x = room.x + ((i * 53) % (t.w - 10)) + 4
    const y = room.y + ((i * 37) % (t.h - 10)) + 4
    fill(x, y, 6, 3, i % 2 ? '#93AB75' : '#B9A27A')
  }
  g.setLineDash([4, 3])
  g.strokeStyle = '#F6F1E4'
  g.lineWidth = 1.2
  g.strokeRect(room.x + 4, room.y + 4, t.w - 8, t.h - 8)
  g.setLineDash([])
  for (const [x, y] of [[room.x + 4, room.y + 4], [room.x + t.w - 4, room.y + 4], [room.x + 4, room.y + t.h - 4], [room.x + t.w - 4, room.y + t.h - 4]]) fill(x - 1.5, y - 1.5, 3, 3, '#8B5E3C')
}

export const drawBuilding = (project, hour) => {
  const isNight = isNightAt(hour)
  const owned = (store.state.game?.owned?.rooms ?? ['*']).join(',')
  const key = `${project}|${skyAt(hour)}|${background.width}x${background.height}|${view.x.toFixed(2)},${view.y.toFixed(2)},${view.zoom.toFixed(4)}|${owned}`
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
  drawGrounds(g, visibleRect())
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
    if (typeOf(room).topWall) {
      fill(f.x, f.y, f.w, 6, WALL_TOP)
      for (const x of typeOf(room).windows ?? []) {
        const wx = x + shiftOf(room).dx
        fill(wx, f.y + 1, 56, 5, sky)
        fill(wx + 27, f.y + 1, 2, 5, WALL_TOP)
      }
    }
  }
  // Floors and furniture, each room in its own place; a plot not yet bought
  // is an empty lot with a fence
  for (const room of rooms) {
    if (!isBuilt(room)) {
      drawLot(g, fill, room)
      continue
    }
    const { dx, dy } = shiftOf(room)
    const t = typeOf(room)
    g.save()
    g.translate(dx, dy)
    // Nothing a room draws spills into its walls
    g.beginPath()
    g.rect(t.home.x, t.home.y, t.w, t.h)
    g.clip()
    roomDrawers[room.type]?.(g, fill, dot)
    for (const [x, y, isBig] of t.plants ?? []) plant(fill, dot, x, y, isBig)
    g.restore()
  }
  // Doors, the front door's mat, and windows in the side walls
  for (const d of PLAN.doors) if (isOpenDoor(d)) fill(d.x, d.y, d.w, d.h, d.colour)
  if (PLAN.doormat) fill(...PLAN.doormat, '#6E5A44')
  for (const w of sideWindows()) {
    fill(w.x, w.y, 6, w.h, sky)
    fill(w.x + 1, w.y + w.h / 2 - 1, 4, 2, WALL_TOP)
  }
  // The name plate over the middle of the building
  const mid = WORLD.x + WORLD.w / 2
  g.fillStyle = '#20262E'
  g.beginPath()
  g.roundRect(mid - 60, WORLD.y + 3, 120, 11, 2)
  g.fill()
  g.font = `700 8px ${FONT}`
  g.fillStyle = '#E9EEF2'
  g.textAlign = 'center'
  g.fillText(clip(project || 'Kontoret', 26), mid, WORLD.y + 11.5)
}
