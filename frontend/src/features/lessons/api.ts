import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api/client'
import type { Paginated } from '@/lib/api/types'

import type { Grade } from './labels'
import type { Lesson } from './types'

export function useLessons(filters: { grade?: Grade; chorak?: number } = {}) {
  return useQuery({
    queryKey: ['lessons', filters],
    queryFn: async () =>
      (await api.get<Paginated<Lesson>>('/lessons/', { params: filters })).data.results,
  })
}

export interface LessonStats {
  lessons: number
  oddiy: number
  wow: number
  oyin: number
}

export function useLessonStats() {
  return useQuery({
    queryKey: ['lessons', 'stats'],
    queryFn: async () => (await api.get<LessonStats>('/lessons/stats/')).data,
    staleTime: 5 * 60_000,
  })
}

export function useLesson(id: number) {
  return useQuery({
    queryKey: ['lessons', 'detail', id],
    queryFn: async () => (await api.get<Lesson>(`/lessons/${id}/`)).data,
    enabled: !!id,
  })
}

// onSuccess intentionally doesn't return invalidateQueries()'s promise —
// TanStack Query awaits whatever onSuccess returns before settling
// mutateAsync, and invalidateQueries() only resolves once every affected
// query has refetched. For useDeleteLesson specifically, that includes the
// now-404ing useLesson(id) query still mounted on the page you delete
// from, which the client retries once (retry: 1 in App.tsx) with a ~1s
// backoff before giving up — silently delaying mutateAsync's resolution by
// a full second and, with it, the record() call an undo caller makes right
// after awaiting it. Firing the invalidation without awaiting it fixes
// that for every mutation here, not just delete.

export function useSaveLesson() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (lesson: Partial<Lesson> & { id?: number }) => {
      if (lesson.id) {
        return (await api.patch<Lesson>(`/lessons/${lesson.id}/`, lesson)).data
      }
      return (await api.post<Lesson>('/lessons/', lesson)).data
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['lessons'] }) },
  })
}

export function useUploadLessonFile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, file }: { id: number; file: File }) => {
      const form = new FormData()
      form.append('file', file)
      return (await api.post<Lesson>(`/lessons/${id}/upload-file/`, form)).data
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['lessons'] }) },
  })
}

export function useRemoveLessonFile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => (await api.post<Lesson>(`/lessons/${id}/remove-file/`)).data,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['lessons'] }) },
  })
}

export function useDeleteLesson() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => api.delete(`/lessons/${id}/`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['lessons'] }) },
  })
}

export type QuarterLocks = Record<'1' | '2' | '3' | '4', boolean>

export function useQuarterLocks() {
  return useQuery({
    queryKey: ['lessons', 'quarter-locks'],
    queryFn: async () => (await api.get<QuarterLocks>('/lessons/quarter-locks/')).data,
  })
}

export function useSetQuarterLock() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { chorak: number; is_open: boolean }) =>
      (await api.post('/lessons/quarter-locks/', payload)).data,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['lessons'] }) },
  })
}

export function useReorderLesson() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { id: number; chorak: number; index: number }) =>
      (await api.post<Lesson>('/lessons/reorder/', payload)).data,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['lessons'] }) },
  })
}

export function useMoveCopyLesson() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { id: number; mode: 'move' | 'copy'; grade: Grade; chorak: number }) =>
      (await api.post<Lesson>(`/lessons/${payload.id}/move-copy/`, payload)).data,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['lessons'] }) },
  })
}
