// The people: their looks, drawn from their ids, and every pose they take.
import { OUTLINE, ctx, rect, shadow } from './gfx.js'
import { hashOf, stir } from './util.js'

// One sprite pixel, in world units
const P = 3.5

// Skin tones from light to deep, evenly spread so an office of six looks
// like a real mix of people.
const skins = ['#F7DCC4', '#EFC39C', '#E0A97A', '#C68A5C', '#A86F45', '#8A5634', '#6B3F25']
const hairs = [['#3A2A22', '#5C4436'], ['#7A4B2A', '#9C6A43'], ['#D9B25C', '#F0D48A'], ['#2B2B33', '#4A4A57'], ['#B5523B', '#D27358'], ['#9AA0A8', '#C3C8CE']]
const shirts = [['#3E7CC9', '#2F5F9C'], ['#2E9E8F', '#21776B'], ['#E07A4F', '#B85E38'], ['#8A6FD6', '#6A52AE'], ['#D6A23C', '#AD7F26'], ['#D45D7A', '#AC4560'], ['#4F9A5B', '#3A7644']]

export const lookFor = id => {
  const h = hashOf(id)
  const [hair, hairLight] = hairs[stir(h, 1) % hairs.length]
  const [shirt, shirtShade] = shirts[stir(h, 2) % shirts.length]
  return { hair, hairLight, skin: skins[stir(h, 3) % skins.length], shirt, shirtShade }
}
export const claudeLook = { hair: '#C8643B', hairLight: '#E3875E', skin: '#F6D5B8', shirt: '#2F3A4A', shirtShade: '#222B37' }

const BODY = ['..oooooo..', '.ohhhhhho.', 'ohhHhhhhho', 'ohssssssho', 'ohsessesho', '.osssssso.', '.otttttTo.', 'otttttttTo', 'otttttttTo', 'osttttttso']
const BACK = ['..oooooo..', '.ohhhhhho.', 'ohhHhhhhho', 'ohhhhhhhho', 'ohhhhhhhho', '.ohhhhhho.', '.otttttTo.', 'otttttttTo', 'otttttttTo', 'osttttttso']
const SIDE = ['..ooooo...', '.ohhhhhoo.', 'ohHhhhhhho', 'ohhhsssso.', 'ohhsseso..', '.ohsssso..', '..otttTo..', '.ottttTo..', '.ottttTo..', '..osttso..']
const LEGS = ['.oppppppo.', '.opo..opo.', '.obo..obo.', '.oo....oo.']
const FRONT_WALK = [['.oppppppo.', '.opo..opo.', '.obo..oo..', '.oo.......'], LEGS, ['.oppppppo.', '.opo..opo.', '..oo..obo.', '.......oo.'], LEGS]
const SIDE_STAND = ['..opppo...', '..oppo....', '..obbo....', '..oooo....']
const SIDE_STEP = ['..opppo...', '.op..po...', 'ob....bo..', 'oo....oo..']
const SIDE_WALK = [SIDE_STEP, SIDE_STAND, SIDE_STEP, SIDE_STAND]

const coloursOf = (look, isBlinking = false) => ({ o: OUTLINE, h: look.hair, H: look.hairLight, s: look.skin, e: isBlinking ? look.skin : OUTLINE, t: look.shirt, T: look.shirtShade, p: '#3B4A6B', b: OUTLINE })

// Rows of letters, one per sprite pixel; a run of the same letter is one rectangle.
const paintRows = (rows, look, x, y, isBlinking = false) => {
  const colour = coloursOf(look, isBlinking)
  rows.forEach((row, r) => {
    let c = 0
    while (c < row.length) {
      const ch = row[c]
      let end = c
      while (end < row.length && row[end] === ch) end++
      if (colour[ch]) rect(x + c * P, y + r * P, (end - c) * P + 0.08, P + 0.08, colour[ch])
      c = end
    }
  })
}

// Everyone blinks now and then, each on their own beat (seed), and someone
// sitting breathes: the body rises half a sprite pixel and settles.
const isBlinking = (t, seed) => (t + seed * 613) % 4300 < 140
const breath = (t, seed) => ((t + seed * 311) % 2600 < 1300 ? 0 : P / 2)

