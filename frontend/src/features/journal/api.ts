import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api/client'
import type { Paginated } from '@/lib/api/types'

import type { AttendanceStatus, EditGrant, Grid, GrantTeacher, JournalClass, Student } from './types'

/** Own classes, or (administrators) another teacher's, to look at. */
export function useClasses(teacherId?: string) {
  return useQuery({
    queryKey: teacherId ? ['journal', 'classes', 'of', teacherId] : ['journal', 'classes'],
    queryFn: async () =>
      (await api.get<Paginated<JournalClass>>('/journal/classes/', { params: teacherId ? { teacher: teacherId } : {} })).data.results,
  })
}

export function useClass(id: number) {
  return useQuery({
    queryKey: ['journal', 'classes', id],
    queryFn: async () => (await api.get<JournalClass>(`/journal/classes/${id}/`)).data,
    enabled: !!id,
  })
}

export function useCreateClass() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: { school: string; name: string; partner_school?: number | null }) =>
      (await api.post<JournalClass>('/journal/classes/', data)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['journal', 'classes'] }),
  })
}

export function useAddStudent(classId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ full_name, order }: { full_name: string; order?: number }) =>
      (
        await api.post<Student>('/journal/students/', {
          journal_class: classId,
          full_name,
          order: order ?? 999,
        })
      ).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal', 'classes', classId] })
      queryClient.invalidateQueries({ queryKey: ['journal', 'grid', classId] })
    },
  })
}

export function useUpdateStudent(classId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, full_name, order }: { id: number; full_name?: string; order?: number }) =>
      (
        await api.patch<Student>(`/journal/students/${id}/`, {
          ...(full_name !== undefined ? { full_name } : {}),
          ...(order !== undefined ? { order } : {}),
        })
      ).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal', 'classes', classId] })
      queryClient.invalidateQueries({ queryKey: ['journal', 'grid', classId] })
    },
  })
}

export function useRemoveStudent(classId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (studentId: number) => api.delete(`/journal/students/${studentId}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal', 'classes', classId] })
      queryClient.invalidateQueries({ queryKey: ['journal', 'grid', classId] })
    },
  })
}

export function useGrid(classId: number, teacherId?: string) {
  return useQuery({
    queryKey: ['journal', 'grid', classId],
    queryFn: async () =>
      (await api.get<Grid>(`/journal/classes/${classId}/grid/`, { params: teacherId ? { teacher: teacherId } : {} })).data,
    enabled: !!classId,
  })
}

interface BulkMarksInput {
  date: string
  chorak: number
  topic: string
  marks: { student_id: number; mark: number | null }[]
  attendance: { student_id: number; status: AttendanceStatus | null }[]
}

export function useBulkMarks(classId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: BulkMarksInput) =>
      (await api.post<Grid>(`/journal/classes/${classId}/bulk-marks/`, data)).data,
    onSuccess: (data) => {
      queryClient.setQueryData(['journal', 'grid', classId], data)
    },
  })
}

export function useDropDay(classId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (date: string) => (await api.post<Grid>(`/journal/classes/${classId}/drop-day/`, { date })).data,
    onSuccess: (data) => queryClient.setQueryData(['journal', 'grid', classId], data),
  })
}

export function useUpdateClass(classId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: { school: string; name: string; partner_school?: number | null }) =>
      (await api.patch<JournalClass>(`/journal/classes/${classId}/`, data)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['journal', 'classes'] }),
  })
}

export function useDeleteClass() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (classId: number) => api.delete(`/journal/classes/${classId}/`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['journal', 'classes'] }),
  })
}

export function useSetFinal(classId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: { student_id: number; chorak: number; mark: number | null }) =>
      (await api.post<Grid>(`/journal/classes/${classId}/set-final/`, data)).data,
    onSuccess: (data) => queryClient.setQueryData(['journal', 'grid', classId], data),
  })
}

// ── Past-day edit permissions (Jurnal → Ruxsatlar) ─────────────────────

export function useGrants(status: '' | 'pending' | 'active' | 'history', enabled = true) {
  return useQuery({
    queryKey: ['journal', 'grants', status],
    queryFn: async () => (await api.get<EditGrant[]>('/journal/grants/', { params: status ? { status } : {} })).data,
    enabled,
    refetchInterval: status === 'pending' ? 60_000 : false,
  })
}

export function useGrantTeachers(enabled: boolean) {
  return useQuery({
    queryKey: ['journal', 'grant-teachers'],
    queryFn: async () => (await api.get<GrantTeacher[]>('/journal/grants/teachers/')).data,
    enabled,
  })
}

function useGrantMutation<T>(fn: (data: T) => Promise<unknown>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal', 'grants'] })
      queryClient.invalidateQueries({ queryKey: ['journal', 'grant-teachers'] })
      queryClient.invalidateQueries({ queryKey: ['journal', 'grid'] })
    },
  })
}

/** Teacher: ask to reopen one closed day. */
export function useRequestGrant() {
  return useGrantMutation(async (data: { journal_class: number; date: string; reason: string }) =>
    (await api.post<EditGrant>('/journal/grants/', data)).data)
}

/** Administrator: open days directly — one day from the journal's lock,
 * or every past day (`all_past`) from the teacher's row. */
export function useCreateGrant() {
  return useGrantMutation(async (data: {
    teacher: string; journal_class?: number | null; date_from?: string; date_to?: string; all_past?: boolean; hours: number; note?: string
  }) => (await api.post<EditGrant>('/journal/grants/', data)).data)
}

/** Administrator: end every open permission of one teacher now. */
export function useCloseTeacher() {
  return useGrantMutation(async (teacher: string) => (await api.post('/journal/grants/close-teacher/', { teacher })).data)
}

export function useDecideGrant() {
  return useGrantMutation(async ({ id, action, hours, note }: {
    id: number; action: 'approve' | 'reject' | 'revoke'; hours?: number; note?: string
  }) => (await api.post<EditGrant>(`/journal/grants/${id}/${action}/`, { hours, note })).data)
}
