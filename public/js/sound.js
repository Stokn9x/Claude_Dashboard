// ── Sound ────────────────────────────────────────────────────────────────
// Small tunes for what happens: a door chime when a helper comes in, a ding
// when one hands over, two beeps when Claude waits for you, a fanfare for
// green tests, a till for a purchase. Made on the spot with Web Audio, no
// files. A button in the header turns it off, and that is remembered.
// Browsers only play sound after the page has been clicked once.
import { remember, remembered } from './util.js'
import { L } from './i18n.js'

// [frequency in Hz, start in s, length in s, wave, volume]
const TUNES = {
  arrive: [[1175, 0, 0.16], [880, 0.16, 0.28]],
  back: [[880, 0, 0.12], [1175, 0.12, 0.2]],
  deliver: [[1046, 0, 0.1], [1318, 0.1, 0.18]],
  waiting: [[660, 0, 0.14, 'square', 0.035], [660, 0.24, 0.14, 'square', 0.035]],
  confetti: [[523, 0, 0.1], [659, 0.1, 0.1], [784, 0.2, 0.1], [1046, 0.3, 0.3]],
  achievement: [[784, 0, 0.1], [988, 0.1, 0.1], [1175, 0.2, 0.1], [1568, 0.3, 0.35]],
  rain: [[330, 0, 0.25, 'triangle'], [247, 0.25, 0.4, 'triangle']],
  stuck: [[392, 0, 0.2, 'triangle'], [311, 0.2, 0.35, 'triangle']],
  balloons: [[784, 0, 0.1], [988, 0.1, 0.22]],
  bought: [[1318, 0, 0.06, 'square', 0.03], [1760, 0.07, 0.2, 'square', 0.03]],
  bonus: [[988, 0, 0.08], [1318, 0.08, 0.22]],
  home: [[784, 0, 0.12], [523, 0.12, 0.24]],
  session: [[659, 0, 0.12], [988, 0.12, 0.2]],
  done: [[659, 0, 0.12], [784, 0.12, 0.12], [1046, 0.24, 0.3]],
}

const button = document.getElementById('sound')
let isOn = remembered('sound') !== 'off'
let audio = null
let lastAt = 0

const context = () => {
  try {
    audio ??= new AudioContext()
    if (audio.state === 'suspended') void audio.resume()
    return audio
  } catch {
    return null
  }
}
// The first click or key anywhere wakes the audio up.
for (const kind of ['pointerdown', 'keydown']) window.addEventListener(kind, context, { once: true, capture: true })

const play = tune => {
  const a = audio && audio.state === 'running' ? audio : null
  if (!a) return
  const now = a.currentTime + 0.02
  for (const [freq, at, length, wave = 'sine', volume = 0.07] of tune) {
    const osc = a.createOscillator()
    const gain = a.createGain()
    osc.type = wave
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.0001, now + at)
    gain.gain.exponentialRampToValueAtTime(volume, now + at + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + at + length)
    osc.connect(gain).connect(a.destination)
    osc.start(now + at)
    osc.stop(now + at + length + 0.05)
  }
}

// A tune for the first event that has one; at most one tune a second, so a
// burst of news is one sound, not a racket.
export const playFor = events => {
  if (!isOn || Date.now() - lastAt < 1000) return
  const event = events.find(e => TUNES[e.kind])
  if (!event) return
  lastAt = Date.now()
  play(TUNES[event.kind])
}

const render = () => {
  button.textContent = isOn ? '🔊' : '🔇'
  button.title = isOn ? L('Lyd er slået til. Klik for at slå den fra.', 'Sound is on. Click to turn it off.') : L('Lyd er slået fra. Klik for at slå den til.', 'Sound is off. Click to turn it on.')
  button.ariaPressed = String(isOn)
}
button.addEventListener('click', () => {
  isOn = !isOn
  remember('sound', isOn ? 'on' : 'off')
  render()
  if (isOn) {
    context()
    play(TUNES.deliver)
  }
})
render()
