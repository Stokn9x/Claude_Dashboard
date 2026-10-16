// ── The shop ─────────────────────────────────────────────────────────────
// What you have, what the next thing costs, how kroner are earned. The
// server holds the prices and the money; a buy is asked of it. Built once
// and then only updated: a button rebuilt under the pointer would swallow
// the click.
import { store, focused } from './store.js'
import { el, kr } from './util.js'
import { ITEMS } from './plan.js'
import { eventsBetween } from './activity.js'
import { addEvents } from './feed.js'

const shop = document.getElementById('shop')
let shopMessage = ''
let isBuying = false
let parts = null
// Told by main.js what to redraw once a buy is answered.
let afterBuy = () => {}
export const onBought = fn => {
  afterBuy = fn
}

const GROUPS = [
  ['Pladser og rum', ['desk', 'kitchen', 'toilet', 'lounge', 'pingpong', 'meeting', 'reception', 'hobby', 'team2']],
  ['Pynt og opgraderinger', ['plants', 'art', 'neon', 'espresso', 'aquarium', 'chairs', 'screens']],
]
const RATE_TEXT = { added: 'linje tilføjet', removed: 'linje fjernet', delivered: 'opgave afleveret af en hjælper', tests: 'grønne tests (højst hvert 10. minut)', commits: 'commit', prs: 'pull request' }
export const moodFace = score => (score < 35 ? '😟' : score < 60 ? '🙂' : '😄')
const decimal = n => String(n).replace('.', ',')

export const buyItem = async item => {
  if (isBuying || !store.state.token) return
  isBuying = true
  shopMessage = ''
  renderShop()
  try {
    const res = await fetch('/api/buy', { method: 'POST', headers: { 'content-type': 'application/json', 'x-kontor-token': store.state.token }, body: JSON.stringify({ item }) })
    const answer = await res.json()
    if (answer.game) {
      // The log hears of the purchase now; the next state from the server already has it.
      addEvents(eventsBetween(store.state, { ...store.state, game: answer.game }))
      store.state.game = answer.game
    }
    shopMessage = res.ok ? (item === 'desk' ? 'Købt! Den næste hjælper uden plads sætter sig ved det.' : `Købt! ${ITEMS[item]?.name ?? 'Det'} bliver bygget nu.`) : answer.error ?? 'Det gik ikke'
  } catch {
    shopMessage = 'Kontoret svarer ikke lige nu'
  }
  isBuying = false
  afterBuy()
}

const buildShop = g => {
  const saldoValue = el('strong', {}, [''])
  const message = el('p', { className: 'shop-message', hidden: true }, [''])
  const rows = GROUPS.flatMap(([, items]) => items).map(item => {
    const count = el('span', { className: 'item-count' }, [''])
    const button = el('button', { className: 'buy', type: 'button', onclick: () => buyItem(item) }, [''])
    const missing = el('p', { className: 'hint' }, [''])
    const done = el('p', { className: 'owned' }, [''])
    const fill = el('span', {}, [])
    const progress = el('span', { className: 'progress' }, [fill])
    const li = el('li', { className: 'item' }, [
      el('span', { className: 'icon', ariaHidden: 'true' }, [ITEMS[item].icon ?? '📦']),
      el('div', { className: 'item-head' }, [el('strong', {}, [ITEMS[item].name]), count]),
      el('p', { className: 'hint' }, [ITEMS[item].about]),
      progress,
      button,
      missing,
      done,
    ])
    return { item, li, count, button, missing, done, progress, fill }
  })
  const rates = Object.entries(g.rates ?? {}).map(([k, v]) => el('li', {}, [el('span', { className: 'rate' }, [`${decimal(v)} kr`]), RATE_TEXT[k] ?? k]))
  const moodScore = el('strong', {}, [''])
  const moodBar = el('span', { className: 'mood-fill' }, [])
  const moodNote = el('p', { className: 'hint' }, [''])
  const moodParts = el('ul', { className: 'mood-parts' }, [])
  shop.replaceChildren(
    el('div', { className: 'shop-saldo' }, [el('span', { className: 'coin', ariaHidden: 'true' }, []), saldoValue, el('span', { className: 'hint' }, ['til at bygge for'])]),
    message,
    el('section', { className: 'mood-box' }, [el('div', { className: 'item-head' }, [el('strong', {}, ['Trivsel']), moodScore]), el('span', { className: 'mood-bar' }, [moodBar]), moodNote, moodParts]),
    ...GROUPS.flatMap(([title, items]) => [el('h3', {}, [title]), el('ul', { className: 'items' }, rows.filter(r => items.includes(r.item)).map(r => r.li))]),
    el('h3', {}, ['Sådan tjener du kroner']),
    el('ul', { className: 'rates' }, rates),
  )
  return { saldoValue, message, rows, moodScore, moodBar, moodNote, moodParts }
}

