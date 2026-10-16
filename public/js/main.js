// Agent-kontor: the office, drawn and animated on a canvas that fills the
// window. The server sends what each session's status file says; this page
// works out every step of every walk from those timestamps, so nothing
// reloads and nothing stutters. This file starts it all and keeps it fed.
import { store } from './store.js'
import { fit } from './camera.js'
import { draw } from './scene.js'
import { renderPage } from './panel.js'
import { placeCard, renderCard } from './card.js'
import { onBought } from './shop.js'

const conn = document.getElementById('conn')
const lostBanner = document.getElementById('lost')

onBought(renderPage)

const receive = next => {
  store.state = next
  if (store.selected) renderCard()
  // A session picked by hand stays in view while it lives. Until then the
  // view follows the work: away from a session on a break to one that isn't.
  const sessions = store.state.sessions
  const current = sessions.find(x => x.key === store.focusKey)
  const busy = sessions.find(x => x.main.state !== 'idle')
  if (!current) store.focusKey = (busy ?? sessions[0])?.key ?? null
  else if (!store.isChosen && current.main.state === 'idle' && busy) store.focusKey = busy.key
  renderPage()
}

const setConnection = (className, text) => {
  conn.className = `conn ${className}`
  conn.title = text
  conn.ariaLabel = text
  lostBanner.hidden = className !== 'lost'
}

const connect = () => {
  const events = new EventSource('/api/events')
  events.onopen = () => setConnection('live', 'Forbundet til kontoret')
  events.onmessage = e => receive(JSON.parse(e.data))
  // The browser tries again by itself every two seconds; a session that has
  // the office open starts the server again within a minute.
  events.onerror = () => setConnection('lost', 'Forbindelsen er tabt')
}

const frame = () => {
  draw()
  placeCard()
  requestAnimationFrame(frame)
}

fit()
new ResizeObserver(fit).observe(document.body)
new ResizeObserver(fit).observe(document.getElementById('side'))
// Dragged to a screen with another pixel density: draw sharp for that one.
window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener('change', fit)
renderPage()
requestAnimationFrame(frame)
connect()
