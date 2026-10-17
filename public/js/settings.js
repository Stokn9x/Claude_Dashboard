// ── Settings ─────────────────────────────────────────────────────────────
// A small panel under ⚙ in the header: the weather on or off (rain and snow;
// the seasons stay), your own agents on the staff or off it, and the tour
// once more. The weather is kept in this browser, the staff by the server.
// The game is always on: there is no switch for it (the user's decision).
import { el, remember, remembered } from './util.js'
import { showTour } from './welcome.js'
import { crewOf, isOnStaff, knownAgents, originOf, ownName, setOnStaff } from './crew.js'
import { L, keepLang, lang } from './i18n.js'
import { store } from './store.js'

// The language, kept by the server for the page and the mod's button alike,
// and by this browser to start in it. The page reloads in the new one.
export const saveLang = async next => {
  keepLang(next)
  if (!store.state.token) return
  try {
    await fetch('/api/prefs', { method: 'POST', headers: { 'content-type': 'application/json', 'x-kontor-token': store.state.token }, body: JSON.stringify({ lang: next }) })
  } catch {}
}
const langRow = () => {
  const pick = (code, name) =>
    el('button', { type: 'button', className: 'lang-option', ariaPressed: String(lang === code), lang: code, onclick: async () => {
      if (code === lang) return
      await saveLang(code)
      location.reload()
    } }, [name])
  return el('div', { className: 'lang-row' }, [
    el('span', {}, [el('strong', {}, [L('Sprog', 'Language')]), el('small', {}, [L('Siden og knappen i Claude', 'The page and the button in Claude')])]),
    el('div', { className: 'lang-pick', role: 'group', ariaLabel: L('Sprog', 'Language') }, [pick('da', 'Dansk'), pick('en', 'English')]),
  ])
}

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

// Your own agents, and the plugins' (off until put on): on the staff they
// are in all day; off it, one comes in as a helper when it has a task, and
// goes again.
const ON_STAFF = 'På kontoret hele dagen'
const OFF_STAFF = 'Kommer kun, når den har en opgave'
const crewSection = () => {
  const agents = knownAgents()
  const heading = el('h3', {}, ['Faste medarbejdere'])
  if (!agents.length) return [heading, el('p', { className: 'crew-empty' }, ['Dine egne agenter fra /agents i Claude Code møder ind her og er på kontoret hele dagen. Du har ingen endnu.'])]
  const { names } = crewOf()
  const rows = agents.map(agent => {
    const input = el('input', { type: 'checkbox', checked: isOnStaff(agent) })
    // Its own name under a name given, and where it comes from.
    const origin = [names[agent] ? ownName(agent) : null, originOf(agent)].filter(Boolean).join(' · ')
    const aboutText = () => `${origin ? `${origin} · ` : ''}${input.checked ? ON_STAFF : OFF_STAFF}`
    const about = el('small', {}, [aboutText()])
    input.addEventListener('change', async () => {
      if (!(await setOnStaff(agent, input.checked))) input.checked = !input.checked
      about.textContent = aboutText()
    })
    return el('label', { className: 'setting' }, [input, el('span', {}, [el('strong', {}, [names[agent] ?? ownName(agent)]), about])])
  })
  return [heading, el('div', { className: 'crew-list' }, rows), el('p', { className: 'crew-empty' }, ['Klik på en fast medarbejder i kontoret for at give den et navn.'])]
}

const open = () => {
  box = el('div', { className: 'settings', role: 'dialog', ariaLabel: 'Indstillinger' }, [
    el('h3', {}, ['Indstillinger']),
    langRow(),
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
