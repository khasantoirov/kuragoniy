import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { api } from '@/lib/api/client'

import type { DashboardChorak } from './types'
import type { MasteryBreakdownResponse, MasteryPeriod } from './masteryTypes'

/** `placeholderData: keepPreviousData` — switching a filter or the chart
 * form must never blank the panel back to a skeleton; the previous
 * result stays on screen (react-query marks it `isPlaceholderData` while
 * the new one loads) until the fresher data replaces it. */
export function useMasteryBreakdown(params: {
  chorak: DashboardChorak
  school?: string | null
  classId?: number | null
  period: MasteryPeriod
  teacherId?: string
}) {
  const { chorak, school, classId, period, teacherId } = params
  return useQuery({
    queryKey: ['dashboard', 'mastery', chorak, classId ?? school ?? null, period, teacherId ?? null],
    queryFn: async () =>
      (
        await api.get<MasteryBreakdownResponse>('/dashboard/mastery/', {
          params: {
            chorak: String(chorak),
            period,
            // class implies its own school server-side, and takes
            // precedence there too — sending only one keeps the intent
            // unambiguous instead of relying on server-side precedence.
            ...(classId != null ? { class: classId } : school ? { school } : {}),
            ...(teacherId ? { teacher: teacherId } : {}),
          },
        })
      ).data,
    placeholderData: keepPreviousData,
  })
}
