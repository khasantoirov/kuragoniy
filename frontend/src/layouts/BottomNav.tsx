import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'

import { Avatar } from '@/components/Avatar'
import { IC } from '@/icons'
import type { User } from '@/lib/api/types'
import { isObserver, isSchoolAdmin, useAuth } from '@/lib/auth/AuthContext'
import { DEFAULT_NAV_ITEMS } from '@/store/uiStore'

import type { NavItem } from './navItems'
import { NavRail, type RailItem } from './NavRail'

const PROFILE = '/settings/profile'

/** The bar's four, by role, in order of preference — whatever this person
 * can't open (a role, a module turned off, the other fan window) drops out
 * and the next one takes its place:
 *  - teachers and the administration: Bosh sahifa, Darslar, Jurnal, Jadval
 *    (the owner's pick);
 *  - the read-only Kuzatuvchi: Statistika is their home (no journal);
 *  - a school's ma'muriyat: their school, Maktabim, first. */
function barPaths(user: User | null): string[] {
  if (isSchoolAdmin(user)) return ['/my-school', '/lessons', '/library', '/help', '/notifications']
  if (isObserver(user)) return ['/statistics', '/lessons', '/timetable', '/manage/schools', '/library']
  return [...DEFAULT_NAV_ITEMS, '/library', '/notifications']
}

/** Pages an item opens elsewhere: Maktabim shows the school's own page. */
const ALSO_ON: Record<string, string[]> = { '/my-school': ['/manage/schools/'] }

function isOn(pathname: string, to: string) {
  if (to === '/') return pathname === '/'
  return pathname.startsWith(to) || (ALSO_ON[to] ?? []).some((p) => pathname.startsWith(p))
}

/** Fixed bottom tab bar for phones, in the Instagram style: Bosh sahifa,
 * Darslar, Jurnal, Jadval as icons, then the person's own picture, which
 * opens their Profil. Every other section is in the side menu (the top
 * bar's ≡). */
export function BottomNav({ items }: { items: NavItem[] }) {
  const { t } = useTranslation()
  const location = useLocation()
  const { user } = useAuth()

  const byPath = new Map(items.map((it) => [it.to, it]))
  const picked = barPaths(user).map((p) => byPath.get(p)).filter((it): it is NavItem => !!it).slice(0, 4)
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
