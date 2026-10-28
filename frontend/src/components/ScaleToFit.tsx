import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { emojiIcon } from '@/icons'

/**
 * Shrinks content to fit a container narrower than its known natural width
 * (a phone screen too narrow for the timetable's columns) so it reads as
 * one whole grid instead of requiring horizontal scroll — never grows past
 * 1:1. When the container is already wide enough, renders `children`
 * completely unwrapped so their own fluid CSS (width:100%,
 * table-layout:fixed columns) fills the available width normally; the
 * scaling wrapper only exists for the narrower case, so it can't fight
 * that fluid growth on a wide screen the way a permanently-applied
 * shrink would.
 *
 * Uses `zoom` rather than `transform: scale()` — a transform only repaints
 * smaller without shrinking the box it lays out in, so it needs an
 * `overflow: hidden` ancestor plus a separately measured "reserve" height
 * to avoid leaving a tall blank gap below the shrunk content. That
 * `overflow: hidden` ancestor is exactly what corrupts `position: sticky`
 * on the timetable's header row in Chrome: cells inside it render a full
 * row-height below where they belong, overlapping the first data row,
 * even before any scrolling happens (only on the narrower screens where
 * this shrink path activates, which is why it went unnoticed until tested
 * on a phone-width viewport — see AllView's sticky header in
 * TimetablePage.tsx). `zoom` shrinks the real layout box, so the parent
 * naturally sizes to the shrunk content with no reserve/clip trick
 * needed, and there's no `overflow: hidden` ancestor left to break sticky.
 *
 * `--shrink-scale` exposes this zoom factor to CSS: a sticky element in
 * here sits inside both this zoom AND the page's own body zoom, so its
 * `top` offset (meant to clear the fixed-height topbar) gets shrunk by
 * this factor too and lands too high, poking up behind the topbar instead
 * of flush below it. legacy.css divides the offset back out by this
 * variable (falling back to 1 outside this wrapper) to compensate.
 *
 * On a phone or tablet the fitted table is far too small to read (12
 * teachers on a 390px screen is ~1/5 scale), so there it renders inside
 * ZoomViewer instead: the same fitted overview to start with, plus pinch
 * and −/+ buttons that zoom up to past natural size, panned by ordinary
 * scrolling.
 */
