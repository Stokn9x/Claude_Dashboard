// ── The activity log ─────────────────────────────────────────────────────
// A small box at the bottom of the office: the latest thing that happened,
// or, opened, the last few with their times. Kept in this browser only, so
// a reload keeps the recent lines.
import { store } from './store.js'
import { el, remember, remembered } from './util.js'

const KEEP = 40
const SHOWN = 8
const ICONS = { session: '🏢', arrive: '🚪', deliver: '📦', stuck: '⚠️', confetti: '✅', rain: '🌧️', balloons: '🎈', waiting: '✋', bought: '🛠️', achievement: '🏅', bonus: '🔥', idle: '🌳', back: '↩️', home: '👋' }

const box = document.getElementById('feed')
const list = el('ol', { className: 'feed-list' }, [])
const toggle = el('button', { className: 'feed-head', type: 'button', ariaExpanded: 'false' }, [el('strong', {}, ['Aktivitet']), el('span', { className: 'feed-more' }, ['Vis flere'])])
box.replaceChildren(toggle, list)

let events = []
try {
  events = JSON.parse(remembered('feed') ?? '[]').slice(-KEEP)
} catch {}
let isOpen = remembered('feed-open') === 'yes'

const clockTime = at => new Date(at).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' })

const render = () => {
  box.hidden = events.length === 0
  box.classList.toggle('is-open', isOpen)
  toggle.ariaExpanded = String(isOpen)
  toggle.lastChild.textContent = isOpen ? 'Vis færre' : events.length > 1 ? 'Vis flere' : ''
  // With more than one session, each line says which project it is from.
  const isMixed = new Set(store.state.sessions.map(s => s.project)).size > 1
  list.replaceChildren(
    ...events
      .slice(isOpen ? -SHOWN : -1)
      .reverse()
      .map(e =>
        el('li', { className: `feed-item is-${e.kind}` }, [
          el('time', {}, [clockTime(e.at)]),
          el('span', { className: 'feed-icon', ariaHidden: 'true' }, [ICONS[e.kind] ?? '•']),
          el('span', { className: 'feed-text' }, [isMixed && e.project ? `${e.project}: ${e.text}` : e.text]),
        ]),
      ),
  )
}

toggle.addEventListener('click', () => {
  isOpen = !isOpen
  remember('feed-open', isOpen ? 'yes' : 'no')
  render()
})

export const addEvents = more => {
  if (!more.length) return
  events = [...events, ...more].slice(-KEEP)
  remember('feed', JSON.stringify(events))
  render()
}

render()
