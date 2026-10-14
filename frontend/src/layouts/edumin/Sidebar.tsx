import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, NavLink, useLocation } from 'react-router-dom'

import { IC } from '@/icons'
import { lockPageScroll } from '@/lib/scroll'
import { useUIStore } from '@/store/uiStore'

import { BrandMark } from './BrandMark'
import { useSideDrawer } from './sideDrawer'

export interface SideItem {
  to: string
  label: string
  icon: keyof typeof IC
  end?: boolean
}

export interface SideGroup {
  title: string
  items: SideItem[]
}

const MOBILE = '(max-width: 760px)'
const SCROLL_KEY = 'af-side-scroll'
const GROUPS_KEY = 'af-side-groups'

function readJson<T>(storage: () => Storage, key: string, fallback: T): T {
  try {
    return JSON.parse(storage().getItem(key) || 'null') ?? fallback
  } catch {
    return fallback
  }
}

function writeJson(storage: () => Storage, key: string, value: unknown) {
  try {
    storage().setItem(key, JSON.stringify(value))
  } catch {
    // Storage blocked — the menu still works, it just won't remember.
  }
}

function isActive(item: SideItem, pathname: string) {
  return item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(item.to + '/')
}

/** The ≡ button: folds the desktop menu down to icons, or opens the
 * drawer on a phone. */
export function SidebarToggle() {
  const { t } = useTranslation()
  const toggleMini = useUIStore((s) => s.toggleSidebarMini)
  const open = useSideDrawer((s) => s.open)
  const setOpen = useSideDrawer((s) => s.setOpen)
  const onClick = () => (window.matchMedia(MOBILE).matches ? setOpen(!open) : toggleMini())
  return (
    <button className="iconbtn edtop__menu" onClick={onClick} title={t('Menyu')} aria-label={t('Menyu')}>
      {IC.menu}
    </button>
  )
}

/** Side menu shared by the staff and student windows: the brand stays put
 * while the menu scrolls on its own (thin scrollbar, edge fades), the
 * current page is always scrolled into view, sections fold, and on a
 * phone the whole thing becomes a slide-in drawer. */
