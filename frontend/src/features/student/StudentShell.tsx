import { useTranslation } from 'react-i18next'
import { Outlet, useLocation } from 'react-router-dom'

import { Avatar } from '@/components/Avatar'
import { PortalSidebar, type PortalNavItem } from '@/features/portal/PortalSidebar'
import { IC, themeIconMoon, themeIconSun } from '@/icons'
import { NavRail, type RailItem } from '@/layouts/NavRail'
import { BrandMark } from '@/layouts/edumin/BrandMark'
import { useAuth } from '@/lib/auth/AuthContext'
import { useUIStore } from '@/store/uiStore'

const ITEMS: PortalNavItem[] = [
  { to: '/s', label: 'Bosh sahifa', icon: 'home', end: true },
  { to: '/s/lessons', label: 'Darslar', icon: 'atom' },
  { to: '/s/homework', label: 'Uyga vazifa', icon: 'clipboard' },
  { to: '/s/games', label: "O'yinlar", icon: 'dice' },
  { to: '/s/results', label: 'Natijalarim', icon: 'star' },
  { to: '/s/profile', label: 'Profil', icon: 'profile' },
]

/** The student window — its own layout, separate from the staff app:
 * fewer, bigger targets, nothing a student can't use. */
export function StudentShell() {
  const { t } = useTranslation()
  const { user, logout } = useAuth()
  const { theme, toggleTheme, navStyle } = useUIStore()
  const { pathname } = useLocation()

  const active = [...ITEMS].reverse().find((it) => (it.end ? pathname === it.to : pathname.startsWith(it.to)))
  const rail: RailItem[] = ITEMS.filter((it) => it.to !== '/s/results').map((it) => ({ to: it.to, icon: IC[it.icon], label: t(it.label) }))

  return (
    <>
      <header className="edtop">
        <div className="edtop__inner">
          <span className="edtop__brand">
            <img className="edtop__logo" src="/logo.png" alt="Amaliy Fizika" width={44} height={44} />
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

      <PortalSidebar home="/s" groups={[{ title: "O'quvchi oynasi", items: ITEMS }]} />

      <div className="appmain">
        <div className="shell">
          <main className="main sportal">
            <Outlet />
          </main>
        </div>
      </div>

      <nav className="bottomnav" aria-label={t('Asosiy navigatsiya')}>
        <NavRail items={rail} activeTo={active?.to ?? ''} styleKey={navStyle} />
      </nav>
    </>
  )
}
