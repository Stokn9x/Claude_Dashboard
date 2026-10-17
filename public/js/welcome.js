// ── Welcome ──────────────────────────────────────────────────────────────
// The first time someone opens the office, a short tour in four steps: who
// the figures are, how the work earns and builds the office, what is useful
// day to day, and how to look round. ? in the header shows it again.
import { el, remember, remembered } from './util.js'

const STEPS = [
  {
    icon: '🏢',
    title: 'Velkommen til kontoret',
    lines: [
      'Claude sidder ved det store skrivebord. Når Claude sender subagenter afsted, kommer de ind ad døren som hjælpere og sætter sig ved et skrivebord.',
      'Boblerne siger, hvad de laver lige nu. Rækker nogen hånden op, og boblen er rød, venter de på dig.',
      'Klik på en figur for at se, hvad den laver, og hvad den har svaret.',
    ],
  },
  {
    icon: '🪙',
    title: 'Arbejdet bygger kontoret',
    lines: [
      'Linjer, afleverede opgaver, grønne tests, commits og pull requests tjener kroner.',
      'For kronerne køber du skriveborde, rum og pynt i Butik, eller ved at klikke på et skilt ude på grunden.',
      'Trivslen øverst ganger indtjeningen: hygge hjælper, hjælpere på gulvet trækker ned.',
    ],
  },
  {
    icon: '🧭',
    title: 'Nyttigt i hverdagen',
    lines: [
      'Fremskridt viser dagens opgaver med hjælpernes svar, og 📋 Kopiér giver dagen som tekst.',
      'Med 🔔 får du en besked, når nogen venter på dig, eller Claude er færdig med en lang opgave.',
      '📺 (eller T) gør kontoret til et tv på en ekstra skærm, hvor kameraet følger det, der sker.',
    ],
  },
  {
    icon: '🖱️',
    title: 'Se dig omkring',
    lines: [
      'Træk for at flytte rundt, rul for at zoome, og dobbeltklik for at se hele kontoret.',
      'Tastaturet virker også: pile eller WASD, + og −, og 0.',
      'Alt bliver på din computer. Tryk ? øverst, hvis du vil se den her rundvisning igen.',
    ],
  },
]

const button = document.getElementById('help')
let dialog = null

const close = () => {
  dialog?.remove()
  dialog = null
  remember('welcomed', '1')
}

const show = (at = 0) => {
  dialog?.remove()
  const step = STEPS[at]
  const isLast = at === STEPS.length - 1
  dialog = el('div', { className: 'welcome', role: 'dialog', ariaModal: 'true', ariaLabel: step.title }, [
    el('div', { className: 'welcome-card' }, [
      el('div', { className: 'welcome-icon', ariaHidden: 'true' }, [step.icon]),
      el('h2', {}, [step.title]),
      ...step.lines.map(line => el('p', {}, [line])),
      el('div', { className: 'welcome-foot' }, [
        el('div', { className: 'welcome-dots', ariaHidden: 'true' }, STEPS.map((_, i) => el('span', { className: i === at ? 'is-on' : '' }, []))),
        el('div', { className: 'welcome-buttons' }, [
          ...(isLast ? [] : [el('button', { type: 'button', className: 'welcome-skip', onclick: close }, ['Spring over'])]),
          el('button', { type: 'button', className: 'welcome-next', onclick: () => (isLast ? close() : show(at + 1)) }, [isLast ? 'Kom i gang' : 'Næste']),
        ]),
      ]),
    ]),
  ])
  // A click outside the card, or Escape, closes it.
  dialog.addEventListener('click', e => {
    if (e.target === dialog) close()
  })
  document.body.append(dialog)
  dialog.querySelector('.welcome-next')?.focus()
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && dialog) close()
})
button.hidden = false
button.textContent = '?'
button.title = 'Rundvisning: hvad kontoret kan'
button.addEventListener('click', () => show(0))

// For the settings panel: the tour once more.
export const showTour = () => show(0)

// The first visit gets the tour, once the office has drawn itself.
if (remembered('welcomed') !== '1') setTimeout(() => show(0), 600)
