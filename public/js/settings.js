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
const ON_STAFF = L('På kontoret hele dagen', 'In the office all day')
const OFF_STAFF = L('Kommer kun, når den har en opgave', 'Only comes in when it has a task')
const crewSection = () => {
  const agents = knownAgents()
  const heading = el('h3', {}, [L('Faste medarbejdere', 'Regulars')])
  if (!agents.length) return [heading, el('p', { className: 'crew-empty' }, [L('Dine egne agenter fra /agents i Claude Code møder ind her og er på kontoret hele dagen. Du har ingen endnu.', 'Your own agents from /agents in Claude Code clock in here and stay in the office all day. You have none yet.')])]
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
  return [heading, el('div', { className: 'crew-list' }, rows), el('p', { className: 'crew-empty' }, [L('Klik på en fast medarbejder i kontoret for at give den et navn.', 'Click a regular in the office to give it a name.')])]
}

const open = () => {
  box = el('div', { className: 'settings', role: 'dialog', ariaLabel: L('Indstillinger', 'Settings') }, [
    el('h3', {}, [L('Indstillinger', 'Settings')]),
    langRow(),
    row('weather', L('Vejr', 'Weather'), L('Regn og sne over kontoret. Årstiderne bliver, også uden.', 'Rain and snow over the office. The seasons stay, even without.')),
    ...crewSection(),
    el('button', { type: 'button', className: 'settings-tour', onclick: () => (close(), showTour()) }, [L('Vis rundvisningen igen', 'Show the tour again')]),
  ])
  document.body.append(box)
  button.ariaExpanded = 'true'
}

button.hidden = false
button.textContent = '⚙'
button.title = L('Indstillinger', 'Settings')
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
