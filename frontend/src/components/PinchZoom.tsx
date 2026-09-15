import { useRef, useState, type ReactNode, type TouchEvent } from 'react'

const MIN_ZOOM = 0.6
const MAX_ZOOM = 2.5

function touchDist(a: { clientX: number; clientY: number }, b: { clientX: number; clientY: number }) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
}

/** Pinch-to-zoom state, consumed by ZoomBox (the thing that actually gets
 * bigger/smaller) which must render *inside* ScaleToFit's own auto-fit div,
 * never wrapping ScaleToFit itself. ScaleToFit measures its own container's
 * width via ResizeObserver to decide how much to shrink, and a `zoom` on an
 * *ancestor* of that measuring element shrinks how much local space it
 * perceives (fewer "local" CSS px are needed to fill the same physical area
 * once zoom > 1) — so wrapping ScaleToFit itself in the pinch-zoom box made
 * zooming in trick ScaleToFit into shrinking further to "compensate",
 * visually cancelling the zoom back out. Putting ZoomBox *inside*
 * ScaleToFit's already-computed scale sidesteps that entirely: a
 * descendant's zoom never affects an ancestor's own size measurement. */
export function usePinchZoom() {
  const [zoom, setZoom] = useState(1)
  const pinchStartDist = useRef<number | null>(null)
  const zoomAtPinchStart = useRef(1)

  const clamp = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))

  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 2) {
      pinchStartDist.current = touchDist(e.touches[0], e.touches[1])
      zoomAtPinchStart.current = zoom
    }
  }
  const onTouchMove = (e: TouchEvent) => {
    if (e.touches.length === 2 && pinchStartDist.current) {
      e.preventDefault()
      setZoom(clamp((zoomAtPinchStart.current * touchDist(e.touches[0], e.touches[1])) / pinchStartDist.current))
    }
  }
  const onTouchEnd = (e: TouchEvent) => {
    if (e.touches.length < 2) pinchStartDist.current = null
  }

  return { zoom, touchHandlers: { onTouchStart, onTouchMove, onTouchEnd } }
}

export type PinchZoomState = ReturnType<typeof usePinchZoom>

/** The actual zoomable/pannable box — render this as ScaleToFit's child
 * (never wrapping ScaleToFit) so the two scales compose instead of
 * fighting — see usePinchZoom's comment above. Always starts unwrapped in
 * effect (zoom defaults to 1x), identical to not being there at all. */
export function ZoomBox({ zoom, touchHandlers, children }: Pick<PinchZoomState, 'zoom' | 'touchHandlers'> & { children: ReactNode }) {
  const isZoomedIn = zoom > 1.02
  return (
    <div className={`pinchzoom__box ${isZoomedIn ? 'pinchzoom__box--scroll' : ''}`} {...touchHandlers}>
      <div className="pinchzoom__inner" style={{ zoom }}>
        {children}
      </div>
    </div>
  )
}
