// ── The shop ─────────────────────────────────────────────────────────────
// What you have, what the next thing costs, how kroner are earned. The
// server holds the prices and the money; a buy is asked of it. Built once
// and then only updated: a button rebuilt under the pointer would swallow
// the click.
import { store, focused } from './store.js'
import { el, kr } from './util.js'
import { CHAINS, ITEMS } from './plan.js'
import { eventsBetween } from './activity.js'
import { addEvents } from './feed.js'
import { L } from './i18n.js'

const shop = document.getElementById('shop')
let shopMessage = ''
let isBuying = false
let parts = null
// Told by main.js what to redraw once a buy is answered.
let afterBuy = () => {}
export const onBought = fn => {
  afterBuy = fn
}

// A row is one thing, or a room that grows: then it offers the next step.
const GROUPS = [
  [L('Pladser og rum', 'Seats and rooms'), ['desk', CHAINS.team, CHAINS.kitchen, CHAINS.lounge, CHAINS.toilet, 'meeting', 'reception', 'pingpong']],
  [L('Pynt og opgraderinger', 'Decor and upgrades'), ['plants', 'rugs', 'cat', 'art', 'neon', 'espresso', 'aquarium', 'chairs', 'screens']],
]
// A chain's step now: the first not bought, or its last once all are.
const stepNow = (steps, g) => steps.find(item => !g.owned.rooms.includes(item)) ?? steps[steps.length - 1]
const RATE_TEXT = {
  added: L('linje tilføjet', 'line added'),
  removed: L('linje fjernet', 'line removed'),
  delivered: L('opgave afleveret af en hjælper', 'task handed over by a helper'),
  tests: L('grønne tests (højst hvert 10. minut)', 'green tests (at most every 10 minutes)'),
  commits: 'commit',
  prs: 'pull request',
}
export const moodFace = score => (score < 35 ? '😟' : score < 60 ? '🙂' : '😄')
const decimal = n => L(String(n).replace('.', ','), String(n))

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
    shopMessage = res.ok ? (item === 'desk' ? L('Købt! Den næste hjælper uden plads sætter sig ved det.', 'Bought! The next helper without a seat will sit there.') : L(`Købt! ${ITEMS[item]?.name ?? 'Det'} bliver bygget nu.`, `Bought! ${ITEMS[item]?.name ?? 'It'} is being built now.`)) : answer.error ?? L('Det gik ikke', 'That did not work')
  } catch {
    shopMessage = L('Kontoret svarer ikke lige nu', 'The office is not answering right now')
  }
  isBuying = false
  afterBuy()
}

const buildShop = g => {
  const saldoValue = el('strong', {}, [''])
  const message = el('p', { className: 'shop-message', hidden: true }, [''])
  const rows = GROUPS.flatMap(([, items]) => items).map(entry => {
    const steps = [entry].flat()
    const item = stepNow(steps, g)
    const count = el('span', { className: 'item-count' }, [''])
    const row = { steps, item }
    const button = el('button', { className: 'buy', type: 'button', onclick: () => buyItem(row.item) }, [''])
    const missing = el('p', { className: 'hint' }, [''])
    const done = el('p', { className: 'owned' }, [''])
    const fill = el('span', {}, [])
    const progress = el('span', { className: 'progress' }, [fill])
    const icon = el('span', { className: 'icon', ariaHidden: 'true' }, [ITEMS[item].icon ?? '📦'])
    const name = el('strong', {}, [ITEMS[item].name])
    const about = el('p', { className: 'hint' }, [ITEMS[item].about])
    const li = el('li', { className: 'item' }, [icon, el('div', { className: 'item-head' }, [name, count]), about, progress, button, missing, done])
    return Object.assign(row, { entry, li, icon, name, about, count, button, missing, done, progress, fill })
  })
  const rates = Object.entries(g.rates ?? {}).map(([k, v]) => el('li', {}, [el('span', { className: 'rate' }, [`${decimal(v)} kr`]), RATE_TEXT[k] ?? k]))
  const moodScore = el('strong', {}, [''])
  const moodBar = el('span', { className: 'mood-fill' }, [])
  const moodNote = el('p', { className: 'hint' }, [''])
  const moodParts = el('ul', { className: 'mood-parts' }, [])
  shop.replaceChildren(
    el('div', { className: 'shop-saldo' }, [el('span', { className: 'coin', ariaHidden: 'true' }, []), saldoValue, el('span', { className: 'hint' }, [L('til at bygge for', 'to build with')])]),
    message,
    el('section', { className: 'mood-box' }, [el('div', { className: 'item-head' }, [el('strong', {}, [L('Trivsel', 'Wellbeing')]), moodScore]), el('span', { className: 'mood-bar' }, [moodBar]), moodNote, moodParts]),
    ...GROUPS.flatMap(([title, items]) => [el('h3', {}, [title]), el('ul', { className: 'items' }, rows.filter(r => items.includes(r.entry)).map(r => r.li))]),
    el('h3', {}, [L('Sådan tjener du kroner', 'How you earn kroner')]),
    el('ul', { className: 'rates' }, rates),
  )
  return { saldoValue, message, rows, moodScore, moodBar, moodNote, moodParts }
}

