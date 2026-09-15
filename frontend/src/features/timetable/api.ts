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
}

export function useAllTimetables() {
  return useQuery({
    queryKey: ['timetable', 'all'],
    queryFn: async () => {
      // Boshliq doesn't teach (see accounts.models.User.Role.BOSHLIQ), so
      // they never get a column in the aggregated "Barcha o'qituvchilar"
      // timetable even if approved/admin-equivalent.
      const users = (await api.get<Paginated<{ id: string; name: string; email: string; approved: boolean; role: string }>>('/accounts/users/')).data.results
        .filter((u) => (u.approved || u.role === 'admin') && u.role !== 'boshliq')
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))

      const tables: Record<string, TimetableSlot[]> = {}
      for (const u of users) {
        tables[u.id] = (await api.get<Paginated<TimetableSlot>>('/timetable/slots/', { params: { teacher: u.id } })).data.results
      }
      const teachers: TeacherRow[] = users.map((u) => ({ id: u.id, name: u.name || u.email, email: u.email }))
      return { teachers, tables }
    },
  })
}