export function Sidebar({ home, groups, onNav, footer }: {
  home: string
  groups: SideGroup[]
  onNav?: () => void
  footer?: ReactNode
}) {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const open = useSideDrawer((s) => s.open)
  const setOpen = useSideDrawer((s) => s.setOpen)
  const navRef = useRef<HTMLElement>(null)
  const [edges, setEdges] = useState({ above: false, below: false })
  const [folded, setFolded] = useState<Record<string, boolean>>(() => readJson(() => localStorage, GROUPS_KEY, {}))
  const foldable = groups.length > 1

  const measure = useCallback(() => {
    const el = navRef.current
    if (!el) return
    const above = el.scrollTop > 2
    const below = el.scrollTop + el.clientHeight < el.scrollHeight - 2
    setEdges((prev) => (prev.above === above && prev.below === below ? prev : { above, below }))
  }, [])

  // Remember where the menu was scrolled across reloads.
  useLayoutEffect(() => {
    const el = navRef.current
    if (!el) return
    el.scrollTop = readJson(() => sessionStorage, SCROLL_KEY, 0)
    measure()
    let frame = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(() => {
        frame = 0
        measure()
      })
      clearTimeout(timer)
      timer = setTimeout(() => writeJson(() => sessionStorage, SCROLL_KEY, Math.round(el.scrollTop)), 200)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    return () => {
      el.removeEventListener('scroll', onScroll)
      ro.disconnect()
      cancelAnimationFrame(frame)
      clearTimeout(timer)
    }
  }, [measure])

  // A folded section still opens by itself while it holds the current
  // page — unless it was folded by hand on this very page.
  const activeGroup = groups.find((g) => g.items.some((item) => isActive(item, pathname)))?.title
  const [shutHere, setShutHere] = useState<string | null>(null)
  const isShut = (title: string) => foldable && !!folded[title] && (title !== activeGroup || shutHere === pathname)

  const toggleGroup = (title: string) => {
    const shut = !isShut(title)
    setFolded((prev) => {
      const next = { ...prev, [title]: shut }
      writeJson(() => localStorage, GROUPS_KEY, next)
      return next
    })
    setShutHere(shut && title === activeGroup ? pathname : null)
  }

  // Keep the current page's item visible — e.g. after following a link
  // from the dashboard to a page near the bottom of a long admin menu.
  // Measured with offsetTop (the nav is the items' offsetParent) rather
  // than scrollIntoView(), which could also scroll the page, or
  // getBoundingClientRect(), which body's zoom puts in different units.
  const firstRun = useRef(true)
  useEffect(() => {
    const el = navRef.current
    const item = el?.querySelector<HTMLElement>('.edside__item.is-on')
    if (el && item) {
      const top = item.offsetTop
      const bottom = top + item.offsetHeight
      if (top < el.scrollTop + 8 || bottom > el.scrollTop + el.clientHeight - 8) {
        el.scrollTo({
          top: top - (el.clientHeight - item.offsetHeight) / 2,
          behavior: firstRun.current ? ('instant' as ScrollBehavior) : 'smooth',
        })
      }
    }
    firstRun.current = false
  }, [pathname])

  // The drawer closes whenever the page changes.
  useEffect(() => {
    setOpen(false)
  }, [pathname, setOpen])

  // ...and when the window grows past the drawer breakpoint (rotating a
  // tablet), so its scroll lock can't outlive it.
  useEffect(() => {
    const mq = window.matchMedia(MOBILE)
    const onChange = () => {
      if (!mq.matches) setOpen(false)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [setOpen])

  // While the drawer is open: page underneath doesn't scroll, and Escape
  // closes the drawer (instead of AppShell's "Escape = back one page").
  useEffect(() => {
    if (!open) return
    const unlock = lockPageScroll()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setOpen(false)
    }
    window.addEventListener('keydown', onKey, true)
    navRef.current?.focus({ preventScroll: true })
    return () => {
      unlock()
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open, setOpen])

  const navigate = () => {
    setOpen(false)
    onNav?.()
  }

  return (
    <>
      <aside className={`edside ${open ? 'is-open' : ''}`}>
        <Link className="edside__brand" to={home} onClick={navigate}>
          <img className="edside__logo" src="/logo.png" alt="Amaliy Fizika" width={56} height={56} />
          <BrandMark />
        </Link>

        <div className={`edside__body ${edges.above ? 'has-above' : ''} ${edges.below ? 'has-below' : ''}`}>
          <nav className="edside__nav" ref={navRef} tabIndex={-1} aria-label={t('Asosiy navigatsiya')}>
            <div className="edside__list">
              {groups.map((g) => {
                const shut = isShut(g.title)
                return (
                  <div className={`edside__sec ${shut ? 'is-shut' : ''}`} key={g.title}>
                    {foldable ? (
                      <button type="button" className="edside__gt" aria-expanded={!shut} onClick={() => toggleGroup(g.title)}>
                        <span className="edside__gtt">{t(g.title)}</span>
                        <span className="edside__chev">{IC.chevron}</span>
                      </button>
                    ) : (
                      <p className="edside__gt"><span className="edside__gtt">{t(g.title)}</span></p>
                    )}
                    <div className="edside__items">
                      <div className="edside__itemsin" inert={shut}>
                        {g.items.map((item) => (
                          <NavLink
                            key={item.to}
                            to={item.to}
                            end={item.end}
                            className={({ isActive: on }) => `edside__item ${on ? 'is-on' : ''}`}
                            onClick={navigate}
                          >
                            <span className="edside__ic">{IC[item.icon]}</span>
                            <span className="edside__lb">{t(item.label)}</span>
                          </NavLink>
                        ))}
                      </div>
                    </div>
                  </div>
                )
              })}

              <div className="edside__foot">
                <p className="edside__copy"><strong>Amaliy Fizika</strong> © {new Date().getFullYear()}</p>
                {footer}
              </div>
            </div>
          </nav>
        </div>
      </aside>
      {open && <div className="edside-backdrop" onClick={() => setOpen(false)} aria-hidden="true" />}
    </>
  )
}
