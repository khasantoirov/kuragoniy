import { useQuery } from '@tanstack/react-query'

import type { IC } from '@/icons'
import { api } from '@/lib/api/client'

/* Reyting va nishonlar (backend achievements/). */

export interface Badge {
  key: string
  label: string
  icon: keyof typeof IC
  unit: string
  tiers: number[]
  tier: number
  tier_name: string
  value: number
  next: number | null
  earned_at: string | null
}

export interface BoardRow {
  user: string
  name: string
  photo: string | null
  points: number
  counts: Record<string, number>
  rank: number
}

export interface Board {
  month: string
  rows: BoardRow[]
  points: Record<string, number>
}

export function useBadges(student = false) {
  return useQuery({
    queryKey: ['achievements', 'badges', student],
    queryFn: async () => (await api.get<Badge[]>(student ? '/student/badges/' : '/achievements/badges/')).data,
  })
}

export function useLeaderboard(month: string) {
  return useQuery({
    queryKey: ['achievements', 'board', month],
    queryFn: async () => (await api.get<Board>('/achievements/leaderboard/', { params: { month } })).data,
    placeholderData: (prev) => prev,
  })
}
