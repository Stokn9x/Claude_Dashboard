// ── For sale and building work ───────────────────────────────────────────
// What the shop has on offer, where it is: an outline on the floor for a desk
// or a piece of furniture, a sign over a lot, and for ten seconds after a
// purchase the scaffolding and the hammer, then confetti.

// How long the builders work, and how long the confetti lasts after
const BUILD_MS = 10_000
const PARTY_AFTER_MS = 5000
import { store, owns } from './store.js'
import { FONT, OUTLINE, ctx, dashed, label, legibly, readable, rect, rounded, tag } from './gfx.js'
import { kr } from './util.js'
import { ITEMS, PLAN, at, deskSlots, isBuilt, lotOf, nextStepOf, rectOf, stepArea, typeOf } from './plan.js'
import { party } from './party.js'
import { L } from './i18n.js'

// What is for sale right now, and where its sign stands: a lot's centre (a
// room, or the next step of one that grows), the spot a piece of furniture
// will take, or the next desk.
export const forSaleNow = list => {
  const game = store.state.game
  if (!game) return []
  const sales = []
  const slots = deskSlots()
  if (typeof game.next?.desk === 'number' && list.length < slots.length) {
    const { cx, dy } = slots[list.length]
    sales.push({ item: 'desk', price: game.next.desk, isDesk: true, x: cx, y: dy })
  }
  const lotSale = (item, lot) => {
    const price = game.next?.[item]
    if (typeof price === 'number') sales.push({ item, price, x: lot.x + lot.w / 2, y: lot.y + lot.h / 2 })
  }
  for (const room of PLAN.rooms) {
    if (room.until) continue
    if (room.buy && !isBuilt(room)) lotSale(room.buy, rectOf(room))
    const step = isBuilt(room) && nextStepOf(room)
    if (step && typeof step.buy === 'string') lotSale(step.buy, lotOf(room, step))
    for (const [item, spot] of Object.entries(typeOf(room).items ?? {})) {
      const price = game.next?.[item]
      if (!owns(item) && typeof price === 'number') sales.push({ item, price, isFurniture: true, ...at(room, spot) })
    }
  }
  return sales.map(sale => ({ ...sale, canAfford: game.kroner >= sale.price }))
}

// The outline on the floor where a desk or a piece of furniture will stand.
export const drawSaleOutlines = (sales, hits) => {
  for (const sale of sales) {
    if (sale.isDesk) {
      dashed(sale.x - 42, sale.y - 18, 84, 48, 4, 'rgba(255,255,255,0.18)', sale.canAfford ? '#2E9E8F' : '#8A94A0')
      hits.push({ kind: 'shop', id: 'desk', x0: sale.x - 44, y0: sale.y - 40, x1: sale.x + 44, y1: sale.y - 20 })
    } else if (sale.isFurniture) {
      dashed(sale.x - 34, sale.y - 14, 68, 28, 4, 'rgba(255,255,255,0.18)', sale.canAfford ? '#2E9E8F' : '#8A94A0')
    }
  }
}

