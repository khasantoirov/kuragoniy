import { useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api/client'

/* Ustozlar xonasi (backend staffroom/). */

export interface PlanLesson {
  id: number
  title: string
  grade: number | string
  chorak: number
  hafta: number
  goal: string
  file: string | null
  file_url: string | null
  experiments: { name: string; minutes: number | null }[]
  equipment_sheet: string | null
  poster: string | null
  readiness: { best: number | null; passed: boolean }
}

export interface PlanSlot {
  period: number
  time_from: string | null
  time_to: string | null
  school: string
  room: string
  class_name: string
  lesson_type: string
  band: boolean
  grade?: number | null
  lesson_grade?: number | string | null
  picked?: boolean
  journal_class?: { id: number; name: string } | null
  lesson?: PlanLesson | null
}

export interface DayPlan {
  date: string
  today: string
  weekday: number
  place: { chorak: number | null; week: number | null; exact: boolean }
  slots: PlanSlot[]
  options: Record<string, { id: number; title: string; chorak: number; hafta: number }[]>
}

export type GuestStatus = 'yangi' | 'qabul' | 'rad' | 'otkazildi' | 'bekor'

export interface GuestRequest {
  id: number
  requester: string
  requester_name: string
  school: number | null
  school_name: string
  class_name: string
  date: string
  time: string
  lesson: number | null
  lesson_title: string
  topic: string
  note: string
  status: GuestStatus
  status_label: string
  guest: string | null
  guest_name: string
  reply: string
  handled_by_name: string
  handled_at: string | null
  created_at: string
}

export const GUEST_TONE: Record<GuestStatus, 'ok' | 'mid' | 'bad' | 'muted' | 'info'> = {
  yangi: 'info', qabul: 'ok', rad: 'bad', otkazildi: 'muted', bekor: 'muted',
}

/** date: "YYYY-MM-DD", "today", or undefined (the next school day). */
/** One school day's plan; no date = the next school day. `enabled` =
 * false waits (Bosh sahifa asks for the next day only when today is over). */
export function useDayPlan(date?: string, enabled = true) {
  return useQuery({
    queryKey: ['staffroom', 'day', date ?? 'next'],
    enabled,
    queryFn: async () => (await api.get<DayPlan>('/staffroom/day/', { params: date ? { date } : {} })).data,
  })
}

export function useGuestRequests(all = false, status = '') {
  return useQuery({
    queryKey: ['staffroom', 'guests', all, status],
    queryFn: async () => (await api.get<GuestRequest[]>('/staffroom/guests/', { params: all ? { all: 1, status } : {} })).data,
  })
}

export function useInvalidateStaffroom() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['staffroom'] })
}
