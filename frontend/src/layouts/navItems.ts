import type { IC } from '@/icons'
import { isAdminInView, isObserver, isSchoolAdmin, useAuth } from '@/lib/auth/AuthContext'
import { routeOn, useModules } from '@/lib/modules'
import { useUIStore } from '@/store/uiStore'

import { OBSERVER_HIDDEN, portalNavItems } from './portalNav'

export type NavItem = { to: string; label: string; icon: keyof typeof IC }

/** The staff app's own pages (portal pages are added by portalNavItems). */
export const NAV_ITEMS: (NavItem & { adminOnly?: boolean })[] = [
  { to: '/', label: 'Bosh sahifa', icon: 'home' },
  { to: '/lessons', label: 'Darslar', icon: 'lessons' },
  { to: '/journal', label: 'Jurnal', icon: 'gradebook' },
  { to: '/timetable', label: 'Jadval', icon: 'timetable' },
  { to: '/library', label: 'Kutubxona', icon: 'book' },
  // the Fizika window's own (FIZIKA_ONLY below)
  { to: '/lab', label: 'Laboratoriya', icon: 'flask' },
  { to: '/notifications', label: 'Bildirishnomalar', icon: 'bell' },
  { to: '/settings', label: 'Sozlamalar', icon: 'gear' },
  { to: '/guide', label: "Yo'riqnoma", icon: 'book', adminOnly: true },
  { to: '/help', label: 'Yordam markazi', icon: 'help' },
  { to: '/about', label: 'Platforma haqida', icon: 'info' },
  { to: '/admin', label: 'Boshqaruv', icon: 'settings', adminOnly: true },
  { to: '/equipment-sheet', label: 'Jihozlar jadvali', icon: 'grid', adminOnly: true },
]

/** Reached from the top bar's bell, so the side menu leaves it out; it
 * stays pickable for the phone's bottom bar (Ko'rinish). */
export const TOPBAR_ONLY = new Set(['/notifications'])

/** Sozlamalar's own pages — the tabs on top of each (SettingsTabs). */
export const SETTINGS_PAGES: { to: string; label: string; icon: keyof typeof IC }[] = [
  { to: '/settings/profile', label: 'Profil', icon: 'user' },
  { to: '/settings/appearance', label: "Ko'rinish", icon: 'palette' },
  { to: '/settings/notifications', label: 'Bildirishnomalar', icon: 'bell' },
  { to: '/settings/integrations', label: 'Integratsiyalar', icon: 'plug' },
]

/** A school's ma'muriyat: their school instead of the teacher's home,
 *  and none of the teacher's own work pages. */
const SCHOOL_ADMIN_HIDDEN = new Set(['/', '/journal', '/timetable'])
/** Pages of one fan window only (components/FanWindow.tsx). */
const FIZIKA_ONLY = new Set(['/lab', '/manage/equipment'])
/** …and of the STEAM window only: there the picture sheet maker is a menu
 *  item of its own; in Fizika it is a tab of the Jihozlar jadvali. */
const STEAM_ONLY = new Set(['/equipment-sheet'])
const MY_SCHOOL: NavItem = { to: '/my-school', label: 'Maktabim', icon: 'home' }

export function useVisibleNavItems(): NavItem[] {
  const { user } = useAuth()
  const viewMode = useUIStore((s) => s.viewMode)
  const fan = useUIStore((s) => s.subject)
  const { on } = useModules()
  const inWindow = (to: string) => (fan === 'fizika' ? !STEAM_ONLY.has(to) : !FIZIKA_ONLY.has(to))
  if (isSchoolAdmin(user)) {
    return [MY_SCHOOL, ...NAV_ITEMS.filter((item) => !item.adminOnly && !SCHOOL_ADMIN_HIDDEN.has(item.to))
      .map(({ to, label, icon }) => ({ to, label, icon }))].filter((item) => routeOn(item.to, on) && inWindow(item.to))
  }
  return [
    ...NAV_ITEMS.filter((item) => (!item.adminOnly || isAdminInView(user, viewMode)) && !(isObserver(user) && OBSERVER_HIDDEN.has(item.to)))
      .map(({ to, label, icon }) => ({ to, label, icon })),
    ...portalNavItems(user, viewMode),
  ].filter((item) => routeOn(item.to, on) && inWindow(item.to))
}
