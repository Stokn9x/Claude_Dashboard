// ── Outdoors ─────────────────────────────────────────────────────────────
// The grounds round the office: grass, trees, a pond, the path from the
// front door, a hedge, the pavement and the road with its street lights.
// Where every tree stands comes from scenery.js. The ground is drawn with
// the building; the cars and the duck move, and are drawn every frame.
import { OUTLINE, ctx, rect, rounded, shadow } from './gfx.js'
import { stir } from './util.js'
import { GROUNDS } from './plan.js'
import { FLOWERS, HEDGE_Y, TREES, TUFTS } from './scenery.js'

export const GRASS = '#7FAE63'
const S = GROUNDS.scene
const LEAVES = [['#3E8A55', '#56A86B', '#6CC082'], ['#357A4A', '#4C9A60', '#62B377'], ['#4A9150', '#62AC63', '#7DC27A']]
// In the autumn the leafy trees turn, each its own way
const AUTUMN = [['#B5532E', '#D9752F', '#F2A541'], ['#A86A2A', '#CC912E', '#E8B84A'], ['#7E8A3A', '#A6A23E', '#CDB54D']]
const GRASS_IN = { spring: '#80B566', summer: GRASS, autumn: '#8AA95C', winter: '#8C9F7A' }
const PINES = [['#2F6B48', '#3E8A5A'], ['#2A6142', '#377D52'], ['#336F4A', '#45905F']]