const renderMood = (p, mood) => {
  p.moodScore.textContent = `${moodFace(mood.score)} ${mood.score}`
  p.moodBar.style.width = `${mood.score}%`
  p.moodBar.style.background = mood.score < 35 ? '#E5484D' : mood.score < 60 ? '#D6A23C' : '#2E9E8F'
  p.moodNote.textContent = L(
    `Arbejdet tjener ${decimal(mood.multiplier)} gange så meget. Rum og inventar hæver trivslen, hjælpere på gulvet sænker den.`,
    `Work earns ${decimal(mood.multiplier)} times as much. Rooms and furnishings raise wellbeing; helpers on the floor lower it.`,
  )
  const key = JSON.stringify(mood.parts)
  if (p.moodParts.dataset.key === key) return
  p.moodParts.dataset.key = key
  p.moodParts.replaceChildren(
    ...mood.parts.map(part =>
      el('li', {}, [
        el('span', { className: part.points < 0 ? 'minus' : 'plus' }, [`${part.points > 0 ? '+' : ''}${part.points}`]),
        part.what === 'floor' ? L(`${part.count} på gulvet`, `${part.count} on the floor`) + (part.project && part.project !== focused()?.project ? ` ${L('i', 'in')} ${part.project}` : '') : ITEMS[part.what]?.name ?? part.what,
      ]),
    ),
  )
}

export const renderShop = () => {
  const g = store.state.game
  if (!g) {
    parts = null
    shop.replaceChildren(el('p', { className: 'empty' }, [L('Butikken åbner, når kontoret er forbundet.', 'The shop opens once the office is connected.')]))
    return
  }
  parts ??= buildShop(g)
  const p = parts
  p.saldoValue.textContent = kr(g.kroner)
  if (g.wellbeing) renderMood(p, g.wellbeing)
  p.message.hidden = !shopMessage
  p.message.textContent = shopMessage
  for (const row of p.rows) {
    // A room that grows shows its next step, named as such
    const item = stepNow(row.steps, g)
    if (item !== row.item) {
      row.item = item
      row.icon.textContent = ITEMS[item].icon ?? '📦'
      row.name.textContent = ITEMS[item].name
      row.about.textContent = ITEMS[item].about
    }
    const price = g.next?.[row.item]
    const isForSale = typeof price === 'number'
    const canAfford = isForSale && g.kroner >= price
    const isDesk = row.item === 'desk'
    const stepsOwned = row.steps.filter(step => g.owned.rooms.includes(step)).length
    row.count.textContent = isDesk ? L(`${g.owned.desks} af ${g.maxDesks}`, `${g.owned.desks} of ${g.maxDesks}`) : row.steps.length > 1 ? L(`${stepsOwned} af ${row.steps.length}`, `${stepsOwned} of ${row.steps.length}`) : ''
    row.button.hidden = !isForSale
    row.button.disabled = !canAfford || isBuying
    row.button.textContent = isBuying ? L('Køber…', 'Buying…') : isForSale ? L(`${isDesk ? `Køb nr. ${g.owned.desks + 1}` : 'Køb'} for ${kr(price)}`, `${isDesk ? `Buy no. ${g.owned.desks + 1}` : 'Buy'} for ${kr(price)}`) : ''
    row.missing.hidden = !isForSale || canAfford
    row.missing.textContent = isForSale ? L(`Mangler ${kr(Math.max(0, price - g.kroner))}`, `${kr(Math.max(0, price - g.kroner))} to go`) : ''
    row.done.hidden = isForSale
    const isOwned = isDesk || g.owned.rooms.includes(row.item)
    const needs = ITEMS[row.item].needs
    row.done.textContent = !isOwned && needs
      ? L(`Kan købes, når ${ITEMS[needs].name.toLowerCase()}n er bygget.`, `Can be bought once the ${ITEMS[needs].name.toLowerCase()} is built.`)
      : isDesk
      ? g.owned.desks >= 22
        ? L('Alle 22 skriveborde er købt.', 'All 22 desks are bought.')
        : L(`Alle ${g.maxDesks} skriveborde er købt. Udvid et teamrum for tre mere.`, `All ${g.maxDesks} desks are bought. Expand a team room for three more.`)
      : row.steps.length > 1 && stepsOwned === row.steps.length
        ? L('Fuldt udbygget ✓', 'Fully built ✓')
        : L('Ejet ✓', 'Owned ✓')
    row.li.classList.toggle('is-owned', !isForSale && isOwned)
    row.progress.hidden = !isForSale || canAfford
    row.fill.style.width = isForSale ? `${Math.min(100, (100 * g.kroner) / price)}%` : '0%'
  }
}
