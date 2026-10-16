// ── The day in a few lines ───────────────────────────────────────────────
// What today came to, as plain text to paste into a stand-up or a note:
// lines, tasks, tests, commits and pull requests, then each task the
// helpers handed over, with the time, who and in which project. No DOM
// here, so it can be tested without a browser.
import { number } from './util.js'

const clock = at => new Date(at).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' })
const plural = (n, one, many) => `${number(n)} ${n === 1 ? one : many}`

export const summaryText = (today, now = Date.now()) => {
  const date = new Date(now).toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'long' })
  const tasks = today.tasks ?? []
  const done = tasks.filter(t => !t.failed)
  const stuck = tasks.length - done.length
  const isMixed = new Set(tasks.map(t => t.project)).size > 1
  const lines = [`Agent-kontor, ${date}`]
  lines.push(`• ${plural(today.added ?? 0, 'linje', 'linjer')} tilføjet, ${number(today.removed ?? 0)} fjernet`)
  if (tasks.length) lines.push(`• ${plural(done.length, 'opgave', 'opgaver')} løst af hjælperne${stuck ? `, ${number(stuck)} gik i stå` : ''}`)
  const work = [
    today.commits ? plural(today.commits, 'commit', 'commits') : '',
    today.prs ? plural(today.prs, 'pull request', 'pull requests') : '',
    today.tests ? `grønne tests ${plural(today.tests, 'gang', 'gange')}` : '',
  ].filter(Boolean)
  if (work.length) lines.push(`• ${work.join(', ')}`)
  if (tasks.length) {
    lines.push('', 'Opgaver:')
    for (const t of [...tasks].sort((a, b) => a.at - b.at)) {
      lines.push(`• ${clock(t.at)} ${t.name}${isMixed && t.project ? ` (${t.project})` : ''}: ${t.task}${t.failed ? ' (gik i stå)' : ''}`)
    }
  }
  return lines.join('\n')
}