// The ground and everything on it that stands still, on the background
// canvas `g`, skipping what lies out of view.
export const drawGrounds = (g, view, { season = 'summer', snow = 0 } = {}) => {
  const seen = (x, y, pad = 40) => x > view.x - pad && x < view.x + view.w + pad && y > view.y - pad && y < view.y + view.h + pad
  const fill = (x, y, w, h, c) => {
    g.fillStyle = c
    g.fillRect(x, y, w, h)
  }
  const disc = (x, y, r, c, stroke) => {
    g.beginPath()
    g.arc(x, y, r, 0, Math.PI * 2)
    g.fillStyle = c
    g.fill()
    if (stroke) {
      g.lineWidth = 1.2
      g.strokeStyle = stroke
      g.stroke()
    }
  }

  // Grass under everything, as far as the window reaches; flowers in spring
  // and summer; snow over it all when it lies
  fill(view.x, view.y, view.w, view.h, GRASS_IN[season] ?? GRASS)
  for (const t of TUFTS) if (seen(t.x, t.y)) fill(t.x, t.y, 5, 2, t.k === 0 ? '#6E9E55' : t.k === 1 ? '#8DBB6F' : '#76A65C')
  for (const f of season === 'spring' || season === 'summer' ? FLOWERS : []) {
    if (!seen(f.x, f.y)) continue
    for (const [dx, dy] of [[0, 0], [5, 2], [2, 6], [-4, 4]]) disc(f.x + dx, f.y + dy, 1.4, f.colour)
  }
  if (snow > 0) {
    g.globalAlpha = 0.88 * snow
    fill(view.x, view.y, view.w, view.h, '#EEF3F7')
    g.globalAlpha = 1
  }

  // The pond, with reeds and lily pads
  const p = GROUNDS.pond
  if (seen(p.x, p.y, p.rx + 40)) {
    g.beginPath()
    g.ellipse(p.x, p.y, p.rx + 6, p.ry + 5, 0, 0, Math.PI * 2)
    g.fillStyle = '#9C8A66'
    g.fill()
    g.beginPath()
    g.ellipse(p.x, p.y, p.rx, p.ry, 0, 0, Math.PI * 2)
    // Frozen over in a snowy winter
    g.fillStyle = snow > 0.4 ? '#B9D6E6' : '#4F97C4'
    g.fill()
    g.beginPath()
    g.ellipse(p.x - 6, p.y - 4, p.rx * 0.78, p.ry * 0.7, 0, 0, Math.PI * 2)
    g.fillStyle = '#62A9D3'
    g.fill()
    for (const [dx, dy] of [[-40, 10], [26, -18], [44, 14]]) {
      disc(p.x + dx, p.y + dy, 5, '#4E9A55')
      disc(p.x + dx + 2, p.y + dy - 1, 1.4, '#F0A9C4')
    }
    for (const [dx, dy] of [[-p.rx + 6, -10], [-p.rx + 12, 16], [p.rx - 10, -22], [p.rx - 4, 6]]) {
      for (let i = 0; i < 4; i++) fill(p.x + dx + i * 3, p.y + dy - 8 + (i % 2) * 2, 1.5, 10, '#3E7A3E')
    }
  }

  // The path from the front door to the pavement
  for (const [x, y, w, h] of GROUNDS.path) {
    fill(x - 2, y - 2, w + 4, h + 4, '#BFAF92')
    fill(x, y, w, h, '#DCCDB0')
  }
  for (const [x, y, w, h] of GROUNDS.path) {
    const isAcross = w > h
    for (let k = 6; k < (isAcross ? w : h) - 4; k += 12) {
      if (isAcross) fill(x + k, y + 4, 7, h - 8, '#E7DAC0')
      else fill(x + 4, y + k, w - 8, 7, '#E7DAC0')
    }
  }

  // A bench by the path, facing it
  const b = GROUNDS.bench
  g.globalAlpha = 0.2
  fill(b.x - 14, b.y + 6, 32, 5, '#000000')
  g.globalAlpha = 1
  fill(b.x - 16, b.y - 4, 32, 10, OUTLINE)
  fill(b.x - 15, b.y - 3, 30, 3, '#A9764A')
  fill(b.x - 15, b.y + 1, 30, 4, '#C08A58')
  fill(b.x - 13, b.y + 6, 2, 4, OUTLINE)
  fill(b.x + 11, b.y + 6, 2, 4, OUTLINE)

  // The hedge along the street, open where the path comes out
  const gapFrom = GROUNDS.path.at(-1)[0] - 4
  const gapTo = GROUNDS.path.at(-1)[0] + GROUNDS.path.at(-1)[2] + 4
  for (let x = S.x; x < S.x + S.w; x += 36) {
    if (x + 32 > gapFrom && x < gapTo) continue
    if (!seen(x, HEDGE_Y)) continue
    g.beginPath()
    g.roundRect(x, HEDGE_Y, 32, 11, 4)
    g.fillStyle = '#3E7D45'
    g.fill()
    g.lineWidth = 1
    g.strokeStyle = '#2C5E34'
    g.stroke()
    fill(x + 4, HEDGE_Y + 2, 24, 3, snow > 0.4 ? '#F2F6F9' : '#56A060')
    if ((x / 36) % 3 === 0) disc(x + 22, HEDGE_Y + 6, 1.4, '#E5484D')
  }

  // Pavements, the kerbs and the road with its middle line
  const { pavement, road, farPavement } = GROUNDS
  if (view.y + view.h > pavement.y - 20 && view.y < farPavement.y + farPavement.h + 20) {
    fill(view.x, pavement.y, view.w, pavement.h, '#C9C4BA')
    fill(view.x, farPavement.y, view.w, farPavement.h, '#C9C4BA')
    const from = Math.floor(view.x / 16) * 16
    for (let x = from; x < view.x + view.w; x += 16) {
      fill(x, pavement.y, 1, pavement.h, '#B5AFA3')
      fill(x, farPavement.y, 1, farPavement.h, '#B5AFA3')
    }
    fill(view.x, road.y, view.w, road.h, '#4A4F57')
    fill(view.x, road.y, view.w, 2, '#9A958C')
    fill(view.x, road.y + road.h - 2, view.w, 2, '#9A958C')
    for (let x = Math.floor(view.x / 30) * 30; x < view.x + view.w; x += 30) fill(x, road.y + road.h / 2 - 1, 16, 2, '#E9E2C9')
    // A pedestrian crossing where the path meets the street
    for (let k = 0; k < 5; k++) fill(GROUNDS.path.at(-1)[0] - 2 + k * 6, road.y + 4, 3, road.h - 8, '#E9E9E4')
  }
  // Grass on the far side of the street goes on as before.

  // Street lights along the pavement
  for (const lamp of GROUNDS.lamps) {
    if (!seen(lamp.x, lamp.y)) continue
    g.globalAlpha = 0.2
    g.beginPath()
    g.ellipse(lamp.x + 3, lamp.y + 2, 6, 2, 0, 0, Math.PI * 2)
    g.fillStyle = '#000000'
    g.fill()
    g.globalAlpha = 1
    fill(lamp.x - 1.5, lamp.y - 26, 3, 28, '#3E4852')
    fill(lamp.x - 4, lamp.y - 30, 8, 5, OUTLINE)
    fill(lamp.x - 3, lamp.y - 29, 6, 3, '#E9E2C9')
  }

  // Trees, back to front
  for (const t of TREES) {
    if (!seen(t.x, t.y, 60)) continue
    g.globalAlpha = 0.22
    g.beginPath()
    g.ellipse(t.x + 4, t.y + 2, t.r * 0.8, t.r * 0.32, 0, 0, Math.PI * 2)
    g.fillStyle = '#000000'
    g.fill()
    g.globalAlpha = 1
    if (t.isPine) {
      const [dark, light] = PINES[t.shade]
      fill(t.x - 2, t.y - 8, 4, 9, '#6E4B32')
      for (let k = 0; k < 3; k++) {
        const w = t.r * (1.05 - k * 0.26)
        const top = t.y - 10 - t.r * (0.55 + k * 0.5)
        g.beginPath()
        g.moveTo(t.x, top - t.r * 0.55)
        g.lineTo(t.x + w, top + t.r * 0.45)
        g.lineTo(t.x - w, top + t.r * 0.45)
        g.closePath()
        g.fillStyle = dark
        g.fill()
        g.lineWidth = 1.2
        g.strokeStyle = OUTLINE
        g.stroke()
        g.beginPath()
        g.moveTo(t.x - w * 0.15, top - t.r * 0.3)
        g.lineTo(t.x - w * 0.6, top + t.r * 0.35)
        g.lineTo(t.x - w * 0.1, top + t.r * 0.35)
        g.closePath()
        g.fillStyle = light
        g.fill()
      }
      if (snow > 0.4) {
        // Snow on the top of the pine
        const top = t.y - 10 - t.r * 1.55
        g.beginPath()
        g.moveTo(t.x, top - t.r * 0.55)
        g.lineTo(t.x + t.r * 0.3, top - t.r * 0.1)
        g.lineTo(t.x - t.r * 0.3, top - t.r * 0.1)
        g.closePath()
        g.fillStyle = '#F4F8FB'
        g.fill()
      }
    } else if (season === 'winter') {
      // Bare in the winter: a trunk and its branches
      fill(t.x - 2.5, t.y - 12, 5, 13, '#6E4B32')
      g.strokeStyle = '#6E4B32'
      g.lineCap = 'round'
      const top = t.y - 12 - t.r * 1.2
      for (const [dx, dy, w] of [[0, -t.r * 1.2, 3], [-t.r * 0.7, -t.r * 0.9, 2], [t.r * 0.7, -t.r * 0.8, 2], [-t.r * 0.4, -t.r * 0.4, 1.5], [t.r * 0.5, -t.r * 0.3, 1.5]]) {
        g.lineWidth = w
        g.beginPath()
        g.moveTo(t.x, t.y - 10)
        g.lineTo(t.x + dx, t.y - 12 + dy)
        g.stroke()
      }
      g.lineCap = 'butt'
      if (snow > 0.4) disc(t.x, top + 2, t.r * 0.3, '#F4F8FB')
    } else {
      const [dark, mid, light] = (season === 'autumn' ? AUTUMN : LEAVES)[t.shade]
      fill(t.x - 2.5, t.y - 12, 5, 13, '#6E4B32')
      const cy = t.y - 12 - t.r * 0.7
      disc(t.x, cy, t.r, dark, OUTLINE)
      disc(t.x - t.r * 0.62, cy + t.r * 0.25, t.r * 0.62, dark, OUTLINE)
      disc(t.x + t.r * 0.62, cy + t.r * 0.25, t.r * 0.62, dark, OUTLINE)
      disc(t.x, cy, t.r * 0.92, dark)
      disc(t.x - t.r * 0.3, cy - t.r * 0.25, t.r * 0.5, mid)
      disc(t.x - t.r * 0.42, cy - t.r * 0.4, t.r * 0.22, light)
      // Blossom on some of them in the spring
      if (season === 'spring' && t.shade === 0) for (const [dx, dy] of [[-0.4, -0.2], [0.3, -0.4], [0.5, 0.2], [-0.1, 0.3], [0, -0.7]]) disc(t.x + dx * t.r, cy + dy * t.r, 1.8, '#F6C6D8')
    }
  }
}

