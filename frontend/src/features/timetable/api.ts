import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api/client'
import type { Paginated } from '@/lib/api/types'

import type { TimetableSlot } from './types'

export function useTimetable() {
  return useQuery({
    queryKey: ['timetable'],
    queryFn: async () => (await api.get<Paginated<TimetableSlot>>('/timetable/slots/')).data.results,
  })
}

export function useSaveTimetable() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (slots: TimetableSlot[]) =>
      (await api.post<TimetableSlot[]>('/timetable/slots/bulk/', slots)).data,
    onSuccess: (data) => queryClient.setQueryData(['timetable'], data),
  })
}

/** Same bulk-replace as useSaveTimetable, but for an admin/boshliq/dev
 * editing another teacher's week from the "Barcha o'qituvchilar" view —
 * the backend only allows this for is_admin callers (see
 * TimetableSlotViewSet._target_teacher). */
export function useSaveTeacherTimetable() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ teacherId, slots }: { teacherId: string; slots: TimetableSlot[] }) =>
      (await api.post<TimetableSlot[]>(`/timetable/slots/bulk/?teacher=${teacherId}`, slots)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['timetable', 'all'] }),
  })
}

interface TeacherRow {
  id: string
  name: string
  email: string
  /** blocked: left the platform, lessons not handed over yet */
  blocked?: boolean
}

/** The partner schools to pick from (Hamkor maktablar, kept by the
 * administration); a teacher sees the active ones. */
export function usePartnerSchools() {
  return useQuery({
    queryKey: ['schools', 'pick'],
    queryFn: async () =>
      (await api.get<Paginated<{ id: number; name: string; is_active?: boolean }>>('/schools/', { params: { page_size: 500 } })).data.results,
    staleTime: 5 * 60_000,
  })
}

/** Everyone's week. `withBlocked`: the administration's picked view also
 * lists a blocked teacher (one who left) while lessons are still theirs.
 * `enabled` = false skips the fetch (one request per teacher) where it
 * isn't shown. */
export function useAllTimetables(withBlocked = false, enabled = true) {
  return useQuery({
    queryKey: ['timetable', 'all', withBlocked ? 'with-blocked' : 'approved'],
    enabled,
    queryFn: async () => {
      // Boshliq doesn't teach (see accounts.models.User.Role.BOSHLIQ), so
      // they never get a column in the aggregated "Barcha o'qituvchilar"
      // timetable even if approved/admin-equivalent.
      const users = (await api.get<Paginated<{ id: string; name: string; email: string; approved: boolean; role: string }>>('/accounts/users/')).data.results
        .filter((u) => (u.approved || u.role === 'admin' || (withBlocked && u.role === 'teacher')) && u.role !== 'boshliq')
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))

      const tables: Record<string, TimetableSlot[]> = {}
      for (const u of users) {
        tables[u.id] = (await api.get<Paginated<TimetableSlot>>('/timetable/slots/', { params: { teacher: u.id } })).data.results
      }
      const teachers: TeacherRow[] = users
        .filter((u) => u.approved || u.role === 'admin' || tables[u.id].length)
        .map((u) => ({ id: u.id, name: u.name || u.email, email: u.email, blocked: !u.approved && u.role !== 'admin' }))
      return { teachers, tables }
    },
  })
}

/** A school's lesson times (backend timetable/bells.py): "*" every school
 * day, "0"–"4" a weekday that runs differently; each period "1"–"8" is
 * [from, to] as "HH:MM". */
export type BellTimes = Record<string, Record<string, [string, string]>>

export interface SchoolBells {
  school: number
  school_name: string
  times: BellTimes
  updated_by_name: string
  updated_at: string | null
  can_edit: boolean
  updated_slots?: number
}

/** Every school whose lesson times are set (anyone may read them). */
export function useSchoolBells() {
  return useQuery({
    queryKey: ['timetable', 'bells'],
    queryFn: async () => (await api.get<SchoolBells[]>('/timetable/bells/')).data,
    staleTime: 60_000,
  })
}

/** One school's times — can_edit says whether this person may change them. */
export function useSchoolBell(schoolId: number | null | undefined) {
  return useQuery({
    queryKey: ['timetable', 'bells', schoolId ?? 0],
    enabled: !!schoolId,
    queryFn: async () => (await api.get<SchoolBells>(`/timetable/bells/${schoolId}/`)).data,
  })
}

/** Saves a school's times; the server then sets every lesson's there. */
export function useSaveBells() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ schoolId, times }: { schoolId: number; times: BellTimes }) =>
      (await api.put<SchoolBells>(`/timetable/bells/${schoolId}/`, { times })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timetable'] })
    },
  })
}

/** [from, to] of a lesson from its school's times (the first period's
 * start to the last one's end) — timetable/bells.py lesson_times. */
export function bellTimesFor(bells: SchoolBells | undefined, day: number, period: number, span = 1): [string, string] | null {
  if (!bells) return null
  const at = (p: number) => bells.times[String(day)]?.[String(p)] ?? bells.times['*']?.[String(p)]
  const first = at(period)
  if (!first) return null
  const last = at(period + Math.max(1, span) - 1) ?? first
  return [first[0], last[1]]
}