const renderMood = (p, mood) => {
  p.moodScore.textContent = `${moodFace(mood.score)} ${mood.score}`
  p.moodBar.style.width = `${mood.score}%`
  p.moodBar.style.background = mood.score < 35 ? '#E5484D' : mood.score < 60 ? '#D6A23C' : '#2E9E8F'
  p.moodNote.textContent = `Arbejdet tjener ${decimal(mood.multiplier)} gange så meget. Rum og inventar hæver trivslen, hjælpere på gulvet sænker den.`
  const key = JSON.stringify(mood.parts)
  if (p.moodParts.dataset.key === key) return
  p.moodParts.dataset.key = key
  p.moodParts.replaceChildren(
    ...mood.parts.map(part =>
      el('li', {}, [
        el('span', { className: part.points < 0 ? 'minus' : 'plus' }, [`${part.points > 0 ? '+' : ''}${part.points}`]),
        part.what === 'floor' ? `${part.count} på gulvet${part.project && part.project !== focused()?.project ? ` i ${part.project}` : ''}` : ITEMS[part.what]?.name ?? part.what,
      ]),
    ),
  )
}

export const renderShop = () => {
  const g = store.state.game
  if (!g) {
    parts = null
    shop.replaceChildren(el('p', { className: 'empty' }, ['Butikken åbner, når kontoret er forbundet.']))
    return
  }
  parts ??= buildShop(g)
  const p = parts
  p.saldoValue.textContent = kr(g.kroner)
  if (g.wellbeing) renderMood(p, g.wellbeing)
  p.message.hidden = !shopMessage
  p.message.textContent = shopMessage
  for (const row of p.rows) {
    const price = g.next?.[row.item]
    const isForSale = typeof price === 'number'
    const canAfford = isForSale && g.kroner >= price
    const isDesk = row.item === 'desk'
    row.count.textContent = isDesk ? `${g.owned.desks} af ${g.maxDesks}` : ''
    row.button.hidden = !isForSale
    row.button.disabled = !canAfford || isBuying
    row.button.textContent = isBuying ? 'Køber…' : isForSale ? `${isDesk ? `Køb nr. ${g.owned.desks + 1}` : 'Køb'} for ${kr(price)}` : ''
    row.missing.hidden = !isForSale || canAfford
    row.missing.textContent = isForSale ? `Mangler ${kr(Math.max(0, price - g.kroner))}` : ''
    row.done.hidden = isForSale
    row.done.textContent = isDesk ? (g.owned.rooms.includes('team2') ? 'Alle seksten skriveborde er købt.' : 'Alle ti skriveborde er købt. Byg teamrum 2 for seks mere.') : 'Ejet ✓'
    row.li.classList.toggle('is-owned', !isForSale)
    row.progress.hidden = !isForSale || canAfford
    row.fill.style.width = isForSale ? `${Math.min(100, (100 * g.kroner) / price)}%` : '0%'
  }
}