// A person on their feet at (x, y).
export const standing = (x, y, look, facing, isWalking, t, seed = 0) => {
  const body = facing === 'back' ? BACK : facing === 'front' ? BODY : SIDE
  const isSide = facing === 'left' || facing === 'right'
  const frames = isWalking ? (isSide ? SIDE_WALK : FRONT_WALK) : [isSide ? SIDE_STAND : LEGS]
  const i = isWalking ? Math.floor(t / 130) % 4 : 0
  // Down a pixel as a foot lands: the bob of a step, body over the waist.
  const sink = isWalking && i % 2 === 0 ? P : 0
  const top = y - (body.length + 4) * P
  shadow(x, y + 1, 9, 2.8)
  ctx.save()
  if (facing === 'left') {
    ctx.translate(x * 2, 0)
    ctx.scale(-1, 1)
  }
  paintRows(body, look, x - 5 * P, top + sink, facing !== 'back' && isBlinking(t, seed))
  paintRows(frames[i], look, x - 5 * P, top + body.length * P)
  ctx.restore()
}

// A person sitting at a desk, feet hidden: the body from (x, y) up.
export const sitting = (x, y, look, handUp, t, seed = 0) => {
  const top = y - BODY.length * P - breath(t, seed)
  paintRows(BODY, look, x - 5 * P, top, isBlinking(t, seed))
  if (handUp) {
    const wave = Math.floor(t / 350) % 2
    const left = x + 5 * P + wave
    rect(left, top - wave, 2 * P, 8 * P, OUTLINE)
    rect(left, top + P - wave, P, 2 * P, look.skin)
    rect(left, top + 3 * P - wave, P, 4 * P, look.shirt)
  }
}

// Sitting with the back to us: the near side of the meeting table.
export const sittingBack = (x, y, look) => {
  shadow(x, y + 1, 9, 2.6)
  paintRows(BACK, look, x - 5 * P, y - BACK.length * P)
}

// On the floor, legs crossed, laptop on the lap.
export const onTheFloor = (x, y, look, t, seed) => {
  shadow(x, y + 1, 12, 3)
  sitting(x, y - 4, look, false, t, seed)
  rect(x - 11, y - 6, 22, 6, OUTLINE)
  rect(x - 10, y - 5, 20, 4, '#3B4A6B')
  // The laptop, its screen towards them
  rect(x - 9, y - 14, 18, 2.5, OUTLINE)
  rect(x - 9, y - 11.5, 18, 6, OUTLINE)
  rect(x - 8, y - 10.5, 16, 4, '#C9CED3')
  rect(x - 6, y - 9.5, 12, 0.8, '#9CA6B0')
  rect(x - 6, y - 8, 12, 0.8, '#9CA6B0')
}

// Hands on the keyboard, typing while at work.
export const hands = (cx, dy, look, isTyping, t) => {
  const lift = isTyping ? [0, -1.5, 0, -0.5][Math.floor(t / 75) % 4] : 0
  rect(cx - 11, dy + 9 + lift, 7, 5, OUTLINE)
  rect(cx - 10, dy + 10 + lift, 5, 3, look.skin)
  rect(cx + 4, dy + 9 - lift, 7, 5, OUTLINE)
  rect(cx + 5, dy + 10 - lift, 5, 3, look.skin)
}

// What a helper on the floor has to say about it, now and then, in turn
// with what it is doing.
const GRUMBLES = [
  'Av, min ryg',
  'Har vi ikke en stol?',
  'Jeg vil også have et skrivebord',
  'Gulvet er koldt',
  'Laptop på skødet, seriøst?',
  'Hvem har taget min plads?',
  'Jeg skriver det her i et klagebrev',
  'Mine ben sover',
]
export const grumbleAt = (t, seed) => ((t + seed * 997) % 9000 < 3000 ? GRUMBLES[Math.floor((t + seed * 997) / 9000 + seed) % GRUMBLES.length] : null)

// A pixel portrait for the list, head and shoulders, drawn once per look and kept.
const portraits = new Map()
export const portraitOf = (key, look) => {
  if (!portraits.has(key)) {
    const size = 3
    const c = document.createElement('canvas')
    c.width = 12 * size
    c.height = 12 * size
    const g = c.getContext('2d')
    const colour = coloursOf(look)
    BODY.forEach((row, r) => {
      ;[...row].forEach((ch, x) => {
        if (!colour[ch]) return
        g.fillStyle = colour[ch]
        g.fillRect((x + 1) * size, (r + 2) * size, size, size)
      })
    })
    portraits.set(key, c.toDataURL())
  }
  return portraits.get(key)
}
