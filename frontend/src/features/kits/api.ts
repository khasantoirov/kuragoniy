import { useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api/client'

/* STEAM chamadonlar (backend kits/). */

export interface OwnedRow { id: number; name: string; quantity: number }
export interface SchoolRef { id: number; name: string }

export interface KitMeta {
  id: number
  name: string
  code: string
  description: string
  instructions: string
  instructions_url: string
  cover_url: string
  is_active: boolean
  order: number
  updated_at: string
}

export interface KitCard extends KitMeta {
  item_count: number
  pieces: number
  lessons_full: number
  price: number | null
  priced_items: number
  owned: OwnedRow[]
}

export interface KitItem { id?: number; key?: string; name: string; quantity: number; price?: number | null; image?: string | null }

export interface KitDetail extends KitMeta {
  items: KitItem[]
  lessons: { id: number; title: string; grade: number | string; chorak: number; hafta: number; percent: number; missing: number }[]
  owned: OwnedRow[]
  my_schools: SchoolRef[]
  /** the administration only */
  schools?: { id: number; name: string; quantity: number; received_on: string | null }[]
  grades?: { value: number | string; label: string }[]
}

export interface Missing { name: string; quantity: number; short: number }

export interface LessonKits {
  needs: { name: string; quantity: number }[]
  kits: { id: number; name: string; code: string; instructions_url: string; percent: number; missing: Missing[]; owned: OwnedRow[] }[]
  my_schools: SchoolRef[]
}

export type KitRequestStatus = 'yangi' | 'qabul' | 'rad' | 'yetkazildi' | 'bekor'

export interface KitRequest {
  id: number
  requester: string
  requester_name: string
  school: number | null
  school_name: string
  kit: number | null
  kit_name: string
  quantity: number
  lesson: number | null
  lesson_title: string
  items: { name: string; quantity: number }[]
  note: string
  status: KitRequestStatus
  status_label: string
  reply: string
  handled_by_name: string
  handled_at: string | null
  created_at: string
}

export const REQUEST_TONE: Record<KitRequestStatus, 'ok' | 'mid' | 'bad' | 'muted' | 'info'> = {
  yangi: 'info', qabul: 'mid', rad: 'bad', yetkazildi: 'ok', bekor: 'muted',
}

export function useKits(enabled = true) {
  return useQuery({ queryKey: ['kits', 'list'], queryFn: async () => (await api.get<KitCard[]>('/kits/')).data, enabled })
}

export function useKit(id: string | number | undefined) {
  return useQuery({
    queryKey: ['kits', 'detail', String(id)],
    enabled: !!id,
    queryFn: async () => (await api.get<KitDetail>(`/kits/${id}/`)).data,
  })
}

export function useLessonKits(lessonId: number | undefined) {
  return useQuery({
    queryKey: ['kits', 'lesson', lessonId],
    enabled: !!lessonId,
    queryFn: async () => (await api.get<LessonKits>(`/kits/lessons/${lessonId}/`)).data,
  })
}

export function useSchoolKits(schoolId: number | undefined) {
  return useQuery({
    queryKey: ['kits', 'school', schoolId],
    enabled: !!schoolId,
    queryFn: async () => (await api.get<{ kit: number; name: string; code: string; quantity: number; received_on: string | null; note: string }[]>(
      `/kits/schools/${schoolId}/`)).data,
  })
}

export function useKitRequests(all = false, status = '') {
  return useQuery({
    queryKey: ['kits', 'requests', all, status],
    queryFn: async () => (await api.get<KitRequest[]>('/kits/requests/', { params: all ? { all: 1, status } : {} })).data,
  })
}

export function useInvalidateKits() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['kits'] })
}

export const som = (n: number | null | undefined) => (n == null ? '—' : `${n.toLocaleString('ru-RU').replace(/,/g, ' ')} so'm`)
