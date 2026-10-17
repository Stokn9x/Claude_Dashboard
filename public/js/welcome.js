// ── Welcome ──────────────────────────────────────────────────────────────
// The first time someone opens the office, a short tour in four steps: who
// the figures are, how the work earns and builds the office, what is useful
// day to day, and how to look round. ? in the header shows it again.
import { el, remember, remembered } from './util.js'
import { L } from './i18n.js'

const STEPS = [
  {
    icon: '🏢',
    title: L('Velkommen til kontoret', 'Welcome to the office'),
    lines: [
      L(
        'Claude sidder ved det store skrivebord. Når Claude sender subagenter afsted, kommer de ind ad døren som hjælpere og sætter sig ved et skrivebord.',
        'Claude sits at the big desk. When Claude sends subagents off, they come in through the door as helpers and sit down at a desk.',
      ),
      L(
        'Dine egne agenter fra /agents er faste medarbejdere: de er her hele dagen, får de første skriveborde og tager selv opgaverne af deres slags.',
        'Your own agents from /agents are regulars: they are here all day, get the first desks and take the tasks of their kind themselves.',
      ),
      L(
        'Boblerne siger, hvad de laver lige nu. Rækker nogen hånden op, og boblen er rød, venter de på dig.',
        'The bubbles say what they are doing right now. If someone raises a hand and the bubble is red, they are waiting for you.',
      ),
      L(
        'Klik på en figur for at se, hvad den laver, og hvad den har svaret.',
        'Click a figure to see what it is doing and what it has answered.',
      ),
    ],
  },
  {
    icon: '🪙',
    title: L('Arbejdet bygger kontoret', 'The work builds the office'),
    lines: [
      L(
        'Linjer, afleverede opgaver, grønne tests, commits og pull requests tjener kroner.',
        'Lines, tasks handed over, green tests, commits and pull requests earn kroner.',
      ),
      L(
        'For kronerne køber du skriveborde, rum og pynt i Butik, eller ved at klikke på et skilt ude på grunden.',
        'With the kroner you buy desks, rooms and decor in the Shop, or by clicking a sign out on the grounds.',
      ),
      L(
        'Trivslen øverst ganger indtjeningen: hygge hjælper, hjælpere på gulvet trækker ned.',
        'Wellbeing, up top, multiplies the earnings: comfort helps, helpers on the floor pull it down.',
      ),
    ],
  },
  {
    icon: '🧭',
    title: L('Nyttigt i hverdagen', 'Useful day to day'),
    lines: [
      L(
        'Fremskridt viser dagens opgaver med hjælpernes svar, og 📋 Kopiér giver dagen som tekst.',
        'Progress shows the day’s tasks with the helpers’ answers, and 📋 Copy gives you the day as text.',
      ),
      L(
        'Med 🔔 får du en besked, når nogen venter på dig, eller Claude er færdig med en lang opgave.',
        'With 🔔 you get a notification when someone is waiting for you, or Claude has finished a long task.',
      ),
      L(
        '📺 (eller T) gør kontoret til et tv på en ekstra skærm, hvor kameraet følger det, der sker.',
        '📺 (or T) turns the office into a TV for a spare screen, where the camera follows what happens.',
      ),
    ],
  },
  {
    icon: '🖱️',
    title: L('Se dig omkring', 'Look around'),
    lines: [
      L(
        'Træk for at flytte rundt, rul for at zoome, og dobbeltklik for at se hele kontoret.',
        'Drag to move around, scroll to zoom, and double-click to see the whole office.',
      ),
      L(
        'Tastaturet virker også: pile eller WASD, + og −, og 0.',
        'The keyboard works too: arrows or WASD, + and −, and 0.',
      ),
      L(
        'Alt bliver på din computer. Tryk ? øverst, hvis du vil se den her rundvisning igen.',
        'Everything stays on your computer. Press ? at the top to see this tour again.',
      ),
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
          ...(isLast ? [] : [el('button', { type: 'button', className: 'welcome-skip', onclick: close }, [L('Spring over', 'Skip')])]),
          el('button', { type: 'button', className: 'welcome-next', onclick: () => (isLast ? close() : show(at + 1)) }, [isLast ? L('Kom i gang', 'Get started') : L('Næste', 'Next')]),
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
button.title = L('Rundvisning: hvad kontoret kan', 'Tour: what the office can do')
button.addEventListener('click', () => show(0))

// For the settings panel: the tour once more.
export const showTour = () => show(0)

// The first visit gets the tour, once the office has drawn itself.
if (remembered('welcomed') !== '1') setTimeout(() => show(0), 600)
