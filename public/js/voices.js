// How each helper talks. Every helper has a temperament, from its name, so
// the same name always sounds the same: cheeky, dry, dramatic or upbeat. The
// lines are templates, never a language model: free, and never odd. No DOM
// here, so it can be tested without a browser.
import { hashOf, stir } from './util.js'

export const TEMPERS = ['kæk', 'tør', 'dramatisk', 'positiv']
export const TEMPER_TEXT = { kæk: 'Kæk', tør: 'Tør', dramatisk: 'Dramatisk', positiv: 'Positiv' }

// Salt 12 spreads the mod's twelve names three to each temperament.
export const temperOf = name => TEMPERS[stir(hashOf(name ?? ''), 12) % TEMPERS.length]

// One line, said the way this person would say it.
export const voice = (person, lines) => lines[temperOf(person?.name)] ?? lines.tør

// What a helper on the floor says about it now and then, in its own voice;
// outside on the bench it has other worries.
const FLOOR = {
  kæk: ['Fedt gulv. Har I også en stol?', 'Jeg tager hjørnekontoret næste gang', 'Gulvet er min nye standing desk', 'Hvem skal man bestikke for et skrivebord?'],
  tør: ['Gulvet er koldt', 'Laptop på skødet. Godt.', 'Mine ben sover', 'Et skrivebord ville være rart'],
  dramatisk: ['Av, min ryg! Min ryg!', 'Jeg skriver det her i et klagebrev', 'Er det sådan, det ender?', 'Hvem har taget min plads?!'],
  positiv: ['Godt for holdningen, det her!', 'Gulvet har udsigt til det hele', 'Snart får jeg et skrivebord', 'Der er hyggeligt hernede'],
}
const BENCH = {
  kæk: ['Frisk luft er også et kontor', 'Jeg holder øje med vejen', 'Wi-fi herude? Næsten.'],
  tør: ['Her er koldt', 'Jeg venter herude', 'Fortovet er pænt'],
  dramatisk: ['Udenfor! I regnvejret! Næsten.', 'Glemt på en bænk!', 'Lukker I mig nogensinde ind?'],
  positiv: ['Dejligt vejr til at kode', 'Fuglene synger herude', 'Bænken er faktisk god'],
}

// Two helpers off work chatting on the lawn: a few lines each, in turn.
const CHATS = [
  (a, b) => [
    [a, voice(a, { kæk: 'Nå, hvad fik du lavet?', tør: 'Færdig?', dramatisk: 'Jeg overlevede min opgave!', positiv: 'Godt arbejde i dag!' })],
    [b, voice(b, { kæk: `${b.task}. Med stil.`, tør: `Ja. ${b.task}.`, dramatisk: `${b.task}! Det var et mareridt!`, positiv: `${b.task}, og det gik fint!` })],
    [a, voice(a, { kæk: 'Claude giver kaffe, tror jeg.', tør: 'Godt.', dramatisk: 'Vi fortjener en medalje.', positiv: 'Så kan vi slappe af!' })],
  ],
  (a, b) => [
    [a, voice(a, { kæk: 'Tror du, vi bliver kaldt ind igen?', tør: 'Venter vi på noget?', dramatisk: 'Hvad nu, hvis de glemmer os?', positiv: 'Jeg håber, de har mere til os!' })],
    [b, voice(b, { kæk: 'Kun hvis Claude savner os.', tør: 'Måske.', dramatisk: 'Så går vi hjem i regnen!', positiv: 'Det gør de helt sikkert!' })],
  ],
  (a, b) => [
    [a, voice(a, { kæk: 'Flot græs i dag.', tør: 'Græs.', dramatisk: 'Endelig frisk luft!', positiv: 'Hvor er her dejligt!' })],
    [b, voice(b, { kæk: 'Bedre end gulvet indenfor.', tør: 'Det er grønt.', dramatisk: 'Jeg vil aldrig ind igen!', positiv: 'Ja, og solen skinner!' })],
  ],
  (a, b) => [
    [a, voice(a, { kæk: 'Hvem vandt bordtennis i går?', tør: 'Bordtennis senere?', dramatisk: 'Jeg kræver revanche ved bordet!', positiv: 'Skal vi spille bordtennis bagefter?' })],
    [b, voice(b, { kæk: 'Mig. Som altid.', tør: 'Måske.', dramatisk: 'Aldrig! Jeg er stadig såret!', positiv: 'Ja, det ville være sjovt!' })],
  ],
]
export const chatFor = (a, b, slot) => CHATS[stir(slot, 17) % CHATS.length](a, b)

// The line said now, every nine seconds for three, each on its own beat
// (seed); null between them.
export const grumbleAt = (name, t, seed, isOutside = false) => {
  const phase = (t + seed * 997) % 9000
  if (phase >= 3000) return null
  const lines = (isOutside ? BENCH : FLOOR)[temperOf(name)]
  return lines[Math.floor((t + seed * 997) / 9000 + seed) % lines.length]
}