// ── What moves outside ───────────────────────────────────────────────────
// A car down the street every so often, each lane in turn, and a duck on
// the pond. Worked out from the clock, so every screen agrees. Returns the
// headlights, which glow at night.
const CAR_EVERY = 9000
const CAR_TRIP = 7000
const CAR_COLOURS = ['#D45D7A', '#3E7CC9', '#E9EEF2', '#D6A23C', '#2E9E8F', '#5B6672', '#E07A4F']

const car = (x, y, colour, isRight) => {
  shadow(x + 2, y + 9, 20, 4, 0.25)
  ctx.save()
  ctx.translate(x, y)
  if (!isRight) ctx.scale(-1, 1)
  rounded(-18, -8, 36, 17, 5, OUTLINE)
  rounded(-17, -7, 34, 15, 4, colour)
  rounded(-7, -6, 16, 13, 3, 'rgba(0,0,0,0.18)')
  rect(5, -5, 4, 11, '#A9D8F5')
  rect(-9, -5, 3, 11, '#8FC1E3')
  rect(15, -6, 2, 3, '#FFF3C4')
  rect(15, 4, 2, 3, '#FFF3C4')
  rect(-17, -6, 1.5, 3, '#E5484D')
  rect(-17, 4, 1.5, 3, '#E5484D')
  ctx.restore()
}

