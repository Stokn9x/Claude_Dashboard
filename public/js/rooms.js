// ── The rooms, one drawer each ───────────────────────────────────────────
// How each room type looks inside: floor, walls' insides, furniture, and what
// the shop adds once it is bought. Each drawer paints at the type's own
// coordinates; building.js clips it to the room as it is now and moves it
// into place.
import { owns } from './store.js'
import { OUTLINE, FONT } from './gfx.js'
import { ROOM_TYPES } from './plan.js'

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
export const plant = (fill, dot, x, y, isBig) => {
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

// A rug under each desk, each its own colour, once the rugs are bought
const rugs = (g, desks, colours, w, h) =>
  desks.forEach(({ cx, dy }, i) => {
    const [base, edge] = colours[i % colours.length]
    slab(g, cx - w / 2, dy - 26, w, h, 6, edge)
    slab(g, cx - w / 2 + 3, dy - 23, w - 6, h - 6, 4, base)
  })

// A bookcase against a west wall, full of coloured spines
const bookcase = (fill, x, y, colours) => {
  fill(x, y, 14, 76, OUTLINE)
  fill(x + 1, y + 1, 12, 74, '#8B5E3C')
  colours.forEach((c, i) => fill(x + 2, y + 3 + i * 7, 10, 5, c))
}
const SPINES = ['#3E7CC9', '#D6A23C', '#2E9E8F', '#D45D7A', '#8A6FD6', '#E07A4F', '#56A86B', '#3E7CC9', '#D6A23C', '#D45D7A']

// A water cooler: blue bottle on a white stand
const cooler = (fill, x, y) => {
  fill(x, y, 16, 22, OUTLINE)
  fill(x + 1, y + 1, 14, 9, '#9CC4EC')
  fill(x + 1, y + 11, 14, 10, '#E9EEF2')
}

// A carpet of squares over a floor
const carpet = (fill, x, y, w, h, base, seam) => {
  fill(x, y, w, h, base)
  for (let c = 0; c <= w; c += 24) fill(x + c, y, 1, h, seam)
  for (let r = 0; r <= h; r += 24) fill(x, y + r, w, 1, seam)
}

const TEAM_RUGS = [['#BCD0C4', '#AFC4B7'], ['#CFC6DC', '#C2B8D1'], ['#DDCDB7', '#D1BFA6'], ['#BFD0DD', '#B0C3D2'], ['#DCC7CB', '#D0B7BC'], ['#CBD5B5', '#BDC9A5']]

// Each room type's own floor and furniture, in its home coordinates, drawn
// at its full size: the room's walls clip it to the steps it has.
export const roomDrawers = {
  corner: (g, fill, dot) => {
    // Oak planks
    fill(182, 0, 230, 250, '#DCC194')
    for (let i = 0; i < 25; i++) {
      fill(182, 2 + i * 10, 230, 1, '#C9AC7E')
      fill(196 + ((i * 47) % 200), 2 + i * 10, 1, 10, '#C9AC7E')
    }
    // The rug under Claude's desk
    g.globalAlpha = 0.35
    fill(219, 56, 156, 90, OUTLINE)
    g.globalAlpha = 1
    fill(221, 58, 152, 86, '#6F9C8E')
    g.strokeStyle = '#9CC2B5'
    g.lineWidth = 2
    g.strokeRect(225, 62, 144, 78)
    const books = ['#D45D7A', '#3E7CC9', '#D6A23C', '#2E9E8F', '#8A6FD6']
    for (const k of [0, 1]) {
      fill(184, 16 + k * 46, 12, 42, OUTLINE)
      fill(185, 17 + k * 46, 10, 40, '#8B5E3C')
      books.forEach((_, i) => fill(186, 20 + k * 46 + i * 7, 8, 5, books[(i + k) % 5]))
    }
    // A reading corner: a round rug, an armchair and a side table with a lamp
    dot(222, 196, 32, '#C9B79C')
    dot(222, 196, 28, '#D8CDB8')
    fill(196, 180, 28, 24, OUTLINE)
    fill(197, 181, 26, 6, '#A9512E')
    fill(197, 181, 5, 22, '#B85A33')
    fill(218, 181, 5, 22, '#B85A33')
    fill(202, 187, 16, 15, '#D9744A')
    fill(204, 189, 12, 3, '#E99A73')
    dot(240, 192, 7, OUTLINE)
    dot(240, 192, 5.8, '#B98F5E')
    dot(240, 192, 3.2, '#F6E3A8', '#C9A55A')
    // A sofa against the east wall, for a word with Claude
    fill(392, 150, 18, 58, OUTLINE)
    fill(393, 151, 16, 56, '#2E7D74')
    fill(400, 153, 8, 52, '#3AA597')
    if (owns('art')) painting(g, fill, 322, 3, 26, 13, ['#3E7CC9', '#8A6FD6', '#F6F7F8'])
    if (owns('plants')) bigPlant(g, fill, 270, 228)
    // The whiteboard; board() writes the day's numbers on it
    const b = ROOM_TYPES.corner.board
    fill(b.x - 1, b.y - 1, b.w + 2, b.h + 2, OUTLINE)
    fill(b.x, b.y, b.w, b.h, '#F6F7F8')
    fill(b.x + 2, b.y + b.h - 1, b.w - 4, 2, '#B9C3CC')
    fill(b.x + 6, b.y + b.h - 1.5, 5, 1.5, '#E5484D')
    fill(b.x + 13, b.y + b.h - 1.5, 5, 1.5, '#3E7CC9')
  },

  team2: (g, fill) => {
    // A warm grey carpet in squares, a rug under each desk
    carpet(fill, -260, 0, 430, 250, '#D3D0C8', '#C4C0B6')
    if (owns('rugs')) rugs(g, ROOM_TYPES.team2.desks, [['#C9D6CF', '#BCCAC2'], ['#D8CCC0', '#CBBFB2'], ['#CCD0E0', '#BFC3D4'], ['#DCD3BE', '#CFC6B0'], ['#D3C8D9', '#C6BBCC'], ['#C4D6DA', '#B6C9CD']], 104, 64)
    // A long bookcase on the far west wall, a whiteboard on the north wall
    bookcase(fill, -258, 70, SPINES)
    fill(-100, 2, 70, 14, OUTLINE)
    fill(-99, 3, 68, 12, '#F6F7F8')
    fill(-94, 6, 30, 1.5, '#3E7CC9')
    fill(-94, 10, 44, 1.5, '#E07A4F')
    cooler(fill, -36, 228)
    if (owns('art')) painting(g, fill, 100, 3, 26, 13, ['#56A86B', '#A9D8F5', '#F6E3A8'])
    if (owns('plants')) for (const [x, y] of [[0, 236], [-130, 236]]) bigPlant(g, fill, x, y)
  },

  team: (g, fill) => {
    // Sage carpet, a rug under each desk
    carpet(fill, -260, 314, 430, 250, '#CBD9C7', '#BCCBB8')
    if (owns('rugs')) rugs(g, ROOM_TYPES.team.desks, TEAM_RUGS, 104, 64)
    bookcase(fill, -258, 380, ['#D45D7A', '#3E7CC9', '#D6A23C', '#2E9E8F', '#8A6FD6', '#E07A4F', '#56A86B', '#D45D7A', '#3E7CC9', '#D6A23C'])
    // The printer
    fill(138, 540, 30, 18, OUTLINE)
    fill(139, 541, 28, 16, '#D3D8DD')
    fill(143, 544, 20, 3, '#2B2F36')
    fill(145, 549, 16, 6, '#F6F7F8')
    cooler(fill, -36, 316)
    // Art on the south wall, and a neon sign by the door
    if (owns('art')) {
      painting(g, fill, 30, 549, 30, 13, ['#7FB069', '#A9D8F5', '#F6E3A8'])
      painting(g, fill, -100, 549, 30, 13, ['#D45D7A', '#E07A4F', '#F6D77A'])
    }
    if (owns('neon')) {
      slab(g, 30, 316, 60, 13, 3, '#2B1F33')
      g.font = `800 8px ${FONT}`
      g.textAlign = 'center'
      g.shadowColor = '#FF5FA2'
      g.shadowBlur = 6
      g.fillStyle = '#FF8CC2'
      g.fillText('SHIP IT', 60, 326)
      g.shadowBlur = 0
    }
    if (owns('plants')) for (const [x, y] of [[0, 556], [100, 338]]) bigPlant(g, fill, x, y)
  },

  // The hall: warm stone along the walls, a long runner under both lanes,
  // round lamps in the ceiling down the middle (they glow in the evening),
  // and a plant at each end of it as it is now.
  hall: (g, fill, dot, r) => {
    const x0 = -260
    const w = 1346
    fill(x0, 262, w, 64, '#CBC5B8')
    for (let x = x0; x < x0 + w; x += 32) fill(x, 262, 1, 64, '#BEB7A9')
    fill(x0, 268, w, 1, '#BEB7A9')
    fill(x0, 319, w, 1, '#BEB7A9')
    fill(x0, 271, w, 46, '#4E5F73')
    fill(x0, 273.5, w, 1.5, '#7C8FA6')
    fill(x0, 313, w, 1.5, '#7C8FA6')
    for (let x = x0 + 24; x < x0 + w; x += 48) {
      fill(x - 1, 292, 2, 4, '#62758C')
      fill(x - 2.5, 293.5, 5, 1, '#62758C')
    }
    for (const [x, y] of ROOM_TYPES.hall.lights) {
      dot(x, y, 4.5, '#D8D0BE', '#6B7B8E')
      dot(x, y, 2, '#FFF6DE')
    }
    // (none by the toilet's door in the south-east corner)
    plant(fill, dot, r.x + 16, 270, true)
    plant(fill, dot, r.x + 16, 304, true)
    plant(fill, dot, r.x + r.w - 16, 270, true)
  },

  // The reception stands from the start, bare; bought, it is furnished.
  reception: (g, fill, dot) => {
    // Polished stone tiles
    fill(182, 314, 230, 250, '#E6E2DA')
    for (let c = 0; c <= 230; c += 12) fill(182 + c, 314, 1, 250, '#D8D3C9')
    for (let r = 0; r <= 250; r += 12) fill(182, 314 + r, 230, 1, '#D8D3C9')
    if (!owns('reception')) {
      // Empty: a few boxes and a ladder, waiting for the fitters
      fill(370, 330, 18, 14, '#B98F5E')
      fill(374, 340, 14, 10, '#C9A273')
      fill(196, 500, 4, 22, '#8B5E3C')
      fill(208, 500, 4, 22, '#8B5E3C')
      for (let k = 0; k < 4; k++) fill(196, 503 + k * 5, 16, 1.5, '#8B5E3C')
      return
    }
    // A runner from the front door up to the hall
    slab(g, 287, 316, 20, 248, 2, '#7A2E3B')
    fill(289, 318, 16, 244, '#9C3D4C')
    // The logo on the north wall, lit from below
    slab(g, 322, 316, 84, 13, 3, '#20262E')
    g.font = `800 8px ${FONT}`
    g.textAlign = 'center'
    g.shadowColor = '#E3875E'
    g.shadowBlur = 6
    g.fillStyle = '#F2A07A'
    g.fillText('CLAUDE & CO', 364, 325.5)
    g.shadowBlur = 0
    // The waiting area along the south wall: two soft rugs
    slab(g, 188, 466, 72, 94, 6, '#D8CDB8')
    slab(g, 336, 466, 72, 94, 6, '#D8CDB8')
    // By the east wall: a sofa and a table with magazines
    fill(390, 352, 18, 56, OUTLINE)
    fill(391, 353, 16, 54, '#2E7D74')
    fill(398, 355, 8, 50, '#3AA597')
    slab(g, 366, 366, 18, 26, 3, OUTLINE)
    slab(g, 367, 367, 16, 24, 2, '#B98F5E')
    fill(370, 370, 8, 6, '#E5484D')
    fill(372, 380, 8, 6, '#3E7CC9')
    // Big plants in the corners, a clock on the wall
    bigPlant(g, fill, 196, 340)
    bigPlant(g, fill, 402, 340)
    dot(196, 320, 4.5, OUTLINE)
    dot(196, 320, 3.6, '#FFFFFF')
  },

  meeting: (g, fill, dot) => {
    // Dark wooden floor
    fill(424, 0, 300, 250, '#B48A64')
    for (let i = 0; i < 25; i++) {
      fill(424, 2 + i * 10, 300, 1, '#A47A55')
      fill(436 + ((i * 61) % 280), 2 + i * 10, 1, 10, '#A47A55')
    }
    // A big screen on the north wall, and a whiteboard in the corner
    fill(545, 1, 80, 7, OUTLINE)
    fill(546, 2, 78, 5, '#1F2A44')
    fill(670, 2, 40, 16, OUTLINE)
    fill(671, 3, 38, 14, '#F6F7F8')
    fill(674, 6, 20, 1.5, '#3E7CC9')
    fill(674, 10, 28, 1.5, '#E07A4F')
    // The long table, its chairs and the chair at its head
    for (let i = 0; i < 6; i++) {
      for (const y of [96, 142]) {
        dot(492 + i * 38, y, 6, OUTLINE)
        dot(492 + i * 38, y, 4.8, '#465566')
      }
    }
    dot(446, 120, 6, OUTLINE)
    dot(446, 120, 4.8, '#465566')
    slab(g, 468, 102, 236, 34, 10, OUTLINE)
    slab(g, 469, 103, 234, 32, 9, '#6E4B32')
    fill(480, 106, 212, 2, '#8A6143')
    for (const x of [506, 586, 666]) {
      fill(x, 114, 12, 9, '#F6F7F8')
      dot(x + 18, 118, 2.4, '#FFFFFF', '#B9C3CC')
    }
    // A sideboard by the south wall, with water and glasses
    fill(560, 226, 100, 18, OUTLINE)
    fill(561, 227, 98, 16, '#8B5E3C')
    fill(561, 227, 98, 3, '#B98F5E')
    dot(584, 234, 3.4, '#9CC4EC', OUTLINE)
    for (const x of [596, 604, 612]) dot(x, 235, 2, '#E9EEF2', '#B9C3CC')
  },

  quiet: (g, fill) => {
    // A soft blue carpet, a rug under each desk
    fill(424, 314, 280, 250, '#D6DCE6')
    for (let r = 0; r < 11; r++) fill(424, 314 + r * 24, 280, 1, '#C7CED9')
    if (owns('rugs')) rugs(g, ROOM_TYPES.quiet.desks, [['#C9D3E3', '#BCC6D8'], ['#D3CFE3', '#C6C1D8'], ['#CFDDD8', '#C1D1CB'], ['#E0D6CB', '#D4C8BB']], 100, 62)
    // The aquarium along the top wall; its fish swim in the frame
    if (owns('aquarium')) {
      const [x, y, w, h] = ROOM_TYPES.quiet.aquarium
      fill(x - 1, y - 1, w + 2, h + 2, OUTLINE)
      fill(x, y, w, h, '#3E8FC9')
      fill(x, y, w, 2, '#9CD3F5')
      for (let i = 0; i < 5; i++) fill(x + 4 + i * 11, y + h - 3, 3, 3, i % 2 ? '#56A86B' : '#D9B88A')
    }
    if (owns('plants')) bigPlant(g, fill, 580, 446)
  },

  // The lounge: dark oak, the TV and the sofa, then pool and darts, then
  // the bar, the arcade machine, the jukebox and a guitar.
  lounge: (g, fill, dot) => {
    const t = ROOM_TYPES.lounge
    fill(736, 0, 510, 250, '#5E4535')
    for (let i = 0; i < 25; i++) {
      fill(736, 2 + i * 10, 510, 1, '#4E392B')
      fill(744 + ((i * 67) % 490), 2 + i * 10, 1, 10, '#4E392B')
    }
    // The games corner: a TV, a rug and two beanbags
    slab(g, t.tv.x - 12, t.tv.y + 34, 80, 44, 8, '#2E4C6E')
    slab(g, t.tv.x - 9, t.tv.y + 37, 74, 38, 6, '#36597F')
    fill(t.tv.x - 1, t.tv.y - 1, t.tv.w + 2, t.tv.h + 2, OUTLINE)
    fill(t.tv.x, t.tv.y, t.tv.w, t.tv.h, '#1B2433')
    dot(t.tv.x + 14, t.tv.y + 66, 10, '#D45D7A', OUTLINE)
    dot(t.tv.x + 42, t.tv.y + 66, 10, '#3E7CC9', OUTLINE)
    // The sofa along the south wall, cushions in two colours
    const f = t.sofa
    fill(f.x, f.y, f.w, f.h, OUTLINE)
    fill(f.x + 1, f.y + 6, f.w - 2, f.h - 7, '#8A6FD6')
    fill(f.x + 1, f.y + 1, f.w - 2, 6, '#6A52AE')
    fill(f.x + 6, f.y + 8, 22, 6, '#A48BE6')
    fill(f.x + 34, f.y + 8, 22, 6, '#A48BE6')
    // The neon sign on the north wall
    slab(g, 866, 4, 62, 13, 3, '#2B1F33')
    g.font = `800 8px ${FONT}`
    g.textAlign = 'center'
    g.shadowColor = '#FF5FA2'
    g.shadowBlur = 8
    g.fillStyle = '#FF8CC2'
    g.fillText('LOUNGE', 897, 14)
    g.shadowBlur = 0
    bigPlant(g, fill, 750, 30)
    if (owns('pingpong')) pingpongTable(fill, dot, t.pingpongTable)
    // The pool table on a big purple rug: wooden rim, green cloth, pockets, balls set up
    const p = t.pool
    slab(g, p.x - 20, p.y - 14, 120, 66, 8, '#4B2E5C')
    slab(g, p.x - 16, p.y - 10, 112, 58, 6, '#5E3A72')
    g.strokeStyle = '#7C55A0'
    g.lineWidth = 1
    g.strokeRect(p.x - 10.5, p.y - 4.5, 100, 47)
    slab(g, p.x - 2, p.y - 2, p.w + 4, p.h + 4, 5, OUTLINE)
    slab(g, p.x, p.y, p.w, p.h, 4, '#6E4B32')
    fill(p.x + 5, p.y + 5, p.w - 10, p.h - 10, '#1F7A4D')
    for (const [px, py] of [[p.x + 5, p.y + 5], [p.x + p.w / 2, p.y + 4], [p.x + p.w - 5, p.y + 5], [p.x + 5, p.y + p.h - 5], [p.x + p.w / 2, p.y + p.h - 4], [p.x + p.w - 5, p.y + p.h - 5]]) dot(px, py, 2.2, '#111418')
    ;['#F2C94C', '#E5484D', '#3E7CC9', '#8A6FD6', '#E07A4F', '#111418'].forEach((c, i) => dot(p.x + 52 + [0, 4, 4, 8, 8, 8][i], p.y + 19 + [0, -2.5, 2.5, -5, 0, 5][i], 2, c))
    dot(p.x + 20, p.y + 19, 2, '#FFFFFF')
    // The dartboard on the north wall, and the line on the floor
    const d = t.dartboard
    dot(d.x, d.y, 9, OUTLINE)
    dot(d.x, d.y, 8, '#2B2F36')
    dot(d.x, d.y, 6, '#E9E2C9')
    dot(d.x, d.y, 4, '#E5484D')
    dot(d.x, d.y, 1.6, '#2E9E8F')
    fill(d.x - 12, 60, 24, 2, '#E5484D')
    // The bar along the north wall: bottles on a shelf, a counter, two stools
    const b = t.bar
    fill(b.x, b.y - 2, b.w, 4, '#3B2A20')
    ;['#2E9E8F', '#D6A23C', '#E5484D', '#7FB4F0', '#56A86B', '#E07A4F', '#8A6FD6'].forEach((c, i) => fill(b.x + 6 + i * 11, b.y - 2, 4, 4, c))
    slab(g, b.x - 1, b.y + 1, b.w + 2, b.h, 3, OUTLINE)
    slab(g, b.x, b.y + 2, b.w, b.h - 2, 2, '#8B5E3C')
    fill(b.x, b.y + 2, b.w, 3, '#B98F5E')
    for (const x of [b.x + 18, b.x + 50]) {
      dot(x, b.y + 40, 5.5, OUTLINE)
      dot(x, b.y + 40, 4.3, '#C8643B')
    }
    // The arcade machine against the north wall
    const a = t.arcade
    fill(a.x - 1, a.y - 1, a.w + 2, a.h + 2, OUTLINE)
    fill(a.x, a.y, a.w, a.h, '#8A6FD6')
    fill(a.x + 3, a.y + 3, a.w - 6, 9, '#1B2433')
    dot(a.x + 8, a.y + 17, 2, '#E5484D')
    dot(a.x + 17, a.y + 17, 2, '#F2C94C')
    // The jukebox, glowing
    const j = t.jukebox
    slab(g, j.x - 1, j.y - 1, j.w + 2, j.h + 2, 6, OUTLINE)
    slab(g, j.x, j.y, j.w, j.h, 5, '#D6A23C')
    fill(j.x + 4, j.y + 4, j.w - 8, 7, '#FF8CC2')
    fill(j.x + 4, j.y + 13, j.w - 8, 3, '#2B2F36')
    // The guitar corner: an amp by the stool
    fill(1176, 192, 14, 14, OUTLINE)
    fill(1177, 193, 12, 12, '#2B2F36')
    dot(1183, 199, 3.5, '#5B6672')
    bigPlant(g, fill, 1100, 236)
  },

  kitchen: (g, fill, dot) => {
    // Tiles
    fill(716, 314, 260, 250, '#F3F5F6')
    for (let c = 0; c < 22; c++) for (let r = 0; r < 21; r++) if ((c + r) % 2 === 0) fill(716 + c * 12, 314 + r * 12, 12, 12, '#E4E8EB')
    // The counter on the north wall, with the coffee machine and the sink
    fill(718, 316, 62, 16, OUTLINE)
    fill(719, 317, 60, 14, '#F7F7F5')
    fill(719, 329, 60, 2, '#C9CED3')
    if (owns('espresso')) {
      // A chrome espresso machine with two cups
      fill(722, 317, 22, 13, OUTLINE)
      fill(723, 318, 20, 11, '#C9CED3')
      fill(725, 319, 16, 3, '#E9EEF2')
      fill(726, 324, 3, 3, '#2B2F36')
      fill(737, 324, 3, 3, '#2B2F36')
      dot(748, 326, 2, '#FFFFFF', OUTLINE)
      dot(753, 326, 2, '#FFFFFF', OUTLINE)
    } else {
      fill(726, 318, 14, 12, '#2B2F36')
      dot(733, 324, 2, '#E07A4F')
    }
    fill(758, 319, 18, 9, '#9CB4C6')
    fill(762, 321, 10, 5, '#D7E9FA')
    // A small bistro table for two
    for (const y of [423, 457]) {
      dot(760, y, 5.5, OUTLINE)
      dot(760, y, 4.2, '#C9A273')
    }
    dot(760, 440, 9, OUTLINE)
    dot(760, 440, 7.8, '#F7F7F5')
    dot(757, 438, 2, '#FFFFFF', '#B9C3CC')
    dot(763, 442, 1.6, '#7A4B2A')
    // Grown into the depot: a round rug under a big table with four stools
    dot(900, 450, 40, '#DDE6E0')
    dot(900, 450, 37, '#E8EFEA')
    g.strokeStyle = '#C9D6CD'
    g.lineWidth = 1
    g.beginPath()
    g.arc(900, 450, 32, 0, Math.PI * 2)
    g.stroke()
    for (const [x, y] of [[900, 422], [928, 450], [900, 478], [872, 450]]) {
      dot(x, y, 7, OUTLINE)
      dot(x, y, 5.5, '#465566')
    }
    dot(900, 450, 20, OUTLINE)
    dot(900, 450, 18.5, '#C9A273')
    dot(900, 450, 15, '#D9B88A')
    dot(900, 450, 6, '#F7F7F5', OUTLINE)
    dot(898, 448, 2, '#E07A4F')
    dot(902, 449, 2, '#D6A23C')
    dot(900, 452, 2, '#56A86B')
    // The fridge, and the snack machine under it
    fill(940, 316, 28, 34, OUTLINE)
    fill(941, 317, 26, 32, '#E9EEF2')
    fill(941, 331, 26, 1, '#B9C3CC')
    fill(942, 362, 32, 30, OUTLINE)
    fill(943, 363, 30, 28, '#3E7CC9')
    fill(945, 365, 19, 22, '#D7E9FA')
    ;['#E5484D', '#D6A23C', '#2E9E8F', '#E07A4F', '#8A6FD6', '#56A86B'].forEach((c, i) => fill(947 + (i % 3) * 6, 367 + Math.floor(i / 3) * 10, 4, 6, c))
    fill(966, 367, 5, 3, '#2B2F36')
    fill(966, 374, 5, 10, '#2F5F9C')
  },

  toilet: (g, fill, dot) => {
    // Small pale tiles
    fill(988, 314, 218, 150, '#E3EEF2')
    for (let c = 0; c < 28; c++) for (let r = 0; r < 19; r++) if ((c + r) % 2 === 0) fill(988 + c * 8, 314 + r * 8, 8, 8, '#D4E3E9')
    // The stalls along the south wall, their doors facing the room: one
    // for each step
    for (const x of [994, 1092, 1150]) {
      fill(x, 424, 52, 40, OUTLINE)
      fill(x + 1, 425, 50, 39, '#F4F7F8')
      dot(x + 26, 448, 7, OUTLINE)
      dot(x + 26, 448, 5.8, '#FFFFFF')
      dot(x + 26, 447, 3.2, '#CFE3EC')
      fill(x + 19, 456, 14, 5, '#E9EEF2')
      fill(x + 9, 424, 34, 3, '#7FA7C2')
      dot(x + 40, 429, 1.3, '#5B6672')
    }
    // A sink and a mirror on the north wall
    fill(1094, 316, 46, 16, OUTLINE)
    fill(1095, 317, 44, 14, '#F4F7F8')
    dot(1117, 324, 5, '#CFE3EC', '#9CB4C6')
    fill(1100, 316, 34, 2, '#9CC4EC')
  },

  // A store room: bare concrete, shelves along the walls, boxes waiting
  depot: (g, fill, dot, r) => {
    fill(r.x, r.y, r.w, r.h, '#8E979F')
    for (let y = 0; y < r.h; y += 16) fill(r.x, r.y + y, r.w, 1, '#858E96')
    for (const x of [r.x + 2, r.x + r.w - 16]) {
      fill(x, r.y + 20, 14, r.h - 40, OUTLINE)
      fill(x + 1, r.y + 21, 12, r.h - 42, '#6E5A44')
      for (let y = r.y + 26; y < r.y + r.h - 30; y += 22) fill(x + 2, y, 10, 12, ['#C9A273', '#B98F5E', '#D9B88A'][Math.round(y) % 3])
    }
    for (const [dx, dy, w, h] of [[30, 40, 22, 16], [36, 30, 14, 12], [r.w - 60, r.h - 70, 24, 18], [r.w / 2 - 10, r.h / 2, 20, 16]]) {
      fill(r.x + dx, r.y + dy, w, h, OUTLINE)
      fill(r.x + dx + 1, r.y + dy + 1, w - 2, h - 2, '#C9A273')
      fill(r.x + dx + w / 2 - 1, r.y + dy + 1, 2, h - 2, '#B98F5E')
    }
    g.font = `700 8.5px ${FONT}`
    g.fillStyle = '#5B6672'
    g.textAlign = 'center'
    g.fillText('Depot', r.x + r.w / 2, r.y + r.h / 2 - 20)
  },
}
// A ping-pong table, net across the middle
const pingpongTable = (fill, dot, { x, y }) => {
  fill(x - 26, y - 13, 52, 26, OUTLINE)
  fill(x - 25, y - 12, 50, 24, '#2E8B6E')
  fill(x - 25, y - 0.5, 50, 1, '#FFFFFF')
  fill(x - 0.5, y - 12, 1, 24, '#E9EEF2')
  fill(x - 1, y - 14, 2, 28, '#2B2F36')
  dot(x - 16, y - 7, 1.6, '#FFFFFF')
  dot(x - 30, y - 5, 3, '#E5484D', OUTLINE)
  dot(x + 30, y + 5, 3, '#3E7CC9', OUTLINE)
}
