// ── The pixel grid ───────────────────────────────────────────────────────
// The office is pixel art, and everything in it shares one pixel: the
// figures' own, 3.5 world units. pixelate() gives a canvas context round
// shapes in steps on that grid: arcs, ellipses and rounded rectangles are
// traced as stairs, so a plant, a lamp, a tree or a speech bubble has the
// same chunky edge as the people. Text is left as it is. No DOM is touched
// when this loads.

export const PIXEL = 3.5
export const snap = v => Math.round(v / PIXEL) * PIXEL

// A curve as stairs: points along it, each on the grid, joined by a step
// across and a step down, taking the corner farther from the centre so the
// shape keeps its full size.
const stairs = (path, line, cx, cy, at, a0, a1) => {
  const span = a1 - a0
  const n = Math.max(6, Math.ceil(Math.abs(span) * 10))
  let prev = null
  for (let i = 0; i <= n; i++) {
    const [px, py] = at(a0 + (span * i) / n)
    const p = { x: snap(px), y: snap(py) }
    if (!prev) line.call(path, p.x, p.y)
    else if (p.x !== prev.x || p.y !== prev.y) {
      const a = { x: p.x, y: prev.y }
      const b = { x: prev.x, y: p.y }
      const far = Math.hypot(a.x - cx, a.y - cy) >= Math.hypot(b.x - cx, b.y - cy) ? a : b
      line.call(path, far.x, far.y)
      line.call(path, p.x, p.y)
    }
    prev = p
  }
}

// The angles an arc covers, as the canvas reads them.
const sweep = (a0, a1, ccw) => {
  const full = Math.PI * 2
  if (!ccw && a1 - a0 >= full) return [a0, a0 + full]
  if (ccw && a0 - a1 >= full) return [a0, a0 - full]
  let end = a1
  if (!ccw) while (end < a0) end += full
  else while (end > a0) end -= full
  return [a0, end]
}

// Something smaller than a pixel or two is a square of pixels.
const dot = (path, x, y, rx, ry) => {
  const w = PIXEL * Math.max(1, Math.round((2 * rx) / PIXEL))
  const h = PIXEL * Math.max(1, Math.round((2 * ry) / PIXEL))
  path.rect(snap(x - w / 2), snap(y - h / 2), w, h)
}

// The corners of a rounded rectangle as pixel steps, clockwise from the top
// edge: one pixel cut off, or for a big box a step of two pixels and one.
// Offsets from each corner, in pixels.
const CORNERS = {
  small: [
    [[-1, 0], [-1, 1], [0, 1]],
    [[0, -1], [-1, -1], [-1, 0]],
    [[1, 0], [1, -1], [0, -1]],
    [[0, 1], [1, 1], [1, 0]],
  ],
  big: [
    [[-2, 0], [-2, 1], [-1, 1], [-1, 2], [0, 2]],
    [[0, -2], [-1, -2], [-1, -1], [-2, -1], [-2, 0]],
    [[2, 0], [2, -1], [1, -1], [1, -2], [0, -2]],
    [[0, 2], [1, 2], [1, 1], [2, 1], [2, 0]],
  ],
}

export const pixelate = context => {
  const line = context.lineTo
  context.arc = function (x, y, r, a0, a1, ccw = false) {
    if (r < PIXEL) return dot(this, x, y, r, r)
    const [from, to] = sweep(a0, a1, ccw)
    stairs(this, line, x, y, a => [x + r * Math.cos(a), y + r * Math.sin(a)], from, to)
  }
  context.ellipse = function (x, y, rx, ry, rotation, a0, a1, ccw = false) {
    if (rx < PIXEL || ry < PIXEL) return dot(this, x, y, rx, ry)
    const [from, to] = sweep(a0, a1, ccw)
    const cos = Math.cos(rotation)
    const sin = Math.sin(rotation)
    stairs(this, line, x, y, a => [x + rx * Math.cos(a) * cos - ry * Math.sin(a) * sin, y + rx * Math.cos(a) * sin + ry * Math.sin(a) * cos], from, to)
  }
  context.roundRect = function (x, y, w, h, radii = 0) {
    const r0 = Array.isArray(radii) ? (radii[0] ?? 0) : radii
    const r = typeof r0 === 'number' ? r0 : (r0?.x ?? 0)
    const x0 = snap(Math.min(x, x + w))
    const y0 = snap(Math.min(y, y + h))
    // Never thinner than a pixel.
    const x1 = Math.max(snap(Math.max(x, x + w)), x0 + PIXEL)
    const y1 = Math.max(snap(Math.max(y, y + h)), y0 + PIXEL)
    const side = Math.min(x1 - x0, y1 - y0) / PIXEL
    const kind = r >= PIXEL * 1.5 && side >= 6 ? 'big' : r >= PIXEL * 0.5 && side >= 3 ? 'small' : null
    if (!kind) return this.rect(x0, y0, x1 - x0, y1 - y0)
    const steps = CORNERS[kind]
    const at = ([cx, cy], [dx, dy]) => [cx + dx * PIXEL, cy + dy * PIXEL]
    const corners = [[x1, y0], [x1, y1], [x0, y1], [x0, y0]]
    this.moveTo(...at(corners[3], steps[3].at(-1)))
    corners.forEach((corner, i) => {
      for (const step of steps[i]) line.call(this, ...at(corner, step))
    })
    this.closePath()
  }
  return context
}
