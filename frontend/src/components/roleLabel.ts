import type { User } from '@/lib/api/types'

/** The role's name — the account menu's badge and the side menu's card. */
export function roleLabel(user: Pick<User, 'is_dev_superuser' | 'role'>): string {
  if (user.is_dev_superuser) return 'Dasturchi'
  switch (user.role) {
    case 'boshliq': return 'Rahbar'
    case 'admin': return 'Admin'
    case 'kuzatuvchi': return 'Kuzatuvchi'
    case 'maktab': return "Maktab ma'muriyati"
    case 'student': return "O'quvchi"
    default: return 'Ustoz'
  }
}
