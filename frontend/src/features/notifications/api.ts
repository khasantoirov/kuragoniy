import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api/client'
import type { Paginated } from '@/lib/api/types'

export type NotifyKind =
  | 'elon' | 'hisobot' | 'ragbat' | 'oquvchi' | 'vazifa' | 'tugilgan' | 'xavfsizlik' | 'dokon' | 'jamoa' | 'jurnal' | 'tizim'

export interface AppNotification {
  id: number
  kind: NotifyKind
  kind_label: string
  title: string
  body: string
  url: string
  data: { name?: string; days?: number; self?: boolean; announcement?: number; preview?: string }
  created_at: string
  read_at: string | null
  archived_at: string | null
}

export interface NotifySummary {
  unread: number
  latest_id: number
  fresh: AppNotification[]
}

export type ChannelKey = 'app' | 'telegram' | 'email'
export type ChannelMap = Record<string, Record<ChannelKey, boolean>>

export interface NotifyPrefs {
  kinds: { key: NotifyKind; label: string; desc: string }[]
  channels: ChannelMap
  email_enabled: boolean
  telegram_linked: boolean
  ui: Record<string, unknown>
}

export function useInbox(box: 'inbox' | 'archive', kind: NotifyKind | '') {
  return useInfiniteQuery({
    queryKey: ['notifications', 'list', box, kind],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) =>
      (await api.get<Paginated<AppNotification>>('/notifications/', { params: { box, kind: kind || undefined, page: pageParam } })).data,
    getNextPageParam: (last, pages) => (last.next ? pages.length + 1 : undefined),
  })
}

export function useNotifyAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, action }: { id: number | 'all'; action: 'read' | 'archive' | 'unarchive' }) =>
      id === 'all' ? api.post('/notifications/read-all/') : api.post(`/notifications/${id}/${action}/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
}

export function usePrefs(enabled = true) {
  return useQuery({
    queryKey: ['notifications', 'prefs'],
    queryFn: async () => (await api.get<NotifyPrefs>('/notifications/prefs/')).data,
    enabled,
    staleTime: 5 * 60_000,
  })
}

export function useSavePrefs() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: { channels?: ChannelMap; ui?: Record<string, unknown> }) =>
      (await api.put<NotifyPrefs>('/notifications/prefs/', body)).data,
    onSuccess: (data) => qc.setQueryData(['notifications', 'prefs'], data),
  })
}
