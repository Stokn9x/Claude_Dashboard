// How each helper talks. Every helper has a temperament, from its name, so
// the same name always sounds the same: cheeky, dry, dramatic or upbeat. The
// lines are templates, never a language model: free, and never odd. No DOM
// here, so it can be tested without a browser.
import { L } from './i18n.js'
import { hashOf, stir } from './util.js'

export const TEMPERS = ['kæk', 'tør', 'dramatisk', 'positiv']
export const TEMPER_TEXT = { kæk: L('Kæk', 'Cheeky'), tør: L('Tør', 'Dry'), dramatisk: L('Dramatisk', 'Dramatic'), positiv: L('Positiv', 'Upbeat') }

// Salt 12 spreads the mod's twelve names three to each temperament.
export const temperOf = name => TEMPERS[stir(hashOf(name ?? ''), 12) % TEMPERS.length]

// One line, said the way this person would say it.
export const voice = (person, lines) => lines[temperOf(person?.name)] ?? lines.tør

// What a helper on the floor says about it now and then, in its own voice;
// outside on the bench it has other worries.
const FLOOR = {
  kæk: [L('Fedt gulv. Har I også en stol?', 'Nice floor. Got a chair too?'), L('Jeg tager hjørnekontoret næste gang', 'Corner office next time, then'), L('Gulvet er min nye standing desk', 'The floor is my standing desk'), L('Hvem skal man bestikke for et skrivebord?', 'Who do I bribe for a desk?')],
  tør: [L('Gulvet er koldt', 'The floor is cold'), L('Laptop på skødet. Godt.', 'Laptop on my lap. Great.'), L('Mine ben sover', 'My legs are asleep'), L('Et skrivebord ville være rart', 'A desk would be nice')],
  dramatisk: [L('Av, min ryg! Min ryg!', 'Ow, my back! My back!'), L('Jeg skriver det her i et klagebrev', 'This goes in my complaint'), L('Er det sådan, det ender?', 'Is this how it ends?'), L('Hvem har taget min plads?!', 'Who took my seat?!')],
  positiv: [L('Godt for holdningen, det her!', 'Great for my posture, this!'), L('Gulvet har udsigt til det hele', 'Great view from down here'), L('Snart får jeg et skrivebord', 'I’ll get a desk soon'), L('Der er hyggeligt hernede', 'It’s cosy down here')],
}
// A regular, one of your own agents, is in all day: without a desk it has
// more to say about it.
const REGULAR = {
  kæk: [L('Fast ansat, fast gulv', 'Full-time job, full-time floor'), L('Mit bord er sendt med posten?', 'Is my desk in the post?'), L('Jeg har været her hele dagen', 'I’ve been here all day'), L('Vikaren fik vel mit bord?', 'Did the temp get my desk?')],
  tør: [L('Jeg bor her. Uden skrivebord.', 'I live here. No desk.'), L('Et skrivebord. Bare ét.', 'A desk. Just one.'), L('Fast medarbejder. Løs plads.', 'Regular staff. No seat.'), L('Gulvet igen i dag', 'The floor again today')],
  dramatisk: [L('Hver dag! På gulvet!', 'Every day! On the floor!'), L('Fastansat og glemt!', 'Hired and forgotten!'), L('Skal jeg sidde her for evigt?!', 'Must I sit here forever?!'), L('Mit eget skrivebord! Snart?!', 'My own desk! Soon?!')],
  positiv: [L('Gulvet er mit faste sted, ha!', 'The floor is my spot, ha!'), L('Snart har jeg mit eget bord!', 'Soon I’ll have my own desk!'), L('Et skrivebord ville være top!', 'A desk would be brilliant!'), L('Jeg er her hver dag, gerne!', 'Here every day, and glad!')],
}
const BENCH = {
  kæk: [L('Frisk luft er også et kontor', 'Fresh air is an office too'), L('Jeg holder øje med vejen', 'I’m keeping an eye on the road'), L('Wi-fi herude? Næsten.', 'Wi-fi out here? Almost.')],
  tør: [L('Her er koldt', 'It’s cold here'), L('Jeg venter herude', 'I’ll wait out here'), L('Fortovet er pænt', 'Nice pavement')],
  dramatisk: [L('Udenfor! I regnvejret! Næsten.', 'Outside! In the rain! Almost.'), L('Glemt på en bænk!', 'Forgotten on a bench!'), L('Lukker I mig nogensinde ind?', 'Will you ever let me in?')],
  positiv: [L('Dejligt vejr til at kode', 'Lovely weather for coding'), L('Fuglene synger herude', 'The birds sing out here'), L('Bænken er faktisk god', 'The bench is actually nice')],
}

