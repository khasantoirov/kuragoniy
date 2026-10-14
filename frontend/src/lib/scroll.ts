import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

/* Page scrolling helpers.

   The page normally scrolls on the viewport (window). Engines without
   `overflow: clip` keep the old layout where <body> itself is the scroll
   container (see legacy.css), so everything here goes through
   pageScroller() instead of assuming window.scrollY. */

let bodyScrolls: boolean | null = null

function pageScroller(): HTMLElement {
  if (bodyScrolls === null) bodyScrolls = getComputedStyle(document.body).overflowY !== 'visible'
  return bodyScrolls ? document.body : ((document.scrollingElement as HTMLElement) ?? document.documentElement)
}

export function pageScrollTop() {
  return pageScroller().scrollTop
}

/** 0..1 — how far down the page the reader is. */
export function pageScrollProgress() {
  const el = pageScroller()
  const max = el.scrollHeight - el.clientHeight
  return max > 0 ? Math.min(1, el.scrollTop / max) : 0
}

export function scrollPageTo(top: number, smooth = false) {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  // 'instant' explicitly, so a CSS scroll-behavior can never turn a
  // route-change reset into a visible slide.
  pageScroller().scrollTo({ top, behavior: smooth && !reduce ? 'smooth' : ('instant' as ScrollBehavior) })
}

/** Calls `cb` at most once per animation frame while the page scrolls. */
export function subscribePageScroll(cb: () => void) {
  let frame = 0
  const fire = () => {
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      cb()
    })
  }
  window.addEventListener('scroll', fire, { passive: true })
  document.body.addEventListener('scroll', fire, { passive: true })
  window.addEventListener('resize', fire, { passive: true })
  return () => {
    window.removeEventListener('scroll', fire)
    document.body.removeEventListener('scroll', fire)
    window.removeEventListener('resize', fire)
    if (frame) cancelAnimationFrame(frame)
  }
}

/** True once the page is scrolled past `threshold` px — re-renders only
 * when that flips, not on every scroll frame. */
export function usePageScrolled(threshold: number) {
  return useSyncExternalStore(subscribePageScroll, () => pageScrollTop() > threshold, () => false)
}

/* Ref-counted scroll lock — a modal opened over the mobile menu (or two
   stacked modals) must not unlock the page when only one of them closes. */
let locks = 0
export function lockPageScroll() {
  if (locks++ === 0) {
    const root = document.documentElement
    root.style.setProperty('--lock-gap', `${Math.max(0, window.innerWidth - root.clientWidth)}px`)
    root.classList.add('is-locked')
    document.body.classList.add('is-locked')
  }
  let released = false
  return () => {
    if (released) return
    released = true
    if (--locks === 0) {
      document.documentElement.classList.remove('is-locked')
      document.body.classList.remove('is-locked')
    }
  }
}

/* Scroll position per history entry: a new page opens at the top, Back /
   Forward (and a reload) return to where the reader was, and changing
   only the query string (filters, search) leaves the scroll alone. */
const STORE_KEY = 'af-scroll'
const MAX_ENTRIES = 60

function readPositions(): Record<string, number> {
  try {
    return JSON.parse(sessionStorage.getItem(STORE_KEY) || '{}')
  } catch {
    return {}
  }
}

function writePositions(map: Record<string, number>) {
  try {
    const keys = Object.keys(map)
    for (const k of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) delete map[k]
    sessionStorage.setItem(STORE_KEY, JSON.stringify(map))
  } catch {
    // Private mode / storage disabled — positions just aren't remembered.
  }
}

export function useScrollRestoration() {
  const location = useLocation()
  const navType = useNavigationType()
  const positions = useRef<Record<string, number>>(readPositions())
  // The key alone repeats as 'default' for a tab's first entry, so a URL
  // typed into the same tab later must not inherit that page's position.
  const entry = location.key + location.pathname
  const keyRef = useRef(entry)
  const pathRef = useRef<string | null>(null)
  const restoring = useRef(0)

  useEffect(() => {
    const prev = history.scrollRestoration
    history.scrollRestoration = 'manual'
    return () => {
      history.scrollRestoration = prev
    }
  }, [])

  useEffect(() => {
    const map = positions.current
    let saveTimer: ReturnType<typeof setTimeout> | undefined
    const off = subscribePageScroll(() => {
      if (restoring.current) return
      map[keyRef.current] = Math.round(pageScrollTop())
      clearTimeout(saveTimer)
      saveTimer = setTimeout(() => writePositions(map), 250)
    })
    return () => {
      off()
      clearTimeout(saveTimer)
      writePositions(map)
    }
  }, [])

  useLayoutEffect(() => {
    keyRef.current = entry
    const samePage = pathRef.current === location.pathname
    pathRef.current = location.pathname
    cancelAnimationFrame(restoring.current)
    restoring.current = 0

    if (navType === 'POP') {
      const target = positions.current[entry] ?? 0
      // Lazy pages and fresh queries render their content a moment after
      // the route changes — keep trying until the page is tall enough
      // (or the reader starts scrolling themselves).
      const started = performance.now()
      const stop = () => {
        cancelAnimationFrame(restoring.current)
        restoring.current = 0
        window.removeEventListener('wheel', stop)
        window.removeEventListener('touchstart', stop)
        window.removeEventListener('keydown', stop)
      }
      const attempt = () => {
        scrollPageTo(target)
        if (Math.abs(pageScrollTop() - target) <= 2 || performance.now() - started > 1500) {
          stop()
          return
        }
        restoring.current = requestAnimationFrame(attempt)
      }
      window.addEventListener('wheel', stop, { passive: true })
      window.addEventListener('touchstart', stop, { passive: true })
      window.addEventListener('keydown', stop)
      restoring.current = requestAnimationFrame(attempt)
      scrollPageTo(target)
      return stop
    }
    if (!samePage && !location.hash) scrollPageTo(0)
  }, [entry, location.pathname, location.hash, navType])
}
