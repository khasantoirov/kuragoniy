import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api/client'
import type { Paginated, User } from '@/lib/api/types'

import type { Announcement } from './types'

export function useAnnouncements() {
  return useQuery({
    queryKey: ['announcements'],
    queryFn: async () => (await api.get<Paginated<Announcement>>('/announcements/')).data.results,
  })
}

/** Approved colleagues (+ admins) — used for the home-page birthday
 * notification, mirroring the old notify.js's `users` snapshot filter. */
export function useApprovedUsers() {
  return useQuery({
    queryKey: ['accounts', 'approved-users'],
    queryFn: async () =>
      (await api.get<Paginated<User>>('/accounts/users/')).data.results.filter((u) => u.approved || u.role === 'admin'),
    staleTime: 5 * 60_000,
  })
}

export function useCreateAnnouncement() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (text: string) => (await api.post<Announcement>('/announcements/', { text })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['announcements'] }),
  })
}

export function useDeleteAnnouncement() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => api.delete(`/announcements/${id}/`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['announcements'] }) },
  })
}
