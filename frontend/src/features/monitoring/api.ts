import { useQuery } from '@tanstack/react-query'

import { api } from '@/lib/api/client'
import { useUIStore } from '@/store/uiStore'
import type { LicenceState } from '@/features/schools/api'

/* GET /api/dashboard/monitoring/ — the administration's overview (backend
   dashboard/monitoring.py), for the Bosh sahifa and Statistika › Monitoring. */

export interface Monitoring {
  fan: 'fizika' | 'steam' | null
  year: string | null
  kpi: {
    schools: { total: number; in_force: number }
    pupils: number
    pupil_accounts: number
    training: { learning: number; certificates: number }
    muhandis: { teachers: number; schools: number }
  }
  today: {
    date: string
    weekday: number | null
    schools: { id: number | null; name: string; lessons: number; done: number; now: boolean; next: string | null }[]
  }
  licences: {
    ending: { id: number; name: string; ends_on: string; days_left: number; state: LicenceState; label: string; plan: string }[]
    by_state: Partial<Record<LicenceState, number>>
  }
  requests: { kits_new: number; guests_new: number; leads_new: number; tickets_open: number; staff_pending: number }
  courses: { id: number; title: string; enrolled: number; completed: number; progress: number }[]
  kits: { types: number; at_schools: number; schools: number; open: number; delivered: number } | null
  monthly: { month: string; marks: number; passed: number; quality: number }[]
  schools: {
    id: number
    name: string
    district: string
    pupils: number
    teachers: number
    muhandis: number
    lessons_30d: number
    licence: { state: LicenceState; label: string; in_force: boolean; plan: string | null; ends_on: string | null; days_left: number | null }
  }[]
}

export function useMonitoring(enabled = true) {
  const fan = useUIStore((s) => s.subject) // the Fizika or STEAM window's figures
  return useQuery({
    queryKey: ['dashboard', 'monitoring', fan],
    queryFn: async () => (await api.get<Monitoring>('/dashboard/monitoring/')).data,
    enabled,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000, // today's lessons move on
  })
}
