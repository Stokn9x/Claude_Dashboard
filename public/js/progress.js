// ── Progress: statistics and achievements ────────────────────────────────
import { store } from './store.js'
import { el, number } from './util.js'

const panel = document.getElementById('progress')
const toasts = document.getElementById('toasts')
let progressKey = ''

const tile = (value, text) => el('div', { className: 'tile' }, [el('strong', {}, [value]), el('span', {}, [text])])
const weekday = day => new Date(`${day}T12:00:00`).toLocaleDateString('da-DK', { weekday: 'narrow' })

// Lines day by day, today in full colour.
const bars = days => {
  const top = Math.max(1, ...days.map(d => d.added))
  return el(
    'div',
    { className: 'bars', role: 'img', ariaLabel: 'Linjer de sidste 14 dage' },
    days.map((d, i) =>
      el('div', { className: `bar${i === days.length - 1 ? ' is-today' : ''}`, title: `${d.day}: ${number(d.added)} linjer, ${number(d.kroner)} kr` }, [
        el('span', { style: `height:${Math.max(2, (100 * d.added) / top)}%` }, []),
        el('small', {}, [weekday(d.day)]),
      ]),
    ),
  )
}

const achievement = a =>
  el('li', { className: `achievement${a.at ? ' is-done' : ''}` }, [
    el('span', { className: 'medal', ariaHidden: 'true' }, [a.at ? '🏅' : '🔒']),
    el('div', { className: 'item-head' }, [el('strong', {}, [a.name]), el('span', { className: 'item-count' }, [`+${number(a.reward)} kr`])]),
    el('p', { className: 'hint' }, [a.at ? `${a.about} · ${new Date(a.at).toLocaleDateString('da-DK')}` : a.about]),
    ...(a.at ? [] : [el('span', { className: 'progress' }, [el('span', { style: `width:${(100 * a.value) / a.target}%` }, [])]), el('p', { className: 'hint' }, [`${number(a.value)} af ${number(a.target)}`])]),
  ])

export const renderProgress = () => {
  const g = store.state.game
  const key = JSON.stringify([g?.stats, g?.achievements?.map(a => [a.id, a.value, a.at])])
  if (key === progressKey) return
  progressKey = key
  if (!g?.stats) {
    panel.replaceChildren(el('p', { className: 'empty' }, ['Statistikken kommer, når kontoret er forbundet.']))
    return
  }
  const { today, days, best, totals, daysActive } = g.stats
  const achievements = [...g.achievements].sort((a, b) => (b.at ? 1 : 0) - (a.at ? 1 : 0) || b.value / b.target - a.value / a.target)
  const unlocked = achievements.filter(a => a.at).length
  panel.replaceChildren(
    el('div', { className: 'tiles' }, [tile(number(today.added), 'linjer i dag'), tile(number(today.delivered), 'opgaver i dag'), tile(`${number(today.kroner)} kr`, 'tjent i dag')]),
    el('h3', {}, ['De sidste 14 dage']),
    bars(days),
    el('p', { className: 'hint' }, [`Bedste dag: ${number(best.added)} linjer · ${daysActive} ${daysActive === 1 ? 'dag' : 'dage'} med arbejde`]),
    el('h3', {}, ['I alt']),
    el(
      'ul',
      { className: 'totals' },
      [
        [number(totals.added), 'linjer skrevet'],
        [number(totals.delivered), 'opgaver afleveret'],
        [number(totals.tests), 'grønne testkørsler'],
        [number(totals.commits), 'commits'],
        [number(totals.prs), 'pull requests'],
        [`${number(totals.kroner)} kr`, 'tjent'],
      ].map(([v, l]) => el('li', {}, [el('strong', {}, [v]), l])),
    ),
    el('h3', {}, [`Præstationer · ${unlocked} af ${achievements.length}`]),
    el('ul', { className: 'achievements' }, achievements.map(achievement)),
  )
}

// A notice in the corner when an achievement is unlocked. Those already
// unlocked when the page opens are not announced.
let announced = null
export const announce = () => {
  const done = (store.state.game?.achievements ?? []).filter(a => a.at)
  if (announced === null) {
    if (store.state.game) announced = new Set(done.map(a => a.id))
    return
  }
  for (const a of done) {
    if (announced.has(a.id)) continue
    announced.add(a.id)
    const toast = el('div', { className: 'toast', role: 'status' }, [
      el('span', { className: 'medal' }, ['🏅']),
      el('div', {}, [el('strong', {}, [`Præstation: ${a.name}`]), el('span', {}, [`${a.about} · +${a.reward} kr`])]),
    ])
    toasts.append(toast)
    setTimeout(() => toast.classList.add('is-leaving'), 6000)
    setTimeout(() => toast.remove(), 6600)
  }
}
