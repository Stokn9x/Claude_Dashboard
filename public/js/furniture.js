// The furniture that changes while you look: desks with live screens,
// chairs, the board with the day's numbers, the wall clock, mugs.
import { owns } from './store.js'
import { OUTLINE, FONT, circle, ctx, faint, label, rect, rounded, shadow } from './gfx.js'
import { hashOf, kr } from './util.js'
import { at, firstRoom, isBuilt, typeOf } from './plan.js'
import { L } from './i18n.js'

const screens = { working: '#5B6672', reading: '#E9EEF2', editing: '#1F2A44', running: '#111418', browsing: '#D7E9FA', waiting: '#E5484D', idle: '#1B2433' }

export const chair = (cx, dy) => {
  shadow(cx + 2, dy + 4, 22, 5, 0.14)
  if (owns('chairs')) {
    // Ergonomic: a high back with a headrest, and armrests
    rounded(cx - 22, dy - 20, 44, 24, 6, OUTLINE)
    rounded(cx - 20, dy - 18, 40, 20, 5, '#23857A')
    rounded(cx - 14, dy - 22, 28, 6, 3, OUTLINE)
    rounded(cx - 12, dy - 21, 24, 4, 2, '#2E9E8F')
    rect(cx - 22, dy - 4, 4, 8, OUTLINE)
    rect(cx + 18, dy - 4, 4, 8, OUTLINE)
    return
  }
  rounded(cx - 21, dy - 18, 42, 22, 5, OUTLINE)
  rounded(cx - 19, dy - 16, 38, 18, 4, '#4A5868')
  rounded(cx - 17, dy - 14, 34, 3, 1.5, '#62758C')
}

// What a screen shows: code, a terminal, a page of text, a browser.
const screenArt = (x, y, state, t) => {
  if (state === 'editing') {
    const shift = Math.floor(t / 500) % 2
    ;['#7FB4F0', '#F2A541', '#9BD58B'].forEach((c, i) => rect(x + 2 + (i % 2) * 2, y + 2 + i * 3 - shift, 8 - i * 2, 1.5, c))
  } else if (state === 'running') {
    rect(x + 2, y + 2, 7, 1.5, '#3DDC84')
    if (Math.floor(t / 400) % 2 === 0) rect(x + 2, y + 6, 2, 2, '#3DDC84')
  } else if (state === 'reading') {
    ;[0, 1, 2].forEach(i => rect(x + 2, y + 2 + i * 3, 10 - (i % 2) * 3, 1.5, '#AEB6BF'))
  } else if (state === 'browsing') {
    rect(x, y, 14, 2.5, '#3E7CC9')
    rect(x + 2, y + 4, 6, 4, '#9CC4EC')
  } else if (state === 'waiting' && Math.floor(t / 450) % 2 === 0) {
    rect(x + 6, y + 2, 2, 5, '#FFFFFF')
    rect(x + 6, y + 8, 2, 2, '#FFFFFF')
  }
}

const monitor = (x, dy, state, t, isWide = false) => {
  const w = isWide ? 30 : 20
  const left = isWide ? x - 10 : x
  rect(left - 1, dy + 1, w + 2, 16, OUTLINE)
  rect(left, dy + 2, w, 13, state ? screens[state] : '#111418')
  if (state) screenArt(left + 2, dy + 4, state, t)
  if (state && isWide) screenArt(left + 16, dy + 4, state, t + 333)
  rect(left + w / 2 - 2, dy + 17, 4, 3, OUTLINE)
}

export const desk = (cx, dy, w, state, t, monitors = 1) => {
  const left = cx - w / 2
  faint(0.13, () => rounded(left + 3, dy + 4, w, 28, 2, '#000000'))
  rounded(left - 1, dy - 1, w + 2, 30, 2, OUTLINE)
  rect(left, dy, w, 22, '#E4C79C')
  rect(left, dy, w, 2, '#F7DDBA')
  rect(left, dy + 22, w, 6, '#B98F5E')
  monitor(cx + w / 2 - 28, dy, state, t, monitors === 1 && owns('screens'))
  if (monitors > 1) monitor(cx - w / 2 + 8, dy, state, t)
  rounded(cx - 12, dy + 12, 24, 7, 1, '#C9CED3', OUTLINE, 1)
  rect(cx - 9, dy + 14, 18, 1, '#AEB6BF')
  rect(cx - 9, dy + 16, 18, 1, '#AEB6BF')
}

