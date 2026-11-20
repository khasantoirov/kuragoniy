import { useEffect, useRef } from 'react'

import type { Sim } from './sims'

// Close to the real stage's shape (its canvas is 480px tall), so sims
// laid out for it still fit.
const W = 640
const H = 400

/** A small live view of an experiment for its card: drawn once when it
 * scrolls into view (half a second in, so something is already moving), and running while `live` (the card is
 * hovered or focused). */
export function SimThumb({ sim, live }: { sim: Sim; live: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef<unknown>(null)
  const valsRef = useRef<Record<string, number>>({})

  const paint = () => {
    const cv = ref.current
    const ctx = cv?.getContext('2d')
    if (!cv || !ctx || stateRef.current === null) return
    try {
      ctx.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0)
      ctx.clearRect(0, 0, W, H)
      sim.draw(ctx, W, H, stateRef.current, valsRef.current)
    } catch {
      // a thumbnail is decoration — a sim that can't draw small just stays blank
    }
  }

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    cv.width = Math.round(W * dpr)
    cv.height = Math.round(H * dpr)
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return
      io.disconnect()
      try {
        valsRef.current = Object.fromEntries(sim.controls.map((c) => [c.k, c.val]))
        const st = sim.init(valsRef.current)
        for (let i = 0; i < 15; i++) sim.step(st, 1 / 30, valsRef.current)
        stateRef.current = st
      } catch {
        return
      }
      paint()
    }, { rootMargin: '240px' })
    io.observe(cv)
    return () => io.disconnect()
  }, [sim])

  useEffect(() => {
    if (!live) return
    let raf = 0
    let last = 0
    const loop = (ts: number) => {
      const dt = last ? Math.min((ts - last) / 1000, 0.05) : 0
      last = ts
      if (stateRef.current !== null) {
        try {
          sim.step(stateRef.current, dt, valsRef.current)
        } catch {
          return
        }
        paint()
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [live, sim])

  return <canvas ref={ref} className="labexp__cv" aria-hidden="true" />
}
