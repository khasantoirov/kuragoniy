import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api/client'
import type { Paginated } from '@/lib/api/types'

import type { AttendanceStatus, Grid, JournalClass, Student } from './types'

export function useClasses() {
  return useQuery({
    queryKey: ['journal', 'classes'],
    queryFn: async () => (await api.get<Paginated<JournalClass>>('/journal/classes/')).data.results,
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
    mutationFn: async (data: { school: string; name: string }) =>
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

export function useGrid(classId: number) {
  return useQuery({
    queryKey: ['journal', 'grid', classId],
    queryFn: async () => (await api.get<Grid>(`/journal/classes/${classId}/grid/`)).data,
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
    mutationFn: async (data: { school: string; name: string }) =>
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
