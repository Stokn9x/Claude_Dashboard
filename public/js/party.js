// ── Celebrations ─────────────────────────────────────────────────────────
// Five seconds of joy over someone's desk: confetti for green tests, a rain
// cloud for red ones, balloons for a commit or a pull request, and a plate
// that says what happened.
import { OUTLINE, circle, ctx, rect, tag } from './gfx.js'

export const party = (p, spot, t) => {
  const age = (t - p.at) / 1000
  if (age < 0 || age > 5) return
  if (p.kind === 'confetti') {
    const colours = ['#E5484D', '#3E7CC9', '#D6A23C', '#2E9E8F', '#8A6FD6', '#E07A4F']
    for (let i = 0; i < 40; i++) {
      const dur = 1.3 + (i % 5) * 0.18
      const k = ((age + (i % 7) * 0.12) % dur) / dur
      const x = spot.cx + (((i * 37 + 11) % 97) / 97) * 120 - 60 + Math.sin(age * 3 + i) * 3
      ctx.globalAlpha = 1 - k
      rect(x, spot.dy - 60 + k * 75, 3, i % 3 === 0 ? 2 : 3, colours[i % colours.length])
    }
    ctx.globalAlpha = 1
  } else if (p.kind === 'rain') {
    for (let i = 0; i < 9; i++) {
      const k = ((age + (i % 4) * 0.17) % 0.7) / 0.7
      rect(spot.cx - 18 + i * 4.5, spot.dy - 50 + k * 28, 1.5, 4, '#5DA9E9')
    }
    for (const [dx, dy, r] of [[-14, 6, 9], [0, 2, 12], [14, 6, 9], [-6, 10, 9], [8, 10, 9]]) circle(spot.cx + dx, spot.dy - 66 + dy, r, '#8B97A6', OUTLINE)
    rect(spot.cx - 18, spot.dy - 56, 36, 6, '#8B97A6')
  } else {
    ;['#E5484D', '#D6A23C', '#3E7CC9'].forEach((c, i) => {
      const rise = Math.min(1, age / (3 + i * 0.4)) * 80
      const x = spot.cx - 22 + i * 22 + Math.sin(age * 2 + i) * 2
      const y = spot.dy - 10 - rise
      ctx.strokeStyle = OUTLINE
      ctx.lineWidth = 0.8
      ctx.beginPath()
      ctx.moveTo(x, y + 8)
      ctx.quadraticCurveTo(x - 3, y + 16, x, y + 24)
      ctx.stroke()
      ctx.beginPath()
      ctx.ellipse(x, y, 7, 9, 0, 0, Math.PI * 2)
      ctx.fillStyle = c
      ctx.fill()
      ctx.lineWidth = 1
      ctx.stroke()
    })
  }
  tag(spot.cx, spot.dy - 78, p.label, p.kind === 'rain' ? '#5B6B7E' : '#2E9E8F')
}
