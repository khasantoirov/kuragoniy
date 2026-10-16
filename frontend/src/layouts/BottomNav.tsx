import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'

import { IC } from '@/icons'
import { DEFAULT_NAV_ITEMS, useUIStore } from '@/store/uiStore'

import type { NavItem } from './navItems'
import { NavRail, type RailItem } from './NavRail'

function isOn(pathname: string, to: string) {
  return to === '/' ? pathname === '/' : pathname.startsWith(to)
}

/** Fixed bottom tab bar for narrow screens: the sections the user picked in
 * Sozlamalar → Ko'rinish (up to 4), then Sozlamalar. */
export function BottomNav({ items }: { items: NavItem[] }) {
  const { t } = useTranslation()
  const location = useLocation()
  const { navStyle, navDock, navLabels, navItems } = useUIStore()

  const byPath = new Map(items.map((it) => [it.to, it]))
  let picked = navItems.map((p) => byPath.get(p)).filter((it): it is NavItem => !!it)
  if (!picked.length) picked = DEFAULT_NAV_ITEMS.map((p) => byPath.get(p)).filter((it): it is NavItem => !!it)
  const settingsItem: NavItem = { to: '/settings', label: 'Sozlamalar', icon: 'gear' }
  const all = [...picked, settingsItem]
  const active = [...all].reverse().find((it) => isOn(location.pathname, it.to))

  const railItems: RailItem[] = all.map((it) => ({ to: it.to, icon: IC[it.icon], label: t(it.label) }))

  return (
    <nav className={`bottomnav bottomnav--${navDock} ${navLabels ? '' : 'bottomnav--nolabels'}`} aria-label={t('Asosiy navigatsiya')}>
      <NavRail items={railItems} activeTo={active?.to ?? ''} styleKey={navStyle} />
    </nav>
  )
}
