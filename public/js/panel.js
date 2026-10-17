// ── The page around the picture ──────────────────────────────────────────
// The header (sessions, wellbeing, saldo, connection), the banner when
// someone waits for you, and the floating panel with who does what, the
// shop and the progress. Lists are rebuilt only when what they show
// changes: the state arrives several times a second, and a button rebuilt
// under the pointer would swallow the click.
import { store, focused } from './store.js'
import { stateColor } from './gfx.js'
import { el, kr, remember, remembered } from './util.js'
import { MAIN, desks, placeOf } from './plan.js'
import { claudeLook, lookFor, portraitOf } from './figures.js'
import { fit, glide } from './camera.js'
import { WALKS } from './routes.js'
import { renderShop, moodFace } from './shop.js'
import { renderProgress, announce } from './progress.js'

const tabs = document.getElementById('tabs')
const people = document.getElementById('people')
const alertBox = document.getElementById('alert')
const saldo = document.getElementById('saldo')
const saldoValue = document.getElementById('saldo-value')
const moodChip = document.getElementById('mood')
const side = document.getElementById('side')
const sideToggle = document.getElementById('side-toggle')
const sideOpen = document.getElementById('side-open')
const panelButtons = document.querySelectorAll('[data-panel]')
const sections = { people, shop: document.getElementById('shop'), progress: document.getElementById('progress') }

const dot = state => el('span', { className: 'dot', style: `background:${stateColor[state] ?? '#8A94A0'}` })

// What a state is called on its pill
const PILL = { reading: 'Læser', editing: 'Skriver', running: 'Kører', browsing: 'Nettet', waiting: 'Venter på dig', working: 'Arbejder', idle: 'Pause' }
const pill = (state, detail) => {
  const colour = stateColor[state] ?? '#8A94A0'
  const text = state === 'working' && detail === 'Tænker' ? 'Tænker' : PILL[state] ?? state
  return el('span', { className: 'pill', style: `color:${colour};background:color-mix(in srgb, ${colour} 16%, transparent)` }, [text])
}
// The heading says it already; the details need not say it again
const withoutWaiting = detail => detail.replace(/^Venter på dig:\s*/, '')

// ── The panel: which section, and open or folded away ───────────────────
// Showing a section opens the panel too, unless asked not to (on load).
export const showPanel = (name, isOpening = true) => {
  for (const button of panelButtons) button.ariaPressed = String(button.dataset.panel === name)
  for (const [key, section] of Object.entries(sections)) section.hidden = key !== name
  remember('panel', name)
  if (isOpening && side.hidden) setSide(true)
}
for (const button of panelButtons) button.addEventListener('click', () => showPanel(button.dataset.panel))

// Folding the panel away gives the office the whole window; the camera
// fits the office to the new free space.
const setSide = isOpen => {
  side.hidden = !isOpen
  sideOpen.hidden = isOpen
  remember('side', isOpen ? 'open' : 'closed')
  fit()
}
sideToggle.addEventListener('click', () => setSide(false))
sideOpen.addEventListener('click', () => setSide(true))
side.hidden = remembered('side') === 'closed'
sideOpen.hidden = !side.hidden
showPanel(['shop', 'progress'].includes(remembered('panel')) ? remembered('panel') : 'people', false)
moodChip.addEventListener('click', () => showPanel('shop'))

// Up close to whoever waits for you.
const lookAtWaiting = () => {
  const s = focused()
  if (!s) return
  if (s.main.state === 'waiting') return glide({ x: MAIN.cx, y: MAIN.dy - 10, zoom: 2.5 })
  const sub = (s.subs ?? []).find(x => x.activity.state === 'waiting')
  const h = sub && store.hits.find(x => x.kind === 'sub' && x.id === sub.id)
  if (h) glide({ x: (h.x0 + h.x1) / 2, y: (h.y0 + h.y1) / 2, zoom: 2.5 })
}

export const choose = key => {
  store.focusKey = key
  store.isChosen = true
  remember('focus', key)
  renderPage()
}

let tabsKey = ''
let peopleKey = ''
let alertKey = ''

const renderChips = () => {
  const g = store.state.game
  saldo.hidden = typeof g?.kroner !== 'number'
  if (!saldo.hidden) saldoValue.textContent = kr(g.kroner)
  const mood = g?.wellbeing
  moodChip.hidden = !mood
  if (mood) {
    moodChip.textContent = `${moodFace(mood.score)} ${mood.score}`
    moodChip.title = `Trivsel ${mood.score} af 100: arbejdet tjener ${String(mood.multiplier).replace('.', ',')} gange så meget. Klik for at se hvorfor.`
  }
}

