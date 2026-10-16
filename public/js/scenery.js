// Where things stand on the grounds: trees, tufts of grass, flowers. Worked
// out once from fixed seeds, so it is the same on every screen. No drawing
// here (outdoors.js does that), so the layout can be tested without a browser.
import { stir, isIn } from './util.js'
import { GROUNDS, WORLD } from './plan.js'

const S = GROUNDS.scene
export const HEDGE_Y = GROUNDS.pavement.y - 14

// Where nothing may grow: the office and a strip round it, the path, the
// street with its hedge and pavements, the pond's banks and the bench. `r`
// widens the keep-out by a tree's own size.
export const isClear = (x, y, r = 0) => {
  const keepOut = [
    [WORLD.x - 30 - r, WORLD.y - 22 - r, WORLD.w + 60 + 2 * r, WORLD.h + 44 + 2 * r],
    ...GROUNDS.path.map(([px, py, w, h]) => [px - 16 - r, py - 22 - r, w + 32 + 2 * r, h + 30 + 2 * r]),
    [S.x, HEDGE_Y - 18 - r, S.w, GROUNDS.farPavement.y + GROUNDS.farPavement.h - HEDGE_Y + 30 + r],
    [GROUNDS.bench.x - 30, GROUNDS.bench.y - 30, 60, 50],
    // The lawn where helpers off work hang out
    [638 - r, 312 - r, 190 + 2 * r, 160 + 2 * r],
  ]
  if (keepOut.some(box => isIn(x, y, box))) return false
  const p = GROUNDS.pond
  return ((x - p.x) / (p.rx + 24 + r)) ** 2 + ((y - p.y) / (p.ry + 22 + r)) ** 2 > 1
}

const random = (i, salt) => stir(i, salt) / 0xffffffff

// Trees: leafy ones and pines, in loose groves, never too close together;
// sorted back to front.
export const TREES = (() => {
  const trees = []
  for (let i = 0; trees.length < 230 && i < 4000; i++) {
    const x = S.x + 20 + random(i, 101) * (S.w - 40)
    const y = S.y + 30 + random(i, 102) * (S.h - 40)
    const size = 0.8 + random(i, 103) * 0.6
    const r = 20 * size
    if (!isClear(x, y, r * 0.6)) continue
    if (trees.some(t => Math.hypot(t.x - x, t.y - y) < (t.r + r) * 0.9)) continue
    trees.push({ x, y, r, size, isPine: random(i, 104) < 0.38, shade: Math.floor(random(i, 105) * 3) })
  }
  return trees.sort((a, b) => a.y - b.y)
})()

// Tufts of darker grass and little clusters of flowers.
export const TUFTS = Array.from({ length: 700 }, (_, i) => ({ x: S.x + random(i, 201) * S.w, y: S.y + random(i, 202) * S.h, k: i % 3 })).filter(t => isClear(t.x, t.y, -16))
export const FLOWERS = Array.from({ length: 70 }, (_, i) => ({ x: S.x + random(i, 301) * S.w, y: S.y + random(i, 302) * S.h, colour: ['#F6F1E4', '#F2C94C', '#E07A9A', '#B9A6F0'][i % 4] })).filter(f => isClear(f.x, f.y, -10))
