import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'

import { IC } from '@/icons'
import { DEFAULT_NAV_ITEMS, useUIStore } from '@/store/uiStore'

import { useSideDrawer } from './edumin/sideDrawer'
import type { NavItem } from './navItems'
import { NavRail, type RailItem } from './NavRail'

function isOn(pathname: string, to: string) {
  return to === '/' ? pathname === '/' : pathname.startsWith(to)
}

/** Fixed bottom tab bar for phones: the sections the user picked in
 * Sozlamalar → Ko'rinish (up to 4), then "Menyu", which slides the side
 * menu with every section in from the left. */
export function BottomNav({ items }: { items: NavItem[] }) {
  const { t } = useTranslation()
  const location = useLocation()
  const navItems = useUIStore((s) => s.navItems)
  const menuOpen = useSideDrawer((s) => s.open)
  const setMenuOpen = useSideDrawer((s) => s.setOpen)

  const byPath = new Map(items.map((it) => [it.to, it]))
  let picked = navItems.map((p) => byPath.get(p)).filter((it): it is NavItem => !!it)
  if (!picked.length) picked = DEFAULT_NAV_ITEMS.map((p) => byPath.get(p)).filter((it): it is NavItem => !!it)
  const active = menuOpen ? '#menu' : [...picked].reverse().find((it) => isOn(location.pathname, it.to))?.to ?? ''

  const railItems: RailItem[] = [
    ...picked.map((it) => ({ to: it.to, icon: IC[it.icon], label: t(it.label) })),
    { to: '#menu', icon: IC.menu, label: t('Menyu'), onClick: () => setMenuOpen(!menuOpen) },
  ]

  return (
    <nav className="bottomnav" aria-label={t('Asosiy navigatsiya')}>
      <NavRail items={railItems} activeTo={active} />
    </nav>
  )
}
