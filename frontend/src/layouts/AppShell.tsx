import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'

import { Avatar } from '@/components/Avatar'
import { isAnyModalOpen } from '@/components/Modal'
import { RoleBadge } from '@/components/RoleBadge'
import { useToast } from '@/components/Toast'
import { AnnouncementsBell } from '@/features/announcements/AnnouncementsBell'
import { GRADES, gradeLabel } from '@/features/lessons/labels'
import { IC, themeIconMoon, themeIconSun } from '@/icons'
import { isAdminInView, useAuth } from '@/lib/auth/AuthContext'
import { setupEnterKeyNav } from '@/lib/enterKeyNav'
import { redoLast, undoLast } from '@/lib/history'
import { useUIStore } from '@/store/uiStore'

import { BottomNav } from './BottomNav'

const NAV_ITEMS: { to: string; label: string; icon: keyof typeof IC; adminOnly?: boolean }[] = [
  { to: '/', label: 'Bosh sahifa', icon: 'home' },
  { to: '/lessons', label: 'Darslar', icon: 'robot' },
  { to: '/journal', label: 'Jurnal', icon: 'clipboard' },
  { to: '/timetable', label: 'Jadval', icon: 'calendar' },
  { to: '/library', label: 'Kutubxona', icon: 'book' },
  { to: '/about', label: 'Platforma haqida', icon: 'info' },
  { to: '/admin', label: 'Boshqaruv', icon: 'settings' },
]

