// ── Settings ─────────────────────────────────────────────────────────────
// A small panel under ⚙ in the header: the weather on or off (rain and snow;
// the seasons stay), and the tour once more. Kept in this browser. The game
// is always on: there is no switch for it (the user's decision).
import { el, remember, remembered } from './util.js'
import { showTour } from './welcome.js'

export const settings = { weather: remembered('weather') !== 'off' }

const button = document.getElementById('settings')
let box = null

const close = () => {
  box?.remove()
  box = null
  button.ariaExpanded = 'false'
}

const row = (name, title, about) => {
  const input = el('input', { type: 'checkbox', checked: settings[name] })
  input.addEventListener('change', () => {
    settings[name] = input.checked
    remember(name, input.checked ? 'on' : 'off')
  })
  return el('label', { className: 'setting' }, [input, el('span', {}, [el('strong', {}, [title]), el('small', {}, [about])])])
}

const open = () => {
  box = el('div', { className: 'settings', role: 'dialog', ariaLabel: 'Indstillinger' }, [
    el('h3', {}, ['Indstillinger']),
    row('weather', 'Vejr', 'Regn og sne over kontoret. Årstiderne bliver, også uden.'),
    el('button', { type: 'button', className: 'settings-tour', onclick: () => (close(), showTour()) }, ['Vis rundvisningen igen']),
  ])
  document.body.append(box)
  button.ariaExpanded = 'true'
}

button.hidden = false
button.textContent = '⚙'
button.title = 'Indstillinger'
button.ariaExpanded = 'false'
button.addEventListener('click', e => {
  e.stopPropagation()
  if (box) close()
  else open()
})
// A click elsewhere, or Escape, closes it.
document.addEventListener('click', e => {
  if (box && !box.contains(e.target)) close()
})
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && box) close()
})