export function ScaleToFit({ naturalWidth, children }: { naturalWidth: number; children: ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [needsShrink, setNeedsShrink] = useState(false)
  const [touch, setTouch] = useState(false)

  useLayoutEffect(() => {
    const outer = outerRef.current
    if (!outer) return
    const recompute = () => {
      const availW = outer.clientWidth
      setNeedsShrink(availW < naturalWidth)
      setScale(Math.min(1, availW / naturalWidth))
      setTouch(window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= 760)
    }
    recompute()
    const ro = new ResizeObserver(recompute)
    ro.observe(outer)
    return () => ro.disconnect()
  }, [naturalWidth])

  if (!needsShrink) {
    return <div ref={outerRef}>{children}</div>
  }

  if (touch) {
    return (
      <div ref={outerRef}>
        <ZoomViewer naturalWidth={naturalWidth}>{children}</ZoomViewer>
      </div>
    )
  }

  return (
    <div ref={outerRef}>
      <div
        className="scale-to-fit__inner"
        style={{ width: naturalWidth, zoom: scale, ['--shrink-scale' as string]: scale } as CSSProperties}
      >
        {children}
      </div>
    </div>
  )
}

// Zoom is in units of the natural size: 1 = every column at its full
// width. The bottom of the range is "fit the screen width".
const MAX_ZOOM = 1.4
const STEP = 1.8

type Gesture = { d0: number; m0x: number; m0y: number; sL: number; sT: number; z0: number; s: number; mx: number; my: number }

/** A scroll box that holds the table at a zoom between fit-to-width and
 * MAX_ZOOM. Pinching previews with a GPU transform on `stage` (cheap — no
 * relayout of a few hundred cells per finger move) anchored under the
 * fingers, and on release commits it as a real `zoom` on `inner` plus the
 * scroll offset that keeps the same spot under the fingers. The box is a
 * real scroll container, so panning, momentum and the sticky header row /
 * day-hour columns all come from the browser. */
function ZoomViewer({ naturalWidth, children }: { naturalWidth: number; children: ReactNode }) {
  const { t } = useTranslation()
  const box = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const fit = useRef(1)
  const zoom = useRef(1)
  const atFit = useRef(true)
  const gesture = useRef<Gesture | null>(null)
  const [edge, setEdge] = useState<{ min: boolean; max: boolean }>({ min: true, max: false })

  // Commits a zoom level and the scroll offset (in the new zoom's px).
  const apply = (z: number, left: number, top: number) => {
    const el = box.current
    const st = stage.current
    const inn = inner.current
    if (!el || !st || !inn) return
    const nz = Math.min(MAX_ZOOM, Math.max(fit.current, z))
    const wasFit = atFit.current
    zoom.current = nz
    atFit.current = nz <= fit.current * 1.01
    inn.style.zoom = String(nz)
    st.style.transform = ''
    st.style.willChange = ''
    el.style.height = ''
    el.scrollLeft = left
    el.scrollTop = top
    setEdge({ min: atFit.current, max: nz >= MAX_ZOOM * 0.99 })
    // Leaving the overview: bring the whole box on screen, just below the
    // topbar, so the zoomed table gets all the room there is.
    if (wasFit && !atFit.current) {
      const r = el.getBoundingClientRect()
      const k = r.width / el.offsetWidth || 1
      const topbar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--topbar-h')) || 64
      const delta = r.top - (topbar + 8) * k
      if (Math.abs(delta) > 4) window.scrollBy({ top: delta, behavior: 'smooth' })
    }
  }

  // Zoom by a factor around a point of the box (box-local CSS px).
  const zoomAround = (factor: number, cx: number, cy: number) => {
    const el = box.current
    if (!el) return
    const z0 = zoom.current
    const nz = Math.min(MAX_ZOOM, Math.max(fit.current, z0 * factor))
    const s = nz / z0
    apply(nz, (el.scrollLeft + cx) * s - cx, (el.scrollTop + cy) * s - cy)
  }
  const zoomCenter = (factor: number) => {
    const el = box.current
    if (el) zoomAround(factor, el.clientWidth / 2, el.clientHeight / 2)
  }
  const toFit = () => {
    const el = box.current
    if (el) apply(fit.current, 0, (el.scrollTop * fit.current) / zoom.current)
  }

  // Fit-to-width zoom and the box's height (the screen below the topbar,
  // above the bottom nav). Body has CSS zoom, so screen px are divided by
  // the box's rendered/layout width ratio.
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    let lastW = -1
    const measure = () => {
      if (gesture.current) return
      const k = el.getBoundingClientRect().width / el.offsetWidth || 1
      const topbar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--topbar-h')) || 64
      const bottom = window.innerWidth <= 760 ? 96 : 24
      el.style.maxHeight = `${Math.max(300, Math.floor(window.innerHeight / k - topbar - bottom))}px`
      if (el.clientWidth === lastW) return
      lastW = el.clientWidth
      const prev = zoom.current
      fit.current = Math.min(1, el.clientWidth / naturalWidth)
      if (atFit.current || prev < fit.current) {
        const s = fit.current / prev
        apply(fit.current, 0, el.scrollTop * s)
      }
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [naturalWidth])

  // Pinch. Native listeners: React's touch handlers are passive, so they
  // can't stop the browser scrolling (or, on iOS, zooming the whole page)
  // under a two-finger gesture.
  useEffect(() => {
    const el = box.current
    const st = stage.current
    if (!el || !st) return
    const point = (e: TouchEvent) => {
      const [a, b] = [e.touches[0], e.touches[1]]
      const r = el.getBoundingClientRect()
      const k = r.width / el.offsetWidth || 1
      return {
        x: ((a.clientX + b.clientX) / 2 - r.left) / k - el.clientLeft,
        y: ((a.clientY + b.clientY) / 2 - r.top) / k - el.clientTop,
        d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
      }
    }
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 2) return
      if (e.cancelable) e.preventDefault()
      const p = point(e)
      gesture.current = { d0: p.d || 1, m0x: p.x, m0y: p.y, sL: el.scrollLeft, sT: el.scrollTop, z0: zoom.current, s: 1, mx: p.x, my: p.y }
      // Hold the box at full height while the preview grows past it.
      el.style.height = el.style.maxHeight
      st.style.willChange = 'transform'
    }
    const move = (e: TouchEvent) => {
      const g = gesture.current
      if (!g || e.touches.length !== 2) return
      if (e.cancelable) e.preventDefault()
      const p = point(e)
      const z = Math.min(MAX_ZOOM, Math.max(fit.current, (g.z0 * p.d) / g.d0))
      g.s = z / g.z0
      g.mx = p.x
      g.my = p.y
      const tx = g.mx + g.sL - (g.sL + g.m0x) * g.s
      const ty = g.my + g.sT - (g.sT + g.m0y) * g.s
      st.style.transform = `translate(${tx}px, ${ty}px) scale(${g.s})`
    }
    const end = (e: TouchEvent) => {
      const g = gesture.current
      if (!g || e.touches.length >= 2) return
      gesture.current = null
      apply(g.z0 * g.s, (g.sL + g.m0x) * g.s - g.mx, (g.sT + g.m0y) * g.s - g.my)
    }
    const stopPageZoom = (e: Event) => e.preventDefault()
    el.addEventListener('touchstart', start, { passive: false })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', end)
    el.addEventListener('touchcancel', end)
    el.addEventListener('gesturestart', stopPageZoom, { passive: false })
    return () => {
      el.removeEventListener('touchstart', start)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', end)
      el.removeEventListener('touchcancel', end)
      el.removeEventListener('gesturestart', stopPageZoom)
    }
  }, [])

  return (
    <div className="zoomview">
      <div className="zoomview__box" ref={box}>
        <div className="zoomview__stage" ref={stage}>
          <div className="scale-to-fit__inner zoomview__inner" ref={inner} style={{ width: naturalWidth }}>
            {children}
          </div>
        </div>
      </div>
      <div className="zoomview__ctl" role="group" aria-label={t('Masshtab')}>
        <button type="button" onClick={() => zoomCenter(1 / STEP)} disabled={edge.min} aria-label={t('Kichraytirish')} title={t('Kichraytirish')}>{emojiIcon('➖')}</button>
        <button type="button" onClick={() => zoomCenter(STEP)} disabled={edge.max} aria-label={t('Kattalashtirish')} title={t('Kattalashtirish')}>{emojiIcon('➕')}</button>
        <button type="button" onClick={toFit} disabled={edge.min} aria-label={t('Ekranga moslash')} title={t('Ekranga moslash')}>
          {emojiIcon('🔄')}
        </button>
      </div>
    </div>
  )
}
