// ── Telling you when the page is not in view ────────────────────────────
// While Claude or a helper waits for you, the tab's title says so, and when
// Claude has finished a long turn it says ✅ until you look. With the bell
// turned on (the browser asks first), a notice pops up too, but only when
// the office's tab is hidden: in view, the page shows it already.
import { remember, remembered } from './util.js'

const TITLE = 'Agent-kontor'
const button = document.getElementById('notify')
const isSupported = typeof Notification !== 'undefined'
let isOn = isSupported && remembered('notify') === 'on'

const isAllowed = () => isSupported && Notification.permission === 'granted'

const render = () => {
  button.hidden = !isSupported
  if (!isSupported) return
  const isActive = isOn && isAllowed()
  button.textContent = isActive ? '🔔' : '🔕'
  button.ariaPressed = String(isActive)
  button.title =
    Notification.permission === 'denied'
      ? 'Browseren har blokeret beskeder fra kontoret. Det kan ændres i browserens indstillinger for siden.'
      : isActive
        ? 'Du får en besked, når nogen venter på dig, eller Claude er færdig med en lang opgave, og fanen er skjult. Klik for at slå det fra.'
        : 'Få en besked, når nogen venter på dig, eller Claude er færdig med en lang opgave, og fanen er skjult.'
}

button.addEventListener('click', async () => {
  if (!isSupported) return
  if (isOn && isAllowed()) isOn = false
  else {
    if (Notification.permission === 'default') await Notification.requestPermission().catch(() => null)
    isOn = isAllowed()
  }
  remember('notify', isOn ? 'on' : 'off')
  render()
})

// Finished while you were away: the title says so until the tab is seen.
let doneUnseen = null
document.addEventListener('visibilitychange', () => {
  if (document.hidden || !doneUnseen) return
  doneUnseen = null
  document.title = TITLE
})

// A notice for each new wait, and for Claude done with a long turn, while
// the tab is hidden.
const HEADS = { waiting: 'Claude venter på dig', done: 'Claude er færdig' }
export const notifyFor = events => {
  if (!document.hidden) return
  const done = events.find(x => x.kind === 'done')
  if (done) doneUnseen = done
  if (!isOn || !isAllowed()) return
  for (const e of events.filter(x => HEADS[x.kind])) {
    try {
      const notice = new Notification(HEADS[e.kind], { body: e.project ? `${e.project}: ${e.text}` : e.text, tag: `agent-kontor-${e.kind}` })
      notice.onclick = () => {
        window.focus()
        notice.close()
      }
    } catch {
      // Some browsers only allow notices from a service worker: the title still says it.
    }
  }
}

// The tab's title: a red dot and the count while anyone waits for you.
export const titleFor = state => {
  const waiting = (state.sessions ?? []).reduce((n, s) => n + (s.main?.state === 'waiting' ? 1 : 0) + (s.subs ?? []).filter(x => x.activity?.state === 'waiting').length, 0)
  document.title = waiting ? `🔴 ${waiting === 1 ? 'Venter på dig' : `${waiting} venter på dig`} · ${TITLE}` : doneUnseen ? `✅ Færdig · ${TITLE}` : TITLE
}

render()
