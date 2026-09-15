import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api/client'
import type { Paginated } from '@/lib/api/types'

import type { LibraryItem } from './types'

export function useLibraryItems() {
  return useQuery({
    queryKey: ['library'],
    queryFn: async () => (await api.get<Paginated<LibraryItem>>('/library/')).data.results,
  })
}

export function useSaveLibraryItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (item: Partial<LibraryItem> & { id?: number }) => {
      if (item.id) return (await api.patch<LibraryItem>(`/library/${item.id}/`, item)).data
      return (await api.post<LibraryItem>('/library/', item)).data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['library'] }),
  })
}

export function useUploadLibraryFile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, file }: { id: number; file: File }) => {
      const form = new FormData()
      form.append('file', file)
      return (await api.post<LibraryItem>(`/library/${id}/upload-file/`, form)).data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['library'] }),
  })
}

export function useRemoveLibraryFile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => (await api.post<LibraryItem>(`/library/${id}/remove-file/`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['library'] }),
  })
}

export function useDeleteLibraryItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => api.delete(`/library/${id}/`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['library'] }),
  })
}
