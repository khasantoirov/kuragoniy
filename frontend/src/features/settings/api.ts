import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api/client'

export interface SessionRow {
  id: number
  label: string
  browser: string
  os: string
  mobile: boolean
  ip: string | null
  created_at: string
  last_seen_at: string
  current: boolean
}

export interface SecurityRow {
  id: number
  action: string
  at: string
  ip: string | null
  device: string
  detail: string
}

export interface Overview {
  role: string
  joined: string | null
  classes?: number
  students?: number
  accounts?: number
  assignments?: number
  readiness?: number
  awards?: number
  reports?: { total: number; reviewed: number; returned: number; pending: number }
  rating?: number | null
  recent_reports?: { id: number; topic: string; date: string; status: 'submitted' | 'reviewed' | 'returned'; rating: number | null; comment: string }[]
  recent_awards?: { id: number; title: string; period: string; created_at: string }[]
}

export function useSessions() {
  return useQuery({ queryKey: ['me', 'sessions'], queryFn: async () => (await api.get<SessionRow[]>('/auth/sessions/')).data })
}

export function useRevokeSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => api.post(`/auth/sessions/${id}/revoke/`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me', 'sessions'] })
      qc.invalidateQueries({ queryKey: ['me', 'security-log'] })
    },
  })
}

export function useSecurityLog() {
  return useQuery({ queryKey: ['me', 'security-log'], queryFn: async () => (await api.get<SecurityRow[]>('/accounts/me/security-log/')).data })
}

export function useOverview() {
  return useQuery({ queryKey: ['me', 'overview'], queryFn: async () => (await api.get<Overview>('/accounts/me/overview/')).data })
}
