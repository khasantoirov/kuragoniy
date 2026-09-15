import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api/client'
import type { Paginated } from '@/lib/api/types'

export interface LessonPoster {
  id: number
  grade: number
  hafta: number
  topic: string
  image: string
  created_at: string
}

export function useLessonPosters() {
  return useQuery({
    queryKey: ['lesson-posters'],
    queryFn: async () => (await api.get<Paginated<LessonPoster>>('/lessons/posters/')).data.results,
  })
}

export function useCreateLessonPoster() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ grade, hafta, topic, image }: { grade: number; hafta: number; topic: string; image: Blob }) => {
      const form = new FormData()
      form.append('grade', String(grade))
      form.append('hafta', String(hafta))
      form.append('topic', topic)
      form.append('image', image, 'poster.jpg')
      return (await api.post<LessonPoster>('/lessons/posters/', form)).data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lesson-posters'] }),
  })
}

export function useUpdateLessonPoster() {
  const queryClient = useQueryClient()
  return useMutation({
    // Metadata only — the saved image itself isn't re-editable, only
    // which grade/week/topic it's filed under.
    mutationFn: async ({ id, grade, hafta, topic }: { id: number; grade: number; hafta: number; topic: string }) =>
      (await api.patch<LessonPoster>(`/lessons/posters/${id}/`, { grade, hafta, topic })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lesson-posters'] }),
  })
}

export function useDeleteLessonPoster() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => api.delete(`/lessons/posters/${id}/`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lesson-posters'] }),
  })
}
