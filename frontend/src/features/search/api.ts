import { useQuery } from '@tanstack/react-query'

import { api } from '@/lib/api/client'

export type SearchKind = 'lesson' | 'library' | 'student' | 'staff'

export interface SearchItem {
  id: string
  title: string
  subtitle: string
  url: string
}

export interface SearchGroup {
  kind: SearchKind
  label: string
  items: SearchItem[]
}

export interface SearchResult {
  q: string
  total: number
  groups: SearchGroup[]
}

/** Backend'dagi MIN_QUERY_LEN bilan bir xil — bir harfda umuman
 *  so'rov yubormaymiz, backend ham uni bo'sh javob bilan qaytaradi. */
export const MIN_SEARCH_LEN = 2

export function useGlobalSearch(q: string) {
  return useQuery({
    queryKey: ['search', q],
    queryFn: async () => (await api.get<SearchResult>('/search/', { params: { q } })).data,
    enabled: q.length >= MIN_SEARCH_LEN,
    // Har bosilgan harfda yangi kalit hosil bo'ladi; oldingi natijani
    // ekranda ushlab turish ro'yxatning "sakrashini" oldini oladi.
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  })
}