// The tabs stand in the order the sessions started, oldest first: the server
// lists them by their latest write, which every heartbeat changes.
const byStart = (a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
const renderTabs = s => {
  const sessions = [...store.state.sessions].sort(byStart)
  const key = JSON.stringify([sessions.map(x => [x.key, x.project, x.main.state]), s?.key])
  if (key === tabsKey) return
  tabsKey = key
  tabs.replaceChildren(
    ...sessions.map(x => el('button', { className: 'tab', type: 'button', onclick: () => choose(x.key), ariaPressed: String(x === s), title: x.main.detail }, [dot(x.main.state), x.project || 'Session'])),
  )
}

// Waiting for you, in any session: a banner with a way there.
const renderAlert = s => {
  const waiting = [s, ...store.state.sessions.filter(x => x !== s)].filter(x => x && x.main.state === 'waiting')
  const waitingSubs = (s?.subs ?? []).filter(x => x.activity.state === 'waiting')
  const key = JSON.stringify([waiting.map(x => [x.key, x.main.detail]), waitingSubs.map(x => [x.id, x.activity.detail])])
  if (key === alertKey) return
  alertKey = key
  const lines = [...waiting.map(x => `Claude i ${x.project}: ${withoutWaiting(x.main.detail)}`), ...waitingSubs.map(x => `${x.name}: ${withoutWaiting(x.activity.detail)}`)]
  const wasHidden = alertBox.hidden
  alertBox.hidden = lines.length === 0
  alertBox.replaceChildren(
    el('strong', {}, [lines.length === 1 ? 'Venter på dig' : `${lines.length} venter på dig`]),
    el('p', {}, [lines.join(' · ')]),
    el('button', { type: 'button', onclick: lookAtWaiting }, ['Gå til']),
  )
  // On a narrow screen the banner takes room from the office.
  if (wasHidden !== alertBox.hidden) fit()
}

// When a helper off work goes home, in words: "går hjem om 2 min".
const homeIn = (sub, now = Date.now()) => {
  const minutes = Math.max(1, Math.ceil((sub.since + ({ ...WALKS, ...(focused()?.walks ?? {}) }).idle - now) / 60_000))
  return `Går hjem om ${minutes} min`
}

export const phaseLabel = (sub, onFloorFrom) =>
  sub.outcome === 'failed' && (sub.phase === 'delivering' || sub.phase === 'leaving')
    ? 'Gik i stå'
    : sub.phase === 'idle'
      ? homeIn(sub)
      : sub.phase === 'arriving'
      ? sub.from === 'idle'
        ? 'Tilbage på arbejde'
        : sub.from === 'handover'
          ? 'Tilbage til skrivebordet'
          : 'På vej ind'
      : sub.phase === 'delivering'
        ? 'Afleverer'
        : sub.phase === 'leaving'
          ? 'Går hjem'
          : sub.seat < 0
            ? 'Venter ved døren'
            : onFloorFrom !== undefined && sub.seat >= onFloorFrom
              ? placeOf(sub.seat).isOutside
                ? 'Venter på bænken'
                : 'Sidder på gulvet'
              : null

const person = ({ key, name, look, state, detail, note, isClaude }) =>
  el('li', { className: `person${isClaude ? ' is-claude' : ''}${state === 'waiting' ? ' is-waiting' : ''}` }, [
    el('img', { src: portraitOf(key, look), alt: '' }),
    el('span', { className: 'name' }, [name]),
    pill(state, detail),
    // The pill says it waits; the line says what for
    el('span', { className: 'what' }, [withoutWaiting(detail)]),
    ...(note ? [el('span', { className: 'note' }, [note])] : []),
  ])

const renderPeople = s => {
  if (!s) {
    if (peopleKey === 'empty') return
    peopleKey = 'empty'
    people.replaceChildren(
      el('li', { className: 'empty' }, [
        el('span', { className: 'big' }, ['🏢']),
        el('strong', {}, ['Kontoret er tomt']),
        el('span', {}, ['Når en Claude-session med Agent-kontor kører, sætter Claude sig her, og hjælperne kommer ind ad døren.']),
      ]),
    )
    return
  }
  const stats = s.stats ?? {}
  const facts = [
    stats.linesAdded || stats.linesRemoved ? `+${stats.linesAdded} −${stats.linesRemoved} linjer` : null,
    typeof stats.costUsd === 'number' ? `$${stats.costUsd.toFixed(2)}` : null,
    typeof stats.fiveHour === 'number' ? `${Math.round(stats.fiveHour)} % af 5-timers-grænsen` : null,
    typeof stats.context === 'number' ? `kontekst ${Math.round(stats.context)} %` : null,
  ].filter(Boolean)
  // Those waiting for you first, then the rest as they came in
  const subs = [...(s.subs ?? [])].sort((a, b) => (b.activity.state === 'waiting') - (a.activity.state === 'waiting') || a.seat - b.seat)
  const onFloorFrom = desks().length
  // The minute is in it too: "går hjem om 2 min" counts down.
  const key = JSON.stringify([s.key, s.main, facts, Math.floor(Date.now() / 60_000), subs.map(x => [x.id, x.name, x.task, x.phase, x.from, x.outcome, x.activity, x.seat >= onFloorFrom])])
  if (key === peopleKey) return
  peopleKey = key
  people.replaceChildren(
    person({ key: 'claude', name: 'Claude', look: claudeLook, state: s.main.state, detail: s.main.detail, note: facts.join(' · ') || null, isClaude: true }),
    ...(subs.length ? [el('li', { className: 'section-label' }, [`Hjælpere · ${subs.length}`])] : []),
    ...subs.map(sub =>
      person({ key: sub.id, name: sub.name, look: lookFor(sub.id), state: sub.activity.state, detail: sub.activity.detail, note: [sub.task, phaseLabel(sub, onFloorFrom)].filter(Boolean).join(' · ') }),
    ),
  )
}

export const renderPage = () => {
  const s = focused()
  renderShop()
  renderProgress()
  announce()
  renderChips()
  renderTabs(s)
  renderAlert(s)
  renderPeople(s)
}
