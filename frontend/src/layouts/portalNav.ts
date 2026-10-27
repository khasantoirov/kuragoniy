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
  { to: '/class-stats', label: 'Sinflarim', sub: "O'zlashtirish va davomat", icon: 'calc', audience: 'teacher' },
  { to: '/students', label: "O'quvchilar", sub: 'Login-parol, sinf kodi, parol tiklash', icon: 'users', audience: 'teacher' },
  { to: '/assignments', label: 'Vazifalar', sub: 'Darsni sinfga topshirish va natijalar', icon: 'list', audience: 'teacher' },
  { to: '/readiness', label: 'Darsga tayyorgarlik', sub: "Darsdan oldin o'zingizni tekshiring", icon: 'target', audience: 'teacher' },
  { to: '/reports', label: 'Dars hisobotlari', sub: "O'tgan darsni ma'muriyatga topshirish", icon: 'file', audience: 'staff' },
  { to: '/games', label: "O'yinlar", sub: "Jonli viktorina va mini-o'yinlar", icon: 'dice', audience: 'teacher' },
  { to: '/statistics', label: 'Statistika', sub: "Tahlil, maktablar, natijalar va o'quvchilar bazasi", icon: 'chart', audience: 'oversight' },
  { to: '/manage/materials', label: "O'quv materiallari", sub: "Nazariya, formula, video, savollar", icon: 'book', audience: 'oversight' },
  { to: '/shop', label: "Do'kon", sub: "Dars ishlanmalari va tajribalar", icon: 'cards', audience: 'oversight' },
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