export const drawLife = (now, t, view) => {
  const headlights = []
  const { road } = GROUNDS
  for (const slot of [Math.floor(now / CAR_EVERY), Math.floor(now / CAR_EVERY) - 1]) {
    const k = (now - slot * CAR_EVERY) / CAR_TRIP
    if (k < 0 || k > 1) continue
    const isRight = slot % 2 === 0
    const y = isRight ? road.y + road.h * 0.72 : road.y + road.h * 0.28
    const x = isRight ? S.x - 60 + k * (S.w + 120) : S.x + S.w + 60 - k * (S.w + 120)
    if (x < view.x - 60 || x > view.x + view.w + 60) continue
    car(x, y, CAR_COLOURS[stir(slot, 5) % CAR_COLOURS.length], isRight)
    headlights.push([x + (isRight ? 26 : -26), y])
  }
  // The duck paddles slowly round the pond.
  const p = GROUNDS.pond
  const a = t / 9000
  const dx = p.x + Math.cos(a) * p.rx * 0.5
  const dy = p.y + Math.sin(a) * p.ry * 0.45
  const isRight = -Math.sin(a) > 0
  ctx.globalAlpha = 0.35
  rounded(dx - 9, dy + 2, 18, 3, 1.5, '#9CD3F5')
  ctx.globalAlpha = 1
  rounded(dx - 5, dy - 3, 10, 6, 3, '#F6F1E4', OUTLINE, 1)
  const hx = dx + (isRight ? 4 : -4)
  rounded(hx - 2.5, dy - 7, 5, 5, 2.5, '#3E8A55', OUTLINE, 1)
  rect(isRight ? hx + 2 : hx - 4, dy - 5, 2, 1.5, '#E8A33D')
  return headlights
}
