// ── Progress: statistics and achievements ────────────────────────────────
import { store } from './store.js'
import { el, number } from './util.js'
import { summaryText } from './summary.js'
import { lookFor, portraitOf } from './figures.js'

const panel = document.getElementById('progress')
const toasts = document.getElementById('toasts')
let progressKey = ''

// Today's tasks, the newest first, a few of them; the copy button gives all
// of the day as text.
const TASKS_SHOWN = 8
const clock = at => new Date(at).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' })
const todayList = today => {
  const tasks = [...(today.tasks ?? [])].sort((a, b) => b.at - a.at)
  const isMixed = new Set(tasks.map(t => t.project)).size > 1
  const rows = tasks.slice(0, TASKS_SHOWN).map(t =>
    el('li', { className: t.failed ? 'is-stuck' : '' }, [
      el('span', { className: 'task-time' }, [clock(t.at)]),
      el('span', { className: 'task-what' }, [el('strong', {}, [t.name]), ` ${t.task}`, ...(isMixed && t.project ? [el('em', {}, [` · ${t.project}`])] : [])]),
      el('span', { className: 'task-mark', title: t.failed ? 'Gik i stå' : 'Afleveret' }, [t.failed ? '⚠' : '✓']),
    ]),
  )
  return [
    el('div', { className: 'today-head' }, [el('h3', {}, ['I dag']), el('button', { type: 'button', className: 'copy', title: 'Kopiér dagens opsummering som tekst' }, ['📋 Kopiér'])]),
    tasks.length ? el('ul', { className: 'tasks' }, rows) : el('p', { className: 'hint' }, ['Ingen opgaver afleveret endnu i dag.']),
    ...(tasks.length > TASKS_SHOWN ? [el('p', { className: 'hint' }, [`og ${number(tasks.length - TASKS_SHOWN)} mere: de står alle i kopien.`])] : []),
  ]
}

// The copy button lives in a list that is rebuilt as the day goes on, so the
// panel listens for it.
panel.addEventListener('click', async e => {
  const button = e.target.closest?.('.copy')
  const today = store.state.game?.stats?.today
  if (!button || !today) return
  const text = summaryText(today)
  let isCopied = false
  try {
    await navigator.clipboard.writeText(text)
    isCopied = true
  } catch {
    // Some browsers refuse the clipboard API here: the old way still works.
    const area = el('textarea', { value: text, readOnly: true, style: 'position:fixed;opacity:0;pointer-events:none' })
    document.body.append(area)
    area.select()
    try {
      isCopied = document.execCommand('copy')
    } catch {}
    area.remove()
  }
  button.textContent = isCopied ? '✓ Kopieret' : 'Kunne ikke kopiere'
  setTimeout(() => (button.textContent = '📋 Kopiér'), 2000)
})

// Employee of the month: last month's, with a cup, and this month's race so
// far. The helpers' names come back from session to session (the server
// keeps a tally per name).
const monthName = month => new Date(`${month}-15T12:00:00`).toLocaleDateString('da-DK', { month: 'long' })
const face = name => el('img', { className: 'face', src: portraitOf(`staff:${name}`, lookFor(`staff:${name}`)), alt: '' })
const tally = r => `${number(r.tasks)} ${r.tasks === 1 ? 'opgave' : 'opgaver'} · ${number(r.lines)} linjer${r.stuck ? ` · ${number(r.stuck)} gik i stå` : ''}`
const MEDALS = ['🥇', '🥈', '🥉']
const staffSection = staff => {
  if (!staff || (!staff.winner && !staff.ranking.length)) return []
  return [
    el('h3', {}, ['Månedens medarbejder']),
    ...(staff.winner
      ? [el('div', { className: 'winner' }, [el('span', { className: 'cup', ariaHidden: 'true' }, ['🏆']), face(staff.winner.name), el('div', {}, [el('strong', {}, [staff.winner.name]), el('span', {}, [`${monthName(staff.lastMonth)}: ${tally(staff.winner)}`])])])]
      : []),
    ...(staff.ranking.length
      ? [
          el('p', { className: 'hint' }, [`Indtil videre i ${monthName(staff.month)}:`]),
          el('ol', { className: 'ranking' }, staff.ranking.map((r, i) => el('li', {}, [el('span', { className: 'place' }, [MEDALS[i] ?? `${i + 1}.`]), face(r.name), el('strong', {}, [r.name]), el('span', { className: 'hint' }, [tally(r)])]))),
        ]
      : []),
  ]
}

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
  const key = JSON.stringify([g?.stats, g?.streak, g?.achievements?.map(a => [a.id, a.value, a.at])])
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
    el('div', { className: 'tiles' }, [
      tile(number(today.added), 'linjer i dag'),
      tile(number(today.delivered), 'opgaver i dag'),
      tile(`${number(today.kroner)} kr`, 'tjent i dag'),
      tile(`🔥 ${number(g.streak?.count ?? 0)}`, (g.streak?.count ?? 0) === 1 ? 'dag i træk' : 'dage i træk'),
    ]),
    el('p', { className: 'hint' }, [
      g.streak?.isToday ? `Dagens bonus er tjent: +${number(g.streak.bonus)} kr. I morgen giver den første linje +${number(g.streak.next)} kr.` : `Den første linje i dag giver en bonus på +${number(g.streak?.next ?? 25)} kr.`,
    ]),
    ...todayList(today),
    ...staffSection(g.stats.staff),
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