// Two helpers off work chatting on the lawn: a few lines each, in turn.
const CHATS = [
  (a, b) => [
    [a, voice(a, { kæk: L('Nå, hvad fik du lavet?', 'So, what did you get done?'), tør: L('Færdig?', 'Done?'), dramatisk: L('Jeg overlevede min opgave!', 'I survived my task!'), positiv: L('Godt arbejde i dag!', 'Good work today!') })],
    [b, voice(b, { kæk: L(`${b.task}. Med stil.`, `${b.task}. With style.`), tør: L(`Ja. ${b.task}.`, `Yes. ${b.task}.`), dramatisk: L(`${b.task}! Det var et mareridt!`, `${b.task}! It was a nightmare!`), positiv: L(`${b.task}, og det gik fint!`, `${b.task}, and it went well!`) })],
    [a, voice(a, { kæk: L('Claude giver kaffe, tror jeg.', 'Claude’s buying coffee, I hear.'), tør: L('Godt.', 'Good.'), dramatisk: L('Vi fortjener en medalje.', 'We deserve a medal.'), positiv: L('Så kan vi slappe af!', 'Now we can relax!') })],
  ],
  (a, b) => [
    [a, voice(a, { kæk: L('Tror du, vi bliver kaldt ind igen?', 'Think they’ll call us back in?'), tør: L('Venter vi på noget?', 'Are we waiting for something?'), dramatisk: L('Hvad nu, hvis de glemmer os?', 'What if they forget us?'), positiv: L('Jeg håber, de har mere til os!', 'I hope they have more for us!') })],
    [b, voice(b, { kæk: L('Kun hvis Claude savner os.', 'Only if Claude misses us.'), tør: L('Måske.', 'Maybe.'), dramatisk: L('Så går vi hjem i regnen!', 'Then we walk home in the rain!'), positiv: L('Det gør de helt sikkert!', 'I’m sure they will!') })],
  ],
  (a, b) => [
    [a, voice(a, { kæk: L('Flot græs i dag.', 'Nice grass today.'), tør: L('Græs.', 'Grass.'), dramatisk: L('Endelig frisk luft!', 'Fresh air at last!'), positiv: L('Hvor er her dejligt!', 'It’s lovely out here!') })],
    [b, voice(b, { kæk: L('Bedre end gulvet indenfor.', 'Beats the floor inside.'), tør: L('Det er grønt.', 'It’s green.'), dramatisk: L('Jeg vil aldrig ind igen!', 'I’m never going back in!'), positiv: L('Ja, og solen skinner!', 'Yes, and the sun is out!') })],
  ],
  (a, b) => [
    [a, voice(a, { kæk: L('Hvem vandt bordtennis i går?', 'Who won ping-pong yesterday?'), tør: L('Bordtennis senere?', 'Ping-pong later?'), dramatisk: L('Jeg kræver revanche ved bordet!', 'I demand a rematch!'), positiv: L('Skal vi spille bordtennis bagefter?', 'Ping-pong after this?') })],
    [b, voice(b, { kæk: L('Mig. Som altid.', 'Me. As always.'), tør: L('Måske.', 'Maybe.'), dramatisk: L('Aldrig! Jeg er stadig såret!', 'Never! I’m still wounded!'), positiv: L('Ja, det ville være sjovt!', 'Yes, that’d be fun!') })],
  ],
]
export const chatFor = (a, b, slot) => CHATS[stir(slot, 17) % CHATS.length](a, b)

// The line said now, every nine seconds for three, each on its own beat
// (seed); null between them.
export const grumbleAt = (name, t, seed, isOutside = false, isRegular = false) => {
  const phase = (t + seed * 997) % 9000
  if (phase >= 3000) return null
  const lines = (isOutside ? BENCH : isRegular ? REGULAR : FLOOR)[temperOf(name)]
  return lines[Math.floor((t + seed * 997) / 9000 + seed) % lines.length]
}
