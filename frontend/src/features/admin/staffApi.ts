import { useQuery } from '@tanstack/react-query'

import { api } from '@/lib/api/client'
import type { Paginated, User } from '@/lib/api/types'

/* The people lists of Foydalanuvchilar and Rollar (backend
   accounts UserAdminViewSet). Staff come whole (every page); pupils, far
   more of them, a page at a time with a search. */

async function allPages(url: string): Promise<User[]> {
  const out: User[] = []
  let next: string | null = url
  while (next) {
    const page: Paginated<User> = (await api.get<Paginated<User>>(next)).data
    out.push(...page.results)
    // the server's next link is absolute; the client's base is /api
    next = page.next ? page.next.replace(/^https?:\/\/[^/]+\/api/, '') : null
  }
  return out
}

/** Every staff account (pupils excluded), with presence. */
export function useStaffList(enabled = true) {
  return useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => allPages('/accounts/users/'),
    enabled,
    refetchInterval: 60_000, // keeps the "onlayn" dots current
  })
}

/** One page of pupils' accounts, optionally searched. */
export function useStudentAccounts(q: string, enabled = true) {
  return useQuery({
    queryKey: ['admin', 'students', q],
    queryFn: async () => (await api.get<Paginated<User>>('/accounts/users/', { params: { role: 'student', ...(q ? { q } : {}) } })).data,
    enabled,
    placeholderData: (prev) => prev,
  })
}

/** The five lists of Foydalanuvchilar (and the role cards of Rollar). */
export type PeopleTab = 'mamuriyat' | 'oqituvchilar' | 'kuzatuvchilar' | 'maktab' | 'oquvchilar'

export const PEOPLE_TABS: { key: PeopleTab; label: string }[] = [
  { key: 'mamuriyat', label: "Ma'muriyat" },
  { key: 'oqituvchilar', label: "O'qituvchilar" },
  { key: 'kuzatuvchilar', label: 'Kuzatuvchilar' },
  { key: 'maktab', label: "Maktab ma'muriyati" },
  { key: 'oquvchilar', label: "O'quvchilar" },
]

export function tabOf(u: User): PeopleTab {
  if (u.is_dev_superuser || u.role === 'admin' || u.role === 'boshliq') return 'mamuriyat'
  if (u.role === 'kuzatuvchi') return 'kuzatuvchilar'
  if (u.role === 'maktab') return 'maktab'
  if (u.role === 'student') return 'oquvchilar'
  return 'oqituvchilar'
}