// Little things on a helper's desk, left of the keyboard: two of these,
// chosen by its id, so the same helper always has the same desk.
const deskThings = [
  // a mug
  (x, y) => {
    rect(x, y, 6, 6, OUTLINE)
    rect(x + 1, y + 1, 4, 4, '#FFFFFF')
    rect(x + 1, y + 1, 4, 1.5, '#7A4B2A')
    rect(x + 6, y + 2, 1.5, 2.5, OUTLINE)
  },
  // a little plant
  (x, y) => {
    rect(x + 1, y + 4, 5, 4, '#B5683E')
    circle(x + 3.5, y + 3, 3.4, '#3E8A55', OUTLINE)
    circle(x + 2.5, y + 2, 1.4, '#6CC082')
  },
  // a stack of papers
  (x, y) => {
    rect(x + 1, y + 1, 9, 7, '#C9CED3')
    rect(x, y, 9, 7, '#FFFFFF')
    rect(x + 1.5, y + 2, 6, 0.8, '#AEB6BF')
    rect(x + 1.5, y + 4, 4, 0.8, '#AEB6BF')
  },
  // a rubber duck
  (x, y) => {
    circle(x + 3, y + 4.5, 3, '#F2C94C', OUTLINE)
    circle(x + 5, y + 2, 1.8, '#F2C94C', OUTLINE)
    rect(x + 6.3, y + 1.8, 1.6, 1, '#E07A4F')
  },
  // headphones
  (x, y) => {
    ctx.beginPath()
    ctx.arc(x + 4, y + 4, 3.4, Math.PI, 0)
    ctx.lineWidth = 1.2
    ctx.strokeStyle = OUTLINE
    ctx.stroke()
    rect(x - 0.5, y + 3.5, 2.5, 3.5, OUTLINE)
    rect(x + 6, y + 3.5, 2.5, 3.5, OUTLINE)
  },
  // a framed photo
  (x, y) => {
    rect(x, y, 7, 6, OUTLINE)
    rect(x + 1, y + 1, 5, 4, '#9CC4EC')
    rect(x + 1, y + 3.5, 5, 1.5, '#56A86B')
  },
  // a snack
  (x, y) => {
    rect(x, y + 1, 8, 5, OUTLINE)
    rect(x + 1, y + 2, 6, 3, '#E5484D')
    rect(x + 2.5, y + 2.5, 3, 1, '#FFFFFF')
  },
]
export const deskThingsFor = (id, cx, dy) => {
  const h = hashOf(id)
  const first = h % deskThings.length
  const second = (first + 1 + ((h >>> 5) % (deskThings.length - 1))) % deskThings.length
  deskThings[first](cx - 38, dy + 3)
  deskThings[second](cx - 27, dy + 12)
}

// A mug in the hand, at (x, y) its top-left corner.
export const mug = (x, y, isBig = false) => {
  if (!isBig) {
    rect(x, y, 6, 7, OUTLINE)
    rect(x + 1, y + 1, 4, 5, '#FFFFFF')
    rect(x + 1, y + 1, 4, 1.5, '#7A4B2A')
    return
  }
  rect(x + 8, y + 2, 3, 5, OUTLINE)
  rect(x + 8.5, y + 3, 1.5, 3, '#FFFFFF')
  rect(x, y, 9, 10, OUTLINE)
  rect(x + 1, y + 1, 7, 8, '#FFFFFF')
  rect(x + 1, y + 1, 7, 2, '#7A4B2A')
}

// Steam rising from (x, y): a mug, a coffee machine.
export const steam = (x, y, t, { puffs = 3, gap = 3, speed = 60, height = 16, alpha = 0.5, colour = '#E9EEF2' } = {}) =>
  faint(alpha, () => {
    for (let i = 0; i < puffs; i++) {
      const rise = (t / speed + i * 6) % height
      rect(x + i * gap + Math.sin(t / 280 + i) * 1.2, y - rise, 1.5, 3, colour)
    }
  })

// The day's lines and the money in the bank, in marker on Claude's board.
export const board = (stats, kroner) => {
  const room = firstRoom('corner')
  if (!room) return
  const b = at(room, typeOf(room).board)
  const left = b.x + 4
  label(L('I dag', 'Today'), left, b.y + 7, 5.5, '#5B6672', 700, 'left')
  if (!stats || (!stats.linesAdded && !stats.linesRemoved && typeof kroner !== 'number')) {
    rect(left, b.y + 12, 26, 1.5, '#3E7CC9')
    rect(left, b.y + 17, 18, 1.5, '#E07A4F')
    return
  }
  label(`+${stats.linesAdded ?? 0}`, left, b.y + 15, 7, '#2E9E8F', 700, 'left')
  ctx.font = `700 7px ${FONT}`
  const shift = ctx.measureText(`+${stats.linesAdded ?? 0} `).width
  label(`−${stats.linesRemoved ?? 0}`, left + shift, b.y + 15, 7, '#E5484D', 700, 'left')
  if (typeof kroner === 'number') label(kr(kroner), left, b.y + 24, 7, '#3E7CC9', 700, 'left')
}

