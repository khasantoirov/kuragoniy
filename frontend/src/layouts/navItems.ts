import type { IC } from '@/icons'
import { isAdminInView, isObserver, useAuth } from '@/lib/auth/AuthContext'
import { useUIStore } from '@/store/uiStore'

import { OBSERVER_HIDDEN, portalNavItems } from './portalNav'

export type NavItem = { to: string; label: string; icon: keyof typeof IC }

/** The staff app's own pages (portal pages are added by portalNavItems). */
export const NAV_ITEMS: (NavItem & { adminOnly?: boolean })[] = [
  { to: '/', label: 'Bosh sahifa', icon: 'home' },
  { to: '/lessons', label: 'Darslar', icon: 'file' },
  { to: '/journal', label: 'Jurnal', icon: 'clipboard' },
  { to: '/timetable', label: 'Jadval', icon: 'calendar' },
  { to: '/library', label: 'Kutubxona', icon: 'book' },
  { to: '/notifications', label: 'Bildirishnomalar', icon: 'bell' },
  { to: '/settings', label: 'Sozlamalar', icon: 'gear' },
  { to: '/guide', label: "Yo'riqnoma", icon: 'book', adminOnly: true },
  { to: '/about', label: 'Platforma haqida', icon: 'info' },
  { to: '/statistics', label: 'Statistika', icon: 'chart', adminOnly: true },
  { to: '/admin', label: 'Boshqaruv', icon: 'settings', adminOnly: true },
  { to: '/equipment-sheet', label: 'Jihozlar jadvali', icon: 'grid', adminOnly: true },
]

/** Sozlamalar's own pages — sub-items under it in the side menu. */
export const SETTINGS_PAGES: { to: string; label: string; icon: keyof typeof IC }[] = [
  { to: '/settings/profile', label: 'Profil', icon: 'user' },
  { to: '/settings/appearance', label: "Ko'rinish", icon: 'palette' },
  { to: '/settings/notifications', label: 'Bildirishnomalar', icon: 'bell' },
  { to: '/settings/integrations', label: 'Integratsiyalar', icon: 'plug' },
]

export function useVisibleNavItems(): NavItem[] {
  const { user } = useAuth()
  const viewMode = useUIStore((s) => s.viewMode)
  return [
    ...NAV_ITEMS.filter((item) => (!item.adminOnly || isAdminInView(user, viewMode)) && !(isObserver(user) && OBSERVER_HIDDEN.has(item.to)))
      .map(({ to, label, icon }) => ({ to, label, icon })),
    ...portalNavItems(user, viewMode),
  ]
}
