// ── Tooltips ─────────────────────────────────────────────────────────────
// Our own tooltips, in the page's dark style, for anything with a title:
// the browser's grey ones look out of place. A title is moved to data-tip
// the first time the pointer or the keyboard reaches it, so code anywhere
// can go on setting `title` and the tooltip follows.
import { el } from './util.js'

const DELAY_MS = 300
const tip = el('div', { className: 'tip', role: 'tooltip', id: 'tip', hidden: true }, [])
document.body.append(tip)
let target = null
let timer = null

// Under the element, or over it when there is no room below; inside the window.
const place = node => {
  const box = node.getBoundingClientRect()
  const width = tip.offsetWidth
  const height = tip.offsetHeight
  const x = Math.max(8, Math.min(window.innerWidth - width - 8, box.left + box.width / 2 - width / 2))
  const isAbove = box.bottom + height + 10 > window.innerHeight
  const y = isAbove ? box.top - height - 8 : box.bottom + 8
  tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`
  tip.dataset.side = isAbove ? 'above' : 'below'
  tip.style.setProperty('--arrow', `${Math.round(box.left + box.width / 2 - x)}px`)
}

const show = node => {
  if (!node.isConnected || !node.dataset.tip) return
  tip.textContent = node.dataset.tip
  tip.hidden = false
  node.setAttribute('aria-describedby', 'tip')
  place(node)
}

const hide = () => {
  clearTimeout(timer)
  target?.removeAttribute('aria-describedby')
  target = null
  tip.hidden = true
}

const reach = node => {
  if (!node || node === target) return
  if (node.hasAttribute('title')) {
    node.dataset.tip = node.getAttribute('title')
    node.removeAttribute('title')
  }
  hide()
  target = node
  timer = setTimeout(() => show(node), DELAY_MS)
}

const tipped = e => e.target.closest?.('[title], [data-tip]') ?? null
document.addEventListener('pointerover', e => reach(tipped(e)))
document.addEventListener('pointerout', e => {
  if (target && !target.contains(e.relatedTarget)) hide()
})
document.addEventListener('focusin', e => reach(tipped(e)))
document.addEventListener('focusout', hide)
document.addEventListener('pointerdown', hide)
document.addEventListener('keydown', e => e.key === 'Escape' && hide())
window.addEventListener('scroll', hide, true)
