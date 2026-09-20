import { useQuery } from '@tanstack/react-query'

import { api } from '@/lib/api/client'

import type { DashboardChorak, DashboardSummary } from './types'

export function useDashboardSummary(chorak: DashboardChorak, teacherId?: string) {
  return useQuery({
    queryKey: ['dashboard', 'summary', chorak, teacherId ?? null],
    queryFn: async () =>
      (
        await api.get<DashboardSummary>('/dashboard/summary/', {
          params: { chorak: String(chorak), ...(teacherId ? { teacher: teacherId } : {}) },
        })
      ).data,
  })
}
