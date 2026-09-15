import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

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
 */
export function ScaleToFit({ naturalWidth, children }: { naturalWidth: number; children: ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [needsShrink, setNeedsShrink] = useState(false)

  useLayoutEffect(() => {
    const outer = outerRef.current
    if (!outer) return
    const recompute = () => {
      const availW = outer.clientWidth
      setNeedsShrink(availW < naturalWidth)
      setScale(Math.min(1, availW / naturalWidth))
    }
    recompute()
    const ro = new ResizeObserver(recompute)
    ro.observe(outer)
    return () => ro.disconnect()
  }, [naturalWidth])

  if (!needsShrink) {
    return <div ref={outerRef}>{children}</div>
  }

  return (
    <div ref={outerRef}>
      <div className="scale-to-fit__inner" style={{ width: naturalWidth, zoom: scale }}>
        {children}
      </div>
    </div>
  )
}