export function AppShell() {
  const { t } = useTranslation()
  const { user, logout } = useAuth()
  const { lang, theme, toggleTheme, grade, setGrade, viewMode } = useUIStore()
  const location = useLocation()
  const navigate = useNavigate()
  const toast = useToast()

  const [acctOpen, setAcctOpen] = useState(false)
  const topbarRef = useRef<HTMLElement>(null)

  const closeAll = () => {
    setAcctOpen(false)
  }

  // Keeps --topbar-h in sync with the topbar's real rendered height (it
  // varies across breakpoints) so any sticky element below it — e.g. the
  // "Barcha o'qituvchilar" table header — can stick flush underneath
  // instead of hardcoding a pixel guess that drifts out of sync.
  useEffect(() => {
    const el = topbarRef.current
    if (!el) return
    const set = () => document.documentElement.style.setProperty('--topbar-h', `${el.offsetHeight}px`)
    set()
    const ro = new ResizeObserver(set)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // A dropdown left open by a topbar icon must not survive a navigation —
  // including via the bottom nav, which lives outside this component and
  // has no reason to know about acctOpen itself. Keying off the route
  // (rather than wiring a callback through BottomNav) also covers
  // back/forward and any other way the page can change.
  useEffect(() => {
    closeAll()
  }, [location.pathname])

  // Escape navigates back exactly one page (like the browser's own Back
  // button) — never to the home page. Suppressed while a Modal is open,
  // since a modal now only closes via its own explicit Save/Cancel/close
  // button, not Escape. If a topbar dropdown is open, Escape closes just
  // that first rather than also navigating away in the same keypress.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || isAnyModalOpen()) return
      if (acctOpen) {
        closeAll()
        return
      }
      navigate(-1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [navigate, acctOpen])

  // Ctrl+Z / Ctrl+Shift+Z (and Ctrl+Y) — global undo/redo, ported from
  // js/history.js's watchKeys(). Skipped while typing in a text field so
  // the browser's own native undo still works there.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      const k = e.key.toLowerCase()
      if (k !== 'z' && k !== 'y') return

      const tgt = e.target as HTMLElement | null
      const tag = (tgt?.tagName || '').toUpperCase()
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tgt?.isContentEditable) return

      e.preventDefault()
      const isRedo = k === 'y' || e.shiftKey
      const run = isRedo ? redoLast : undoLast
      run().then((res) => {
        if (res.ok) toast((isRedo ? t('Qaytarildi: ') : t('Bekor qilindi: ')) + t(res.label ?? ''))
        else if (res.empty) toast(isRedo ? t("Qaytariladigan amal yo'q") : t("Bekor qilinadigan amal yo'q"))
        else if (res.error) toast((isRedo ? t("Qaytarib bo'lmadi: ") : t("Bekor qilib bo'lmadi: ")) + res.error, 'error')
      })
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [t, toast])

  // Enter-to-next-field, and Enter-to-save from the last field, across
  // every modal/panel-style form (SlotEditor, LessonEditor, LibraryPage,
  // ProfilePage, ...) — see lib/enterKeyNav for why this is one global
  // listener rather than per-form wiring.
  useEffect(() => setupEnterKeyNav(), [])

  const onLessons = location.pathname.startsWith('/lessons')

  const visibleNavItems = NAV_ITEMS.filter((item) => !item.adminOnly || isAdminInView(user, viewMode))

  const acctPop = (align: 'up' | 'down') => (
    <div className="acct">
      <button className="acct__btn" onClick={() => setAcctOpen((v) => !v)}>
        <Avatar name={user?.name ?? ''} photo={user?.photo} />
        <span className="acct__nm">{user?.name}</span>
      </button>
      {acctOpen && (
        <div className={`acct__pop ${align === 'up' ? 'acct__pop--up' : ''}`}>
          <p className="acct__who">
            {user?.name}
            {user && <RoleBadge user={user} />}
          </p>
          <Link className="acct__item" to="/profile" onClick={closeAll}>
            {IC.user} {t('Profil')}
          </Link>
          <Link className="acct__item" to="/settings" onClick={closeAll}>
            {IC.gear} {t('Sozlamalar')}
          </Link>
          <button className="acct__item acct__item--out" onClick={() => logout()}>
            {IC.logout} {t('Chiqish')}
          </button>
        </div>
      )}
    </div>
  )

  return (
    <>
      {/* Tor ekranlarda (mobil) yagona yuqori panel — .sidebar shu kenglikda
          display:none bo'ladi, BottomNav navigatsiyani olib boradi. */}
      <header className="topbar topbar--mobile" ref={topbarRef}>
        <div className="topbar__inner">
          <Link className="brand" to="/" onClick={closeAll}>
            <img className="brand__logo" src="/logo.png" alt="KO'RAGONIY EDU" width={48} height={48} />
            <span className="brand__text">
              <span className="brand__name">KO'RAGONIY EDU</span>
              <img className="brand__sig brand__sig--day" src="/sign-day.png" alt="Muhandis D" height={14} />
              <img className="brand__sig brand__sig--night" src="/sign-night.png" alt="Muhandis D" height={14} />
            </span>
          </Link>

          <div className="who">
            <button className="iconbtn" onClick={toggleTheme} title={t('Rejimni almashtirish')} aria-label={t('Rejim')}>
              {theme === 'dark' ? themeIconMoon() : themeIconSun()}
            </button>
            <AnnouncementsBell />
            {acctPop('down')}
          </div>
        </div>
      </header>

      {/* Keng ekranlarda (desktop) chap tomondagi doimiy yon menyu. */}
      <aside className="sidebar">
        <Link className="sidebar__brand" to="/" onClick={closeAll}>
          <img className="sidebar__logo" src="/logo.png" alt="KO'RAGONIY EDU" width={40} height={40} />
          <span className="sidebar__brandtext">
            <span className="sidebar__name">KO'RAGONIY EDU</span>
            <img className="brand__sig brand__sig--day" src="/sign-day.png" alt="Muhandis D" height={13} />
            <img className="brand__sig brand__sig--night" src="/sign-night.png" alt="Muhandis D" height={13} />
          </span>
        </Link>

        <nav className="sidebar__nav" aria-label={t('Asosiy navigatsiya')}>
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `sidebar__item ${isActive ? 'is-on' : ''}`}
              onClick={closeAll}
            >
              <span className="sidebar__ic">{IC[item.icon]}</span>
              <span className="sidebar__lb">{t(item.label)}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar__foot">
          <div className="sidebar__utils">
            <button className="iconbtn" onClick={toggleTheme} title={t('Rejimni almashtirish')} aria-label={t('Rejim')}>
              {theme === 'dark' ? themeIconMoon() : themeIconSun()}
            </button>
            <AnnouncementsBell />
          </div>
          {acctPop('up')}
        </div>
      </aside>

      <div className="appmain">
        <div className="shell">
          {onLessons && (
            <div className="grades">
              {GRADES.map((g) => (
                <button
                  key={g}
                  className={`grade ${g === grade ? 'is-on' : ''}`}
                  onClick={() => {
                    setGrade(g)
                    // Switching grade while viewing a specific lesson
                    // (/lessons/:id) should land back on the list — same as
                    // pressing "Barcha darslar" — rather than silently
                    // changing the grade behind an unrelated lesson page.
                    if (location.pathname !== '/lessons') navigate('/lessons')
                  }}
                >
                  {gradeLabel(g, lang)}
                </button>
              ))}
            </div>
          )}

          <main className="main" onClick={closeAll}>
            <Outlet />
          </main>
        </div>
      </div>

      <BottomNav items={visibleNavItems} />
    </>
  )
}
