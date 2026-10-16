// ── Tv mode ──────────────────────────────────────────────────────────────
// For a screen of its own: the whole window is the office, no panel, log or
// map, and the camera follows what happens. Whoever waits for you first;
// then a helper on its way in or with a result; else it goes round those at
// work, a few seconds each; with nobody, the whole office. Moving the camera
// yourself pauses the following for a while. 📺 in the header, or T, turns
// it on and off; Esc or leaving full screen turns it off.
import { store, focused } from './store.js'
import { canvas } from './gfx.js'
import { glide, goHome } from './camera.js'

const button = document.getElementById('tv')
const FOLLOW_MS = 1000
const TURN_MS = 7000
const HANDS_OFF_MS = 20_000
const ZOOM = 1.9
let isOn = false
let handsOnAt = -Infinity

const set = on => {
  isOn = on
  document.body.classList.toggle('tv', on)
  button.ariaPressed = String(on)
  button.title = on ? 'Afslut tv-tilstand (T eller Esc)' : 'Tv-tilstand: fuld skærm, og kameraet følger det, der sker (T)'
  if (on && !document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {})
  if (!on && document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
  if (!on) goHome()
}

// Who the camera should be on now: a hit box's id, or null for everyone.
const focusNow = now => {
  const s = focused()
  if (!s) return null
  const subs = s.subs ?? []
  if (s.main?.state === 'waiting') return 'claude'
  const waiting = subs.find(x => x.activity?.state === 'waiting')
  if (waiting) return waiting.id
  const moving = subs.find(x => x.phase === 'delivering' || x.phase === 'arriving')
  if (moving) return moving.id
  const busy = subs.filter(x => x.phase === 'working')
  if (busy.length) return busy[Math.floor(now / TURN_MS) % busy.length].id
  return s.main?.state && s.main.state !== 'idle' ? 'claude' : null
}

setInterval(() => {
  if (!isOn || Date.now() - handsOnAt < HANDS_OFF_MS) return
  const id = focusNow(Date.now())
  const hit = id && store.hits.find(h => h.id === id)
  if (!hit) return goHome()
  glide({ x: (hit.x0 + hit.x1) / 2, y: (hit.y0 + hit.y1) / 2, zoom: ZOOM })
}, FOLLOW_MS)

button.hidden = false
button.textContent = '📺'
button.addEventListener('click', () => set(!isOn))
document.addEventListener('keydown', e => {
  if (e.target instanceof HTMLElement && e.target.closest('input, textarea, select, [contenteditable]')) return
  if ((e.key === 't' || e.key === 'T') && !e.ctrlKey && !e.metaKey && !e.altKey) set(!isOn)
  else if (e.key === 'Escape' && isOn) set(false)
})
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && isOn) set(false)
})
for (const kind of ['pointerdown', 'wheel']) canvas.addEventListener(kind, () => (handsOnAt = Date.now()), { passive: true })
set(false)
