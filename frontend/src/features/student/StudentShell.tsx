import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Outlet, useLocation } from 'react-router-dom'

import { Avatar } from '@/components/Avatar'
import { ScrollTopButton } from '@/components/ScrollTopButton'
import { RENAMED_LOGIN_KEY } from '@/features/auth/LoginPage'
import { PortalSidebar, type PortalNavItem } from '@/features/portal/PortalSidebar'
import { IC, themeIconMoon, themeIconSun } from '@/icons'
import { NavRail, type RailItem } from '@/layouts/NavRail'
import { BrandMark } from '@/layouts/edumin/BrandMark'
import { SidebarToggle } from '@/layouts/edumin/Sidebar'
import { useAuth } from '@/lib/auth/AuthContext'
import { routeOn, useModules } from '@/lib/modules'
import { usePageScrolled, useScrollRestoration } from '@/lib/scroll'
import { useUIStore } from '@/store/uiStore'

const ITEMS: PortalNavItem[] = [
  { to: '/s', label: 'Bosh sahifa', icon: 'home', end: true },
  { to: '/s/lessons', label: 'Darslar', icon: 'atom' },
  { to: '/s/homework', label: 'Uyga vazifa', icon: 'clipboard' },
  { to: '/s/games', label: "O'yinlar", icon: 'dice' },
  { to: '/s/results', label: 'Natijalarim', icon: 'star' },
  { to: '/s/profile', label: 'Profil', icon: 'profile' },
]

/** Shown once after signing in with a login that has since been
 * regenerated (valialiyev instead of aliyev.vali) — the old one still
 * works for now, but this is the one to use from here on. */
function RenamedLoginNotice() {
  const { t } = useTranslation()
  const [login, setLogin] = useState(() => {
    try {
      return sessionStorage.getItem(RENAMED_LOGIN_KEY)
    } catch {
      return null
    }
  })
  if (!login) return null
  const close = () => {
    try {
      sessionStorage.removeItem(RENAMED_LOGIN_KEY)
    } catch {
      // nothing stored to clear
    }
    setLogin(null)
  }
  return (
    <div className="notice" role="status">
      <span>🔑 {t('Loginingiz yangilandi')}: <b>{login}</b>. {t('Keyingi safar shu login bilan kiring.')}</span>
      <button type="button" className="btn" onClick={close}>{t('Tushunarli')}</button>
    </div>
  )
}

/** The student window — its own layout, separate from the staff app:
 * fewer, bigger targets, nothing a student can't use. */
export function StudentShell() {
  const { t } = useTranslation()
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useUIStore()
  const { pathname } = useLocation()
  const scrolled = usePageScrolled(4)
  useScrollRestoration()

  const { on } = useModules()
  const items = ITEMS.filter((it) => routeOn(it.to, on))
  const active = [...items].reverse().find((it) => (it.end ? pathname === it.to : pathname.startsWith(it.to)))
  const rail: RailItem[] = items.filter((it) => it.to !== '/s/results').map((it) => ({ to: it.to, icon: IC[it.icon], label: t(it.label) }))

  return (
    <>
      <header className={`edtop ${scrolled ? 'is-scrolled' : ''}`}>
        <div className="edtop__inner">
          <SidebarToggle />
          <span className="edtop__brand">
            <img className="edtop__logo" src="/logo.png" alt="KO'RAGONIY" width={44} height={44} />
            <BrandMark />
          </span>
          <div className="edtop__acts">
            <span className="sportal__who">
              <Avatar name={user?.name ?? ''} photo={user?.photo} />
              <span className="sportal__nm">
                {user?.name}
                {user?.student?.class_name && <small>{user.student.class_name}</small>}
              </span>
            </span>
            <button className="iconbtn" onClick={toggleTheme} title={t('Rejimni almashtirish')} aria-label={t('Rejim')}>
              {theme === 'dark' ? themeIconMoon() : themeIconSun()}
            </button>
            <button className="iconbtn" onClick={() => logout()} title={t('Chiqish')} aria-label={t('Chiqish')}>
              {IC.logout}
            </button>
          </div>
        </div>
      </header>

      <PortalSidebar home="/s" groups={[{ title: "O'quvchi oynasi", items }]} />

      <div className="appmain">
        <div className="shell">
          <main className="main sportal">
            <RenamedLoginNotice />
            <Outlet />
          </main>
        </div>
      </div>

      <ScrollTopButton />

      <nav className="bottomnav" aria-label={t('Asosiy navigatsiya')}>
        <NavRail items={rail} activeTo={active?.to ?? ''} />
      </nav>
    </>
  )
}
