import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api/client'
import type { Paginated } from '@/lib/api/types'

// Same shape and lifecycle as postersApi.ts — a saved equipment-sheet
// table image, filed by grade/week, re-editable only in its metadata.
export interface SavedEquipmentSheet {
  id: number
  grade: number
  hafta: number
  title: string
  image: string
  created_at: string
}

const KEY = ['equipment-sheets']

export function useEquipmentSheets() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => (await api.get<Paginated<SavedEquipmentSheet>>('/lessons/equipment-sheets/')).data.results,
  })
}

export function useCreateEquipmentSheet() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ grade, hafta, title, image }: { grade: number; hafta: number; title: string; image: Blob }) => {
      const form = new FormData()
      form.append('grade', String(grade))
      form.append('hafta', String(hafta))
      form.append('title', title)
      form.append('image', image, 'jihozlar.jpg')
      return (await api.post<SavedEquipmentSheet>('/lessons/equipment-sheets/', form)).data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  })
}

export function useUpdateEquipmentSheet() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, grade, hafta, title }: { id: number; grade: number; hafta: number; title: string }) =>
      (await api.patch<SavedEquipmentSheet>(`/lessons/equipment-sheets/${id}/`, { grade, hafta, title })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  })
}

export function useDeleteEquipmentSheet() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => api.delete(`/lessons/equipment-sheets/${id}/`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  })
}
