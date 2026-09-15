import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'

import { IC } from '@/icons'
import { useUIStore } from '@/store/uiStore'

import { NavRail, type RailItem } from './NavRail'

type NavItem = { to: string; label: string; icon: keyof typeof IC }

// On narrow screens we keep only the core pages visible, with a direct
// Settings button in place of the previous overflow menu.
const PRIMARY_PATHS = ['/', '/lessons', '/journal', '/timetable']

function isOn(pathname: string, to: string) {
  return to === '/' ? pathname === '/' : pathname.startsWith(to)
}

/** Fixed bottom tab bar for narrow screens. */
export function BottomNav({ items }: { items: NavItem[] }) {
  const { t } = useTranslation()
  const location = useLocation()
  const navStyle = useUIStore((s) => s.navStyle)

  const primary = items.filter((it) => PRIMARY_PATHS.includes(it.to))
  const settingsItem: NavItem = { to: '/settings', label: 'Sozlamalar', icon: 'gear' }
  const activePrimary = [...primary, settingsItem].reverse().find((it) => isOn(location.pathname, it.to))

  const [home, ...restPrimary] = primary

  const railItems: RailItem[] = [
    { to: home.to, icon: IC[home.icon], label: t(home.label) },
    ...restPrimary.map((it) => ({ to: it.to, icon: IC[it.icon], label: t(it.label) })),
    { to: settingsItem.to, icon: IC[settingsItem.icon], label: t(settingsItem.label) },
  ]

  return (
    <nav className="bottomnav" aria-label={t('Asosiy navigatsiya')}>
      <NavRail items={railItems} activeTo={activePrimary?.to ?? ''} styleKey={navStyle} />
    </nav>
  )
}
