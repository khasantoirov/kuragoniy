import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'

/** A link, or (with `onClick`) a button such as "Menyu". */
export type RailItem = { to: string; icon: ReactNode; label: string; onClick?: () => void }

type Rect = { left: number; width: number }

/** The phone bottom bar's row of sections. The active one sits on a solid
 * rounded block (the "magnetic" look) that slides from tab to tab;
 * `interactive: false` renders an inert copy for the settings preview. */
export function NavRail({
  items,
  activeTo,
  interactive = true,
}: {
  items: RailItem[]
  activeTo: string
  interactive?: boolean
}) {
  const railRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Record<string, HTMLElement | null>>({})
  const [rect, setRect] = useState<Rect | null>(null)

  useLayoutEffect(() => {
    const rail = railRef.current
    if (!rail) return
    // offsetLeft/offsetWidth, not getBoundingClientRect(): the app runs
    // under `body { zoom: 1.1 }` (legacy.css), and getBoundingClientRect
    // returns post-zoom pixels — fed into a CSS transform (pre-zoom local
    // space) the 1.1x would apply twice and the block would land ~10% off.
    const measure = () => {
      const el = itemRefs.current[activeTo]
      setRect(el ? { left: el.offsetLeft, width: el.offsetWidth } : null)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(rail)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [activeTo, items.length])

  const body = (item: RailItem) => (
    <>
      <span className="bottomnav__ic">{item.icon}</span>
      <span className="bottomnav__lb">{item.label}</span>
    </>
  )
  const keep = (to: string) => (el: HTMLElement | null) => {
    itemRefs.current[to] = el
  }

  return (
    <div className="bottomnav__rail" ref={railRef}>
      {rect && <span className="navind" style={{ transform: `translateX(${rect.left}px)`, width: rect.width }} />}
      {items.map((item) =>
        !interactive ? (
          <div key={item.to} ref={keep(item.to)} className={`bottomnav__item ${item.to === activeTo ? 'is-on' : ''}`}>{body(item)}</div>
        ) : item.onClick ? (
          <button key={item.to} ref={keep(item.to)} type="button" className={`bottomnav__item ${item.to === activeTo ? 'is-on' : ''}`}
            onClick={item.onClick} title={item.label}>
            {body(item)}
          </button>
        ) : (
          <NavLink
            key={item.to}
            ref={keep(item.to)}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => `bottomnav__item ${isActive ? 'is-on' : ''}`}
            title={item.label}
          >
            {body(item)}
          </NavLink>
        ),
      )}
    </div>
  )
}
