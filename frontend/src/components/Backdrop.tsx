import { useEffect, useRef } from 'react'

// Ported 1:1 from js/backdrop.js — floating formula labels + a canvas
// starfield with proximity link-lines, themed via the --bg-star CSS var.
const FORMULAS = [
  'F = m·a', 'E = mc²', 'v = a·t', 'Q = c·m·Δt', 'p = m·v',
  'λ = v/ν', 'W = F·s', 'ρ = m/V', 'P = U·I', 'a = Δv/Δt',
  'Ek = mv²/2', 'F = qE', 'n = sinα/sinβ', 'T = 2π√(l/g)',
]

export function Backdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const cv = canvasRef.current
    if (!cv) return
    const cx = cv.getContext('2d')!
    let w = 0, h = 0
    let pts: { x: number; y: number; vx: number; vy: number; r: number }[] = []
    let raf = 0
    let stopped = false

    const size = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2)
      w = cv.width = innerWidth * dpr
      h = cv.height = innerHeight * dpr
      cv.style.width = innerWidth + 'px'
      cv.style.height = innerHeight + 'px'
      const n = Math.min(90, Math.round((innerWidth * innerHeight) / 22000))
      pts = Array.from({ length: n }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.16 * dpr,
        vy: (Math.random() - 0.5) * 0.16 * dpr,
        r: (Math.random() * 1.5 + 0.7) * dpr,
      }))
    }

    const ink = () => getComputedStyle(document.documentElement).getPropertyValue('--bg-star').trim() || '120,150,190'

    const tick = () => {
      if (stopped) return
      const c = ink()
      cx.clearRect(0, 0, w, h)
      for (const p of pts) {
        p.x += p.vx
        p.y += p.vy
        if (p.x < 0 || p.x > w) p.vx *= -1
        if (p.y < 0 || p.y > h) p.vy *= -1
        cx.beginPath()
        cx.arc(p.x, p.y, p.r, 0, 6.284)
        cx.fillStyle = `rgba(${c},.75)`
        cx.fill()
      }
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i].x - pts[j].x
          const dy = pts[i].y - pts[j].y
          const d2 = dx * dx + dy * dy
          const max = 150 * 150 * (devicePixelRatio || 1)
          if (d2 < max) {
            cx.beginPath()
            cx.moveTo(pts[i].x, pts[i].y)
            cx.lineTo(pts[j].x, pts[j].y)
            cx.strokeStyle = `rgba(${c},${0.18 * (1 - d2 / max)})`
            cx.lineWidth = 1
            cx.stroke()
          }
        }
      }
      raf = requestAnimationFrame(tick)
    }

    size()
    addEventListener('resize', size, { passive: true })
    tick()

    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      removeEventListener('resize', size)
    }
  }, [])

  return (
    <div id="bg" aria-hidden="true">
      <canvas id="bg-stars" ref={canvasRef} />
      <div className="bg-forms">
        {FORMULAS.map((f, i) => (
          <span
            key={f}
            className="bg-f"
            style={{
              left: `${(i * 7.3 + 4) % 92}%`,
              top: `${(i * 13.7 + 8) % 88}%`,
              fontSize: `${13 + (i % 4) * 5}px`,
              animationDuration: `${22 + (i % 6) * 7}s`,
              animationDelay: `-${i * 3}s`,
            }}
          >
            {f}
          </span>
        ))}
      </div>
    </div>
  )
}