// A wall clock in the kitchen showing the time it is.
export const clock = date => {
  const room = firstRoom('kitchen')
  if (!room || !isBuilt(room)) return
  const { x, y } = at(room, typeOf(room).clock)
  const r = typeOf(room).clock.r
  circle(x, y, r + 1, OUTLINE)
  circle(x, y, r, '#FFFFFF')
  for (let i = 0; i < 12; i += 3) {
    const a = (i / 12) * Math.PI * 2
    rect(x + Math.sin(a) * (r - 1.5) - 0.5, y - Math.cos(a) * (r - 1.5) - 0.5, 1, 1, '#8A94A0')
  }
  const hand = (turn, length, width, colour) => {
    const a = turn * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + Math.sin(a) * length, y - Math.cos(a) * length)
    ctx.lineWidth = width
    ctx.lineCap = 'round'
    ctx.strokeStyle = colour
    ctx.stroke()
  }
  const minutes = date.getMinutes() + date.getSeconds() / 60
  hand(((date.getHours() % 12) + minutes / 60) / 12, r * 0.5, 1.2, OUTLINE)
  hand(minutes / 60, r * 0.8, 0.8, OUTLINE)
  hand(date.getSeconds() / 60, r * 0.85, 0.4, '#E5484D')
}

// A green watering can in Claude's hand, tipped at the plant, with drops
// falling `fall` units from the spout.
export const wateringCan = (x, y, t, fall = 14) => {
  rounded(x - 4, y - 4, 9, 7, 2, '#4C9A60', OUTLINE, 1)
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.moveTo(x + 4, y - 1)
  ctx.lineTo(x + 10, y - 5)
  ctx.stroke()
  ctx.strokeStyle = '#4C9A60'
  ctx.lineWidth = 0.8
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(x - 1, y - 5, 3, Math.PI, 0)
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = 1
  ctx.stroke()
  for (let i = 0; i < 3; i++) {
    const k = ((t / 600 + i / 3) % 1)
    ctx.globalAlpha = 1 - k
    rect(x + 10 + k * 5, y - 4 + k * fall, 1.2, 2, '#7DC3F0')
  }
  ctx.globalAlpha = 1
}

// On an Explore helper's desk: a magnifying glass.
export const magnifier = (x, y) => {
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = 2.6
  ctx.beginPath()
  ctx.moveTo(x + 2.5, y + 2.5)
  ctx.lineTo(x + 7, y + 7)
  ctx.stroke()
  ctx.strokeStyle = '#8B5E3C'
  ctx.lineWidth = 1.6
  ctx.stroke()
  circle(x, y, 3.6, '#D7E9FA', OUTLINE)
  rect(x - 1.8, y - 1.8, 1.4, 1.4, '#FFFFFF')
}

// On a Plan helper's desk: a roll of plans, blue, half unrolled.
export const blueprint = (x, y) => {
  rounded(x - 7, y - 3, 12, 8, 1, '#3D74B8', OUTLINE, 1)
  for (const dy of [-1, 1.5]) rect(x - 5, y + dy, 8, 0.6, '#BFD6F2')
  rect(x - 3, y - 2, 0.6, 6, '#BFD6F2')
  rounded(x + 4, y - 4, 4, 10, 2, '#5A8BD0', OUTLINE, 1)
}

// On Claude's desk, what is left of the session's limits, as things: a glass
// coffee pot that empties as the five-hour limit is used (`left` 0 to 1, null
// when not known: full), and a plant that wilts as the context fills
// (`health` 0 to 1, null: well).
export const coffeePot = (x, y, left) => {
  const k = left === null ? 1 : Math.max(0, Math.min(1, left))
  rounded(x - 1, y - 1, 10, 13, 2, OUTLINE)
  rect(x, y, 8, 11, '#D4E3E9')
  rect(x, y + 11 - 9 * k, 8, 9 * k, '#6B3F25')
  rect(x, y, 8, 2, '#3E4852')
  rect(x + 8, y + 3, 2.5, 5, OUTLINE)
  rect(x + 1, y + 3, 1, 6, 'rgba(255, 255, 255, 0.6)')
}
export const deskPlant = (x, y, health) => {
  const k = health === null ? 1 : Math.max(0, Math.min(1, health))
  // Green when well, yellow, then brown; the leaves droop as it goes.
  const leaf = k > 0.5 ? '#3E8A55' : k > 0.25 ? '#B7A43A' : '#8B5E3C'
  const light = k > 0.5 ? '#6CC082' : k > 0.25 ? '#D9C55A' : '#A47A55'
  const droop = (1 - k) * 5
  rect(x - 3, y + 5, 7, 6, '#B5683E')
  rect(x - 3, y + 5, 7, 1.5, '#9C5A34')
  for (const [dx, side] of [[-3.5, -1], [0, 0], [3.5, 1]]) {
    circle(x + 0.5 + dx + side * droop * 0.6, y + 1 - (side === 0 ? 3 - droop : 1) + droop, 2.6, leaf, OUTLINE)
  }
  circle(x - 0.5, y - 1 + droop, 1.2, light)
}
