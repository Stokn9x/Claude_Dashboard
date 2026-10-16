// ── The details card ─────────────────────────────────────────────────────
// Click a figure to see what it is doing; the card follows it round the
// office. Click a sign to buy what it offers.
import { store, focused } from './store.js'
import { canvas, stateColor } from './gfx.js'
import { el } from './util.js'
import { freeArea, hitAt, pixelsPerUnit, toScreen, wasDrag } from './camera.js'
import { phaseLabel, showPanel, choose } from './panel.js'
import { buyItem } from './shop.js'
import { TEMPER_TEXT, temperOf } from './voices.js'

const card = document.getElementById('card')

const ago = (now, at) => {
  const minutes = Math.floor((now - at) / 60_000)
  if (minutes < 1) return 'under et minut'
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} t ${minutes % 60} min`
}
const clockTime = at => new Date(at).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' })

// Who the card is about, as the newest state says; null once they are gone.
const subject = () => {
  const s = focused()
  const selected = store.selected
  if (!selected || !s) return null
  if (selected.kind === 'claude') {
    const stats = s.stats ?? {}
    return {
      name: 'Claude',
      task: s.project,
      activity: s.main,
      startedAt: s.startedAt,
      tools: stats.tools,
      linesAdded: stats.linesAdded,
      linesRemoved: stats.linesRemoved,
      note: typeof stats.costUsd === 'number' ? `$${stats.costUsd.toFixed(2)} i denne session` : null,
      recent: stats.recent,
    }
  }
  const sub = (s.subs ?? []).find(x => x.id === selected.id)
  return sub ? { ...sub, note: phaseLabel(sub), temper: TEMPER_TEXT[temperOf(sub.name)] } : null
}

const dot = state => el('span', { className: 'dot', style: `background:${stateColor[state] ?? '#8A94A0'}` })

export const renderCard = () => {
  const who = subject()
  if (!who) {
    store.selected = null
    card.hidden = true
    return
  }
  const now = Date.now()
  const facts = [
    who.startedAt ? `I gang i ${ago(now, who.startedAt)}` : null,
    typeof who.tools === 'number' ? `${who.tools} ${who.tools === 1 ? 'værktøj' : 'værktøjer'}` : null,
    who.linesAdded || who.linesRemoved ? `+${who.linesAdded ?? 0} −${who.linesRemoved ?? 0} linjer` : null,
    who.temper ? `${who.temper} type` : null,
  ].filter(Boolean)
  const steps = [...(who.recent ?? [])].reverse()
  card.replaceChildren(
    el('div', { className: 'card-head' }, [
      dot(who.activity.state),
      el('strong', {}, [who.name]),
      el('button', { className: 'card-close', type: 'button', ariaLabel: 'Luk', onclick: () => select(null) }, ['×']),
    ]),
    ...(who.task ? [el('div', { className: 'card-task' }, [who.task])] : []),
    el('div', { className: 'card-now', style: `color:${stateColor[who.activity.state] ?? 'inherit'}` }, [who.activity.detail]),
    ...(who.note ? [el('div', { className: 'card-note' }, [who.note])] : []),
    ...(facts.length ? [el('div', { className: 'card-facts' }, [facts.join(' · ')])] : []),
    ...(steps.length
      ? [el('div', { className: 'card-label' }, ['Seneste']), el('ol', { className: 'card-steps' }, steps.map(step => el('li', {}, [el('time', {}, [clockTime(step.at)]), step.detail])))]
      : []),
  )
  card.hidden = false
  placeCard()
}

// Beside the figure, in the free part of the window; under or over it when
// there is no room beside it.
export const placeCard = () => {
  const selected = store.selected
  const h = selected && store.hits.find(x => x.kind === selected.kind && x.id === selected.id)
  if (!h || card.hidden) return
  const free = freeArea()
  const k = pixelsPerUnit()
  const topLeft = toScreen(h.x0, h.y0)
  const w = (h.x1 - h.x0) * k
  const hgt = (h.y1 - h.y0) * k
  const cw = card.offsetWidth
  const ch = card.offsetHeight
  const right = topLeft.x + w + 8
  const left = topLeft.x - cw - 8
  let x
  let y
  if (right + cw <= free.x + free.w) [x, y] = [right, topLeft.y]
  else if (left >= free.x) [x, y] = [left, topLeft.y]
  else {
    x = topLeft.x + w / 2 - cw / 2
    const below = topLeft.y + hgt + 6
    y = below + ch <= free.y + free.h ? below : topLeft.y - ch - 6
  }
  x = Math.max(free.x + 4, Math.min(x, free.x + free.w - cw - 4))
  y = Math.max(free.y + 4, Math.min(y, free.y + free.h - ch - 4))
  card.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`
}

export const select = next => {
  store.selected = next
  renderCard()
}

canvas.addEventListener('click', e => {
  // The end of a drag is no click.
  if (wasDrag()) return
  const h = hitAt(e)
  if (h?.kind === 'session') {
    select(null)
    choose(h.id)
  } else if (h?.kind === 'shop') {
    select(null)
    showPanel('shop')
    const game = store.state.game
    if ((game?.kroner ?? 0) >= (game?.next?.[h.id] ?? Infinity)) void buyItem(h.id)
  } else {
    const selected = store.selected
    select(h && !(selected && selected.kind === h.kind && selected.id === h.id) ? { kind: h.kind, id: h.id } : null)
  }
})
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') select(null)
})
// Times move on: the card's "I gang i" with them.
setInterval(() => store.selected && renderCard(), 1000)
