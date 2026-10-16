// ── Weather and seasons ──────────────────────────────────────────────────
// No forecast from outside: the office keeps everything on this computer.
// The weather comes from the clock instead, three hours at a time, about as
// often as Danish weather would have it in each season: rain is common in
// the autumn, snow only in the winter. It fades in and out over a quarter
// of an hour, and snow lies a while after it stops. The season gives the
// trees their colours, and December brings Christmas. The same for every
// viewer. No DOM here, so it can be tested without a browser.
import { stir } from './util.js'

export const BLOCK_MS = 3 * 60 * 60_000
const FADE_MS = 15 * 60_000
const SETTLE_MS = 40 * 60_000
const MELT_MS = 90 * 60_000

export const seasonOf = date => {
  const m = date.getMonth()
  return m === 11 || m <= 1 ? 'winter' : m <= 4 ? 'spring' : m <= 7 ? 'summer' : 'autumn'
}
// From the first of December until Boxing Day.
export const isChristmasTime = date => date.getMonth() === 11 && date.getDate() <= 26

// Out of a hundred, how often each kind of weather comes in a season.
const CHANCES = {
  winter: [['clear', 30], ['cloudy', 35], ['rain', 15], ['snow', 20]],
  spring: [['clear', 45], ['cloudy', 30], ['rain', 25]],
  summer: [['clear', 60], ['cloudy', 25], ['rain', 15]],
  autumn: [['clear', 30], ['cloudy', 35], ['rain', 35]],
}
const kindIn = block => {
  const season = seasonOf(new Date(block * BLOCK_MS + BLOCK_MS / 2))
  let r = stir(block >>> 0, 41) % 100
  for (const [kind, chance] of CHANCES[season]) {
    if (r < chance) return kind
    r -= chance
  }
  return 'clear'
}

// The weather now: its kind, how strong it is (0 to 1, fading at the
// edges of its three hours), how much snow lies, the season, and whether it
// is Christmas. `asked` shows another: { kind } for the weather, { month }
// (1 to 12) for the season, as ?vejr= and ?maaned= in the address do.
export const weatherAt = (now, asked = {}) => {
  const date = asked.month ? new Date(new Date(now).getFullYear(), asked.month - 1, 15) : new Date(now)
  const look = { season: seasonOf(date), isChristmas: isChristmasTime(date) }
  if (asked.kind) return { kind: asked.kind, intensity: 1, snowCover: asked.kind === 'snow' ? 1 : 0, ...look }
  const block = Math.floor(now / BLOCK_MS)
  const kind = kindIn(block)
  const before = kindIn(block - 1)
  const after = kindIn(block + 1)
  const into = now - block * BLOCK_MS
  let intensity = 0.55 + (0.45 * (stir(block >>> 0, 43) % 100)) / 100
  if (before !== kind) intensity *= Math.min(1, into / FADE_MS)
  if (after !== kind) intensity *= Math.min(1, (BLOCK_MS - into) / FADE_MS)
  const snowCover = kind === 'snow' ? Math.min(1, into / SETTLE_MS) : before === 'snow' ? Math.max(0, 1 - into / MELT_MS) : 0
  return { kind, intensity, snowCover, ...look }
}
