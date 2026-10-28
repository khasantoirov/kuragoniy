import type { IC } from '@/icons'
import type { User } from '@/lib/api/types'
import { isAdminInView, isObserver, isOversight, isTeacherLike } from '@/lib/auth/AuthContext'
import type { ViewMode } from '@/store/uiStore'

type Audience = 'teacher' | 'staff' | 'oversight' | 'admin'

interface PortalLink {
  to: string
  label: string
  sub: string
  icon: keyof typeof IC
  audience: Audience
}

/** Teacher-window and administration-window entries added on top of the
 * original staff navigation (AppShell NAV_ITEMS). */
const PORTAL_LINKS: PortalLink[] = [
  { to: '/assignments', label: 'Vazifalar', sub: 'Darsni sinfga topshirish va natijalar', icon: 'tasks', audience: 'teacher' },
  { to: '/reports', label: 'Dars hisobotlari', sub: "O'tgan darsni ma'muriyatga topshirish", icon: 'report', audience: 'staff' },
  { to: '/statistics', label: 'Statistika', sub: "Tahlil, maktablar, natijalar va o'quvchilar bazasi", icon: 'chart', audience: 'oversight' },
  { to: '/shop', label: "Do'kon", sub: "Dars ishlanmalari va tajribalar", icon: 'shop', audience: 'oversight' },
]

function allowed(audience: Audience, user: User | null, viewMode: ViewMode) {
  switch (audience) {
    case 'teacher':
      return isTeacherLike(user)
    case 'staff':
      return isTeacherLike(user) || isObserver(user)
    case 'oversight':
      return isObserver(user) || (isOversight(user) && viewMode !== 'teacher')
    case 'admin':
      return isAdminInView(user, viewMode)
  }
}

export function portalNavItems(user: User | null, viewMode: ViewMode) {
  return PORTAL_LINKS.filter((l) => allowed(l.audience, user, viewMode)).map(({ to, label, icon }) => ({ to, label, icon }))
}

/** Original staff pages the read-only Kuzatuvchi has no use for. */
export const OBSERVER_HIDDEN = new Set(['/journal'])
