import type { IC } from '@/icons'
import type { User } from '@/lib/api/types'
import { isAdminInView, isObserver, isOversight, isTeacherLike } from '@/lib/auth/AuthContext'
import type { ViewMode } from '@/store/uiStore'

type Audience = 'teacher' | 'oversight' | 'admin'

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
  { to: '/reports', label: 'Dars hisobotlari', sub: "O'tgan darsni ma'muriyatga topshirish", icon: 'file', audience: 'teacher' },
  { to: '/games', label: "O'yinlar", sub: "Jonli viktorina va mini-o'yinlar", icon: 'dice', audience: 'teacher' },
  { to: '/manage', label: 'Tahlil', sub: "Eng yaxshi o'quvchi va darslar reytingi", icon: 'calc', audience: 'oversight' },
  { to: '/results', label: 'Natijalar', sub: "O'quvchilar natijalari tahlili", icon: 'star', audience: 'oversight' },
  { to: '/manage/schools', label: 'Hamkor maktablar', sub: "O'zlashtirish va davomat maktablar kesimida", icon: 'home', audience: 'oversight' },
  { to: '/manage/database', label: "Ma'lumotlar bazasi", sub: "Barcha maktablardagi o'quvchilar", icon: 'list', audience: 'oversight' },
  { to: '/manage/reports', label: 'Hisobotlarni baholash', sub: "O'qituvchilar topshirgan darslar", icon: 'check2', audience: 'oversight' },
  { to: '/manage/awards', label: "Rag'batlantirish", sub: 'Sertifikat va tabriklar', icon: 'megaphone', audience: 'oversight' },
  { to: '/manage/materials', label: "O'quv materiallari", sub: "Nazariya, formula, video, savollar", icon: 'book', audience: 'oversight' },
  { to: '/shop', label: "Do'kon", sub: "Dars ishlanmalari va tajribalar", icon: 'cards', audience: 'admin' },
  { to: '/manage/shop', label: "Sotuv bo'limi", sub: 'Buyurtmalar va mahsulotlar', icon: 'grid', audience: 'oversight' },
  { to: '/manage/security', label: 'Xavfsizlik jurnali', sub: 'Kirishlar va amallar tarixi', icon: 'lock', audience: 'admin' },
]

function allowed(audience: Audience, user: User | null, viewMode: ViewMode) {
  switch (audience) {
    case 'teacher':
      return isTeacherLike(user)
    case 'oversight':
      return isObserver(user) || (isOversight(user) && viewMode !== 'teacher')
    case 'admin':
      return isAdminInView(user, viewMode)
  }
}

export function portalNavItems(user: User | null, viewMode: ViewMode) {
  return PORTAL_LINKS.filter((l) => allowed(l.audience, user, viewMode)).map(({ to, label, icon }) => ({ to, label, icon }))
}

export function portalHomeLinks(user: User | null, viewMode: ViewMode) {
  return PORTAL_LINKS.filter((l) => allowed(l.audience, user, viewMode)).map((l) => ({ view: l.to, ic: l.icon, title: l.label, sub: l.sub }))
}

/** Original staff pages the read-only Kuzatuvchi has no use for. */
export const OBSERVER_HIDDEN = new Set(['/journal'])
