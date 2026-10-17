// ── Settings ─────────────────────────────────────────────────────────────
// A small panel under ⚙ in the header: the weather on or off (rain and snow;
// the seasons stay), your own agents on the staff or off it, and the tour
// once more. The weather is kept in this browser, the staff by the server.
// The game is always on: there is no switch for it (the user's decision).
import { el, remember, remembered } from './util.js'
import { showTour } from './welcome.js'
import { changeCrew, crewOf, knownAgents, ownName } from './crew.js'

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

// Your own agents: on the staff they are in all day; off it, one comes in
// as a helper when it has a task, and goes again.
const ON_STAFF = 'På kontoret hele dagen'
const OFF_STAFF = 'Kommer kun, når den har en opgave'
const crewSection = () => {
  const agents = knownAgents()
  const heading = el('h3', {}, ['Faste medarbejdere'])
  if (!agents.length) return [heading, el('p', { className: 'crew-empty' }, ['Dine egne agenter fra /agents i Claude Code møder ind her og er på kontoret hele dagen. Du har ingen endnu.'])]
  const { names, removed } = crewOf()
  const rows = agents.map(agent => {
    const input = el('input', { type: 'checkbox', checked: !removed.includes(agent) })
    const about = el('small', {}, [`${names[agent] ? `${ownName(agent)} · ` : ''}${input.checked ? ON_STAFF : OFF_STAFF}`])
    input.addEventListener('change', async () => {
      if (!(await changeCrew({ agent, isRemoved: !input.checked }))) input.checked = !input.checked
      about.textContent = `${names[agent] ? `${ownName(agent)} · ` : ''}${input.checked ? ON_STAFF : OFF_STAFF}`
    })
    return el('label', { className: 'setting' }, [input, el('span', {}, [el('strong', {}, [names[agent] ?? ownName(agent)]), about])])
  })
  return [heading, el('div', { className: 'crew-list' }, rows), el('p', { className: 'crew-empty' }, ['Klik på en fast medarbejder i kontoret for at give den et navn.'])]
}

const open = () => {
  box = el('div', { className: 'settings', role: 'dialog', ariaLabel: 'Indstillinger' }, [
    el('h3', {}, ['Indstillinger']),
    row('weather', 'Vejr', 'Regn og sne over kontoret. Årstiderne bliver, også uden.'),
    ...crewSection(),
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
