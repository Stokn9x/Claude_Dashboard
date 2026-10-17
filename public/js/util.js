// Small helpers every part of the page uses.
import { L, locale } from './i18n.js'

export const hashOf = id => {
  let h = 0
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h
}

// Ids that differ only at the end ("agent-1", "agent-2") hash to neighbouring
// numbers, whose high bits are the same: each trait is picked from the hash
// stirred with its own salt, so neighbours look nothing alike.
export const stir = (h, salt) => {
  let x = (h ^ Math.imul(salt, 0x9e3779b1)) >>> 0
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0
  return (x ^ (x >>> 16)) >>> 0
}

export const number = n => Math.floor(n).toLocaleString(locale())
export const kr = n => `${number(n)} kr`
export const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

// Whether a point lies in a rectangle [x, y, w, h].
export const isIn = (x, y, [rx, ry, rw, rh]) => x >= rx && x <= rx + rw && y >= ry && y <= ry + rh

// A DOM element with its properties and children, in one call.
export const el = (tagName, props = {}, children = []) => {
  const node = Object.assign(document.createElement(tagName), props)
  for (const child of children) node.append(child)
  return node
}

// localStorage can be missing or throw (a private window, blocked storage);
// the page works without it.
export function remembered(key) {
  try {
    return localStorage.getItem(`agent-kontor:${key}`)
  } catch {
    return null
  }
}
export function remember(key, value) {
  try {
    localStorage.setItem(`agent-kontor:${key}`, value)
  } catch {}
}

// Which Claude model a helper runs on, as a short name, from the model id;
// null when it is not said.
export const modelFamily = model => {
  const m = String(model ?? '')
  return /opus/i.test(m) ? 'Opus' : /sonnet/i.test(m) ? 'Sonnet' : /haiku/i.test(m) ? 'Haiku' : /fable/i.test(m) ? 'Fable' : null
}
// An agent type in the page's language, for the card; one we do not know by
// its own name.
const typeTexts = () => ({ Explore: L('Udforsker', 'Explorer'), Plan: L('Planlægger', 'Planner'), 'general-purpose': 'Generalist' })
export const typeText = type => (type ? typeTexts()[type] ?? type : null)

// A regular (one of your own agents) by the name it was given on the page,
// over its agent's own; `agentName` keeps the own one for the card.
export const crewNamed = data => {
  const names = data?.game?.crew?.names ?? {}
  if (!Object.keys(names).length) return data
  const named = sub => (sub.staff && names[sub.staff] ? { ...sub, name: names[sub.staff], agentName: sub.name } : sub)
  return { ...data, sessions: (data.sessions ?? []).map(s => ({ ...s, subs: (s.subs ?? []).map(named) })) }
}
