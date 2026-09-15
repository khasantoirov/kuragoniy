import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'

import type { NavStyleKey } from './navStyles'

export type RailItem = { to: string; icon: ReactNode; label: string }

type Rect = { left: number; width: number; centerX: number }

function wavePath(railWidth: number, bumpX: number, railHeight: number) {
  const baseY = railHeight - 10
  const amp = 11
  const half = 26
  const x0 = Math.max(0, bumpX - half)
  const x1 = Math.min(railWidth, bumpX + half)
  return `M 0,${baseY} L ${x0},${baseY} C ${bumpX - half / 2},${baseY} ${bumpX - half / 2},${baseY - amp} ${bumpX},${baseY - amp} C ${bumpX + half / 2},${baseY - amp} ${bumpX + half / 2},${baseY} ${x1},${baseY} L ${railWidth},${baseY}`
}

/** The active-tab indicator, swapped per chosen nav style. Every variant is
 * positioned purely from the measured active item's box (`rect`), so all 11
 * share the same slide-to-active-tab mechanics and only differ in what they
 * draw. */
function Indicator({ styleKey, rect, railSize }: { styleKey: NavStyleKey; rect: Rect | null; railSize: { w: number; h: number } }) {
  if (!rect) return null
  const { left, width, centerX } = rect

  switch (styleKey) {
    case 'raised':
      return <span className="navind navind--raised" style={{ transform: `translateX(${centerX - 23}px)` }} />
    case 'liquid':
      return (
        <span
          className="navind navind--liquid"
          style={{ transform: `translateX(${left}px)`, width }}
        />
      )
    case 'magnetic':
      return (
        <span
          className="navind navind--magnetic"
          style={{ transform: `translateX(${left}px)`, width }}
        />
      )
    case 'capsule':
      return <span className="navind navind--capsule" style={{ transform: `translateX(${centerX - 19}px)` }} />
    case 'segmented':
      return <span className="navind navind--segmented" style={{ transform: `translateX(${centerX - 19}px)` }} />
    case 'orbit':
      return (
        <svg className="navind navind--orbit" style={{ transform: `translateX(${centerX - 32}px)` }} width="64" height="64" viewBox="-32 -32 64 64" aria-hidden="true">
          <g className="navind__orbit-spin">
            <g transform="rotate(-28)">
              <ellipse className="navind__ring" rx="22" ry="10" />
              <circle className="navind__dot" r="2.6">
                <animateMotion dur="3.2s" repeatCount="indefinite" path="M 22,0 A 22,10 0 1,1 -22,0 A 22,10 0 1,1 22,0" />
              </circle>
            </g>
            <g transform="rotate(28)">
              <ellipse className="navind__ring" rx="22" ry="10" />
              <circle className="navind__dot navind__dot--b" r="2.2">
                <animateMotion dur="4s" begin="-1.5s" repeatCount="indefinite" path="M -22,0 A 22,10 0 1,1 22,0 A 22,10 0 1,1 -22,0" />
              </circle>
            </g>
          </g>
        </svg>
      )
    case 'wave':
      return (
        <svg className="navind navind--wave" width={railSize.w || 1} height={railSize.h || 1} aria-hidden="true">
          <path className="navind__wavepath" d={wavePath(railSize.w || 1, centerX, railSize.h || 1)} fill="none" />
        </svg>
      )
    case 'neon':
      return (
        <span
          className="navind navind--neon"
          style={{ transform: `translateX(${left}px)`, width }}
        />
      )
    case 'blob':
      return (
        <span
          className="navind navind--blob"
          style={{ transform: `translateX(${centerX - 22}px)` }}
        />
      )
    case 'cards':
      return (
        <span className="navind navind--cards" style={{ transform: `translateX(${centerX - 21}px)` }}>
          <span className="navind__cardL" />
          <span className="navind__cardR" />
          <span className="navind__cardM" />
        </span>
      )
    case 'minimal':
      return <span className="navind navind--minimal" style={{ transform: `translateX(${centerX - 3}px)` }} />
    default:
      return null
  }
}

/** Shared row-of-icon-buttons rail used both by the live fixed bottom nav
 * and by the style previews on the settings page — `interactive: false`
 * renders inert preview buttons so picking a card in settings doesn't also
 * navigate the app. */
export function NavRail({
  items,
  activeTo,
  styleKey,
  interactive = true,
}: {
  items: RailItem[]
  activeTo: string
  styleKey: NavStyleKey
  interactive?: boolean
}) {
  const railRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Record<string, HTMLElement | null>>({})
  const [rect, setRect] = useState<Rect | null>(null)
  const [railSize, setRailSize] = useState({ w: 0, h: 0 })

  useLayoutEffect(() => {
    const rail = railRef.current
    if (!rail) return
    // offsetLeft/offsetWidth/clientWidth, not getBoundingClientRect(): the
    // app runs under `body { zoom: 1.1 }` (legacy.css), and getBoundingClientRect
    // already returns post-zoom pixels — feeding that into a CSS `transform`
    // (itself evaluated in the pre-zoom local space) applies the 1.1x a
    // second time, so every indicator lands ~10% too far right. offsetLeft
    // is relative to offsetParent (.bottomnav__rail itself, since it's
    // position:relative) in that same local space transforms use, so it
    // matches up correctly regardless of zoom.
    const measure = () => {
      const el = itemRefs.current[activeTo]
      setRailSize({ w: rail.clientWidth, h: rail.clientHeight })
      if (!el) {
        setRect(null)
        return
      }
      const left = el.offsetLeft
      setRect({ left, width: el.offsetWidth, centerX: left + el.offsetWidth / 2 })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(rail)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [activeTo, items.length, styleKey])

  return (
    <div className="bottomnav__rail" data-style={styleKey} ref={railRef}>
      <Indicator styleKey={styleKey} rect={rect} railSize={railSize} />
      {items.map((item) =>
        interactive ? (
          <NavLink
            key={item.to}
            ref={(el) => {
              itemRefs.current[item.to] = el
            }}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => `bottomnav__item ${isActive ? 'is-on' : ''}`}
            title={item.label}
          >
            <span className="bottomnav__ic">{item.icon}</span>
            <span className="bottomnav__lb">{item.label}</span>
          </NavLink>
        ) : (
          <div
            key={item.to}
            ref={(el) => {
              itemRefs.current[item.to] = el
            }}
            className={`bottomnav__item ${item.to === activeTo ? 'is-on' : ''}`}
          >
            <span className="bottomnav__ic">{item.icon}</span>
            <span className="bottomnav__lb">{item.label}</span>
          </div>
        ),
      )}
    </div>
  )
}
