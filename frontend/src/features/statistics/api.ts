import { useQuery } from '@tanstack/react-query'

import { api } from '@/lib/api/client'

import type { DashboardSummary } from './types'

/** The school's working figures for Boshqaruv › Ma'lumot (SystemStats.tsx). */
export function useDashboardSummary() {
  return useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: async () => (await api.get<DashboardSummary>('/dashboard/summary/')).data,
  })
}