// A lot's sign, in the colours of the panel beside the office: the room's
// icon and name, the price, and either a call to build or how much is
// missing, with a bar towards the price. Its box, in world units, for the
// click.
const SIGN_TEXT = 9
const lotSign = (sale, kroner, t) => {
  const item = ITEMS[sale.item]
  const missing = Math.max(0, sale.price - kroner)
  const k = readable(SIGN_TEXT, 12) / SIGN_TEXT
  let box = null
  legibly(sale.x, sale.y, SIGN_TEXT, 12, (cx, cy) => {
    ctx.font = `700 9px ${FONT}`
    const nameW = ctx.measureText(item.name).width + 20
    ctx.font = `800 11px ${FONT}`
    const priceW = ctx.measureText(kr(sale.price)).width
    const w = Math.round(Math.max(112, nameW + 22, priceW + 30))
    const h = 58
    const x = cx - w / 2
    const y = cy - h / 2
    // A soft shadow, the card, and a border that glows when it can be bought
    ctx.globalAlpha = 0.35
    rounded(x + 2, y + 3, w, h, 7, '#000000')
    ctx.globalAlpha = 0.94
    rounded(x, y, w, h, 7, '#1B2433', sale.canAfford ? '#2E9E8F' : '#3E4852', sale.canAfford ? 1.6 + 0.6 * Math.sin(t / 260) : 1.2)
    ctx.globalAlpha = 1
    ctx.font = `12px ${FONT}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(item.icon, x + 9, y + 18)
    label(item.name, x + 29, y + 16, 9, '#E9EEF2', 700, 'left')
    label(kr(sale.price), x + 10, y + 33, 11, sale.canAfford ? '#F2C14E' : '#C9CED3', 800, 'left')
    if (sale.canAfford) {
      rounded(x + 9, y + 39, w - 18, 13, 6.5, '#2E9E8F')
      label(L('Klik for at bygge', 'Click to build'), cx, y + 48.5, 7.5, '#FFFFFF', 700)
    } else {
      rounded(x + 10, y + 40, w - 20, 4, 2, '#2B2F36')
      rounded(x + 10, y + 40, (w - 20) * Math.min(1, kroner / sale.price), 4, 2, '#D6A23C')
      label(L(`Mangler ${kr(missing)}`, `${kr(missing)} to go`), x + 10, y + 53, 7, '#8A94A0', 600, 'left')
    }
    box = { x0: sale.x - (w / 2) * k, y0: sale.y - (h / 2) * k, x1: sale.x + (w / 2) * k, y1: sale.y + (h / 2) * k }
  })
  return box
}

// The signs with the prices, drawn above everyone so they are never hidden.
export const drawSaleSigns = (sales, hits, t) => {
  const kroner = store.state.game?.kroner ?? 0
  for (const sale of sales) {
    const bob = sale.canAfford ? Math.sin(t / 300 + sale.x) : 0
    if (sale.isDesk) {
      tag(sale.x, sale.y - 32 + bob, sale.canAfford ? L(`Køb skrivebord: ${kr(sale.price)}`, `Buy desk: ${kr(sale.price)}`) : L(`Skrivebord: ${kr(sale.price)}`, `Desk: ${kr(sale.price)}`), sale.canAfford ? '#2E9E8F' : '#5B6672')
      continue
    }
    if (sale.isFurniture) {
      tag(sale.x, sale.y - 6 + bob, `${ITEMS[sale.item].name}: ${kr(sale.price)}`, sale.canAfford ? '#2E9E8F' : '#5B6672')
      hits.push({ kind: 'shop', id: sale.item, x0: sale.x - 46, y0: sale.y - 12, x1: sale.x + 46, y1: sale.y + 18 })
      continue
    }
    const box = lotSign(sale, kroner, t)
    if (box) hits.push({ kind: 'shop', id: sale.item, ...box })
  }
}

// Where a bought thing stands, to put up the scaffolding.
const areaOf = item => {
  for (const room of PLAN.rooms) {
    if (room.until) continue
    // A room goes up without its steps, which go up when they are bought
    if (room.buy === item) return { x: room.x, y: room.y, w: room.w ?? typeOf(room).w, h: room.h ?? typeOf(room).h }
    const step = stepArea(room, item)
    if (step && room.grows.some(s => s.buy === item)) return step
    const spot = typeOf(room).items?.[item]
    if (spot) {
      const p = at(room, spot)
      return { x: p.x - 44, y: p.y - 18, w: 88, h: 36 }
    }
  }
  return null
}

// For ten seconds after a purchase: scaffolding over the spot, a progress
// bar and the word; then confetti over the new thing.
export const construction = (now, t) => {
  for (const bought of store.state.game?.bought ?? []) {
    if (bought.item === 'desk') continue
    const age = now - bought.at
    const area = areaOf(bought.item)
    if (!area || age < 0 || age > BUILD_MS + PARTY_AFTER_MS) continue
    const name = ITEMS[bought.item]?.name ?? L('Nyt', 'New')
    const cx = area.x + area.w / 2
    const cy = area.y + area.h / 2
    if (age >= BUILD_MS) {
      party({ kind: 'confetti', label: L(`${name} er klar!`, `${name} is ready!`), at: t - (age - BUILD_MS) }, { cx, dy: cy + 30 }, t)
      continue
    }
    ctx.save()
    ctx.beginPath()
    ctx.rect(area.x, area.y, area.w, area.h)
    ctx.clip()
    ctx.fillStyle = 'rgba(214, 162, 60, 0.18)'
    ctx.fillRect(area.x, area.y, area.w, area.h)
    ctx.strokeStyle = 'rgba(139, 94, 60, 0.85)'
    ctx.lineWidth = 1.4
    for (let x = area.x - area.h; x < area.x + area.w; x += 12) {
      ctx.beginPath()
      ctx.moveTo(x, area.y + area.h)
      ctx.lineTo(x + area.h, area.y)
      ctx.stroke()
    }
    for (let y = area.y + 8; y < area.y + area.h; y += 18) rect(area.x, y, area.w, 2.5, '#8B5E3C')
    ctx.restore()
    tag(cx, cy - 12, L(`Bygger ${name.toLowerCase()} …`, `Building ${name.toLowerCase()} …`), '#AD7F26')
    rounded(cx - 30, cy + 2, 60, 6, 3, '#F6F1E4', OUTLINE, 1)
    rounded(cx - 29, cy + 3, 58 * Math.min(1, age / BUILD_MS), 4, 2, '#D6A23C')
    // A builder's hammer, going
    ctx.save()
    ctx.translate(cx + 38, cy + 4)
    ctx.rotate(Math.sin(t / 90) * 0.6)
    rect(-1, -9, 2, 10, '#8B5E3C')
    rect(-4, -12, 8, 4, '#5B6672')
    ctx.restore()
  }
}
