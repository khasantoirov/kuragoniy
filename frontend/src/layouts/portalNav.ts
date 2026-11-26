import type { IC } from '@/icons'
import type { User } from '@/lib/api/types'
import { isAdminInView, isObserver, isOversight, isTeacherLike } from '@/lib/auth/AuthContext'
import type { ViewMode } from '@/store/uiStore'

type Audience = 'teacher' | 'staff' | 'oversight' | 'admin' | 'buyer'

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
  { to: '/staffroom', label: 'Ustozlar xonasi', sub: "Ertangi darslar, fayllar, mehmon ustoz", icon: 'users', audience: 'teacher' },
  { to: '/assignments', label: 'Vazifalar', sub: 'Darsni sinfga topshirish va natijalar', icon: 'list', audience: 'teacher' },
  { to: '/reports', label: 'Dars hisobotlari', sub: "O'tgan darsni ma'muriyatga topshirish", icon: 'file', audience: 'staff' },
  { to: '/training', label: 'Malaka oshirish', sub: "Kurslar, modul testlari va sertifikat", icon: 'cap', audience: 'staff' },
  { to: '/achievements', label: 'Reyting va nishonlar', sub: "Oylik faollik reytingi va nishonlar", icon: 'star', audience: 'staff' },
  { to: '/feed', label: 'Ustozlar lentasi', sub: "Hamkasblar bilan tajriba almashish", icon: 'megaphone', audience: 'staff' },
  { to: '/statistics', label: 'Statistika', sub: "Tahlil, maktablar, natijalar va o'quvchilar bazasi", icon: 'chart', audience: 'oversight' },
  { to: '/manage/schools', label: 'Hamkor maktablar', sub: "Ro'yxat, shartnoma va nomlarni moslashtirish", icon: 'school', audience: 'oversight' },
  { to: '/manage/equipment', label: 'Jihozlar jadvali', sub: "Tajriba jihozlari, narxlari va Excel", icon: 'flask', audience: 'oversight' },
  // teachers and schools' ma'muriyat order; the administration sells (owner, 2026-11-26)
  { to: '/shop', label: "STEAM do'kon", sub: "Jihozlar, to'plamlar va qo'llanmalar", icon: 'cards', audience: 'buyer' },
  { to: '/obuna', label: 'Obunalar', sub: "Tariflar, shartnoma va to'lov", icon: 'calendar', audience: 'oversight' },
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
    case 'buyer':
      return isTeacherLike(user) || isObserver(user) || (isOversight(user) && viewMode !== 'teacher')
  }
}

export function portalNavItems(user: User | null, viewMode: ViewMode) {
  return PORTAL_LINKS.filter((l) => allowed(l.audience, user, viewMode)).map(({ to, label, icon }) => ({ to, label, icon }))
}

/** Original staff pages the read-only Kuzatuvchi has no use for. */
export const OBSERVER_HIDDEN = new Set(['/journal'])
