// ── Language ─────────────────────────────────────────────────────────────
// The office speaks Danish or English. Every text a person sees is written
// where it is used, in both: L('Butik', 'Shop'). The language is chosen
// under ⚙ and kept by the server (prefs.json), so the page and the mod's
// button in Claude agree; this browser keeps a copy so the page starts in
// the right one. A change reloads the page, so texts built when a module
// loads follow too. Until one is chosen, the browser's language decides.
// No DOM is touched when this loads: in Node (the tests) it is Danish.

// This browser's copy, read and written here and not through util.js, which
// imports this module: no circle between the two. Storage may be missing or
// throw (a private window); the page works without it.
const KEY = 'agent-kontor:lang'
const remembered = () => {
  try {
    return globalThis.localStorage?.getItem(KEY) ?? null
  } catch {
    return null
  }
}
const remember = value => {
  try {
    globalThis.localStorage?.setItem(KEY, value)
  } catch {}
}

export const LANGS = ['da', 'en']

const initial = () => {
  if (typeof document === 'undefined') return 'da'
  const kept = remembered()
  if (LANGS.includes(kept)) return kept
  return /^da\b/i.test(globalThis.navigator?.language ?? '') ? 'da' : 'en'
}

export let lang = initial()

// The text in the language in use.
export const L = (da, en) => (lang === 'en' ? en : da)

// For numbers, times and dates.
export const locale = () => (lang === 'en' ? 'en-GB' : 'da-DK')

// For the tests: the page in another language, without a reload.
export const useLang = next => {
  lang = next
}

// The language as chosen here, kept for the next load.
export const keepLang = next => remember(next)

// What the mod writes in Danish ("Læser api.ts", "Venter på din
// godkendelse"), in English: each pattern once, the rest kept as it is
// (a file name, a command, a task).
const MOD_TEXTS = [
  [/^Tænker$/, 'Thinking'],
  [/^Holder pause$/, 'On a break'],
  [/^Holder fri$/, 'Off work'],
  [/^Klar til en opgave$/, 'Ready for a task'],
  [/^Venter på en besked$/, 'Waiting for a message'],
  [/^Venter på din godkendelse$/, 'Waiting for your approval'],
  [/^Venter på dig: (.*)$/, 'Waiting for you: $1'],
  [/^Har et spørgsmål til dig$/, 'Has a question for you'],
  [/^Går i gang$/, 'Getting started'],
  [/^Fordeler opgaver$/, 'Handing out tasks'],
  [/^En opgave$/, 'A task'],
  [/^Hjælper$/, 'Helper'],
  [/^Afleverer: (.*)$/, 'Handing over: $1'],
  [/^Gik i stå: (.*)$/, 'Got stuck: $1'],
  [/^Læser nettet$/, 'Reading the web'],
  [/^Læser (.*)$/, 'Reading $1'],
  [/^Skriver (.*)$/, 'Writing $1'],
  [/^Kører en kommando$/, 'Running a command'],
  [/^Kører (.*)$/, 'Running $1'],
  [/^Søger i koden$/, 'Searching the code'],
  [/^Finder filer$/, 'Finding files'],
  [/^Søger på nettet$/, 'Searching the web'],
  [/^Sender en hjælper afsted$/, 'Sending a helper off'],
  [/^Bruger browseren$/, 'Using the browser'],
  [/^Bruger (.*)$/, 'Using $1'],
  [/^Kontoret$/, 'The office'],
  // The plates over a desk when something is celebrated
  [/^Testene er grønne$/, 'Tests are green'],
  [/^Testene fejler$/, 'Tests are failing'],
  [/^Committet$/, 'Committed'],
  [/^Pull request åbnet$/, 'Pull request opened'],
  // The demo's tasks
  [/^Kortlæg API’et$/, 'Map the API'],
  [/^Skriv tests$/, 'Write tests'],
  [/^Kør testsuiten$/, 'Run the test suite'],
  [/^Find gammel kode$/, 'Find old code'],
  [/^Læs dokumentationen$/, 'Read the docs'],
  [/^Opdatér README$/, 'Update the README'],
]
export const modText = text => {
  if (lang !== 'en' || typeof text !== 'string') return text
  for (const [pattern, english] of MOD_TEXTS) {
    // What a pattern keeps (a task after "Afleverer:") may be the mod's too.
    if (pattern.test(text)) return text.replace(pattern, (_, kept = '') => english.replace('$1', modText(kept)))
  }
  return text
}

// The server's state with the mod's texts in the page's language: what each
// one does, its task, and the day's tasks. Code that compares a text the mod
// wrote compares it with modText('Tænker'), so it holds in either language.
const doing = activity => (activity ? { ...activity, detail: modText(activity.detail) } : activity)
export const inLanguage = data => {
  if (lang !== 'en' || !data) return data
  const sessions = (data.sessions ?? []).map(s => ({
    ...s,
    project: modText(s.project),
    main: doing(s.main),
    party: s.party ? { ...s.party, label: modText(s.party.label) } : s.party,
    subs: (s.subs ?? []).map(sub => ({ ...sub, task: modText(sub.task), activity: doing(sub.activity) })),
  }))
  const today = data.game?.stats?.today
  const game = today?.tasks ? { ...data.game, stats: { ...data.game.stats, today: { ...today, tasks: today.tasks.map(t => ({ ...t, task: modText(t.task) })) } } } : data.game
  return { ...data, sessions, game }
}

// The page's own HTML in English: an element with `data-en` gets that text,
// `data-en-title` that tooltip, `data-en-label` that label. Called once by
// main.js; touches the DOM only then.
export const translateStatic = root => {
  root.documentElement.lang = lang
  if (lang !== 'en') return
  for (const node of root.querySelectorAll('[data-en]')) node.textContent = node.dataset.en
  for (const node of root.querySelectorAll('[data-en-title]')) node.title = node.dataset.enTitle
  for (const node of root.querySelectorAll('[data-en-label]')) node.ariaLabel = node.dataset.enLabel
}
