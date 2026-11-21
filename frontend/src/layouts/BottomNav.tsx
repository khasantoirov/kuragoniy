import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'

import { Avatar } from '@/components/Avatar'
import { IC } from '@/icons'
import { useAuth } from '@/lib/auth/AuthContext'
import { DEFAULT_NAV_ITEMS, useUIStore } from '@/store/uiStore'

import type { NavItem } from './navItems'
import { NavRail, type RailItem } from './NavRail'

const PROFILE = '/settings/profile'

function isOn(pathname: string, to: string) {
  return to === '/' ? pathname === '/' : pathname.startsWith(to)
}

/** Fixed bottom tab bar for phones, in the Instagram style: Bosh sahifa,
 * Darslar, Jurnal, Jadval as icons, then the person's own picture, which
 * opens their Profil. Every other section is in the side menu (the top
 * bar's ≡). */
export function BottomNav({ items }: { items: NavItem[] }) {
  const { t } = useTranslation()
  const location = useLocation()
  const navItems = useUIStore((s) => s.navItems)
  const { user } = useAuth()

  const byPath = new Map(items.map((it) => [it.to, it]))
  let picked = navItems.map((p) => byPath.get(p)).filter((it): it is NavItem => !!it)
  if (!picked.length) picked = DEFAULT_NAV_ITEMS.map((p) => byPath.get(p)).filter((it): it is NavItem => !!it)
  const onProfile = location.pathname.startsWith('/settings')
  const active = onProfile ? PROFILE : [...picked].reverse().find((it) => isOn(location.pathname, it.to))?.to ?? ''

  const railItems: RailItem[] = [
    ...picked.map((it) => ({ to: it.to, icon: IC[it.icon], label: t(it.label) })),
    { to: PROFILE, icon: <Avatar name={user?.name ?? ''} photo={user?.photo} />, label: t('Profil'), avatar: true },
  ]

  return (
    <nav className="bottomnav" aria-label={t('Asosiy navigatsiya')}>
      <NavRail items={railItems} activeTo={active} />
    </nav>
  )
}
