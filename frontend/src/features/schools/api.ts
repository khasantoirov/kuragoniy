import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api/client'
import type { Paginated } from '@/lib/api/types'

export interface School {
  id: number
  name: string
  district: string
  address: string
  director: string
  phone: string
  contract_start: string | null
  contract_end: string | null
  is_active: boolean
  aliases: string[]
  notes: string
  teachers_count: number
  classes_count: number
  students_count: number
}

export interface SchoolTeacherRow {
  id: string
  name: string
  phone: string
  email: string | null
  assigned: boolean
  classes: number
  since: string | null
  online?: boolean
  last_seen?: string | null
}

/** Journal figures — see backend/schools/stats.py for the definitions. */
export interface Metrics {
  students: number
  days: number
  marks: number
  avg_mark: number | null
  uzlashtirish: number | null
  sifat: number | null
  attendance: number | null
  abs_s: number
  abs_n: number
  late: number
  accounts: number
  platform_avg: number | null
}

export interface GroupRow extends Metrics {
  id: number | string
  name: string
  classes: number
  teachers?: number
}

export interface ClassRow extends Metrics {
  class_id: number
  name: string
  school_text: string
  school_id: number | null
  school: string
  teacher_id: string
  teacher: string
}

export interface TrendPoint {
  month: string
  avg_mark: number | null
  marks: number
  attendance: number | null
}

export interface AttentionRow {
  student_id: number
  name: string
  class_id: number
  class_name: string
  teacher: string
  school: string
  avg_mark: number | null
  marks: number
  unexcused: number
  reasons: ('low_mark' | 'absences')[]
}

export interface Overview {
  totals: Metrics & { schools: number; teachers: number; classes: number }
  schools: GroupRow[]
  trend: TrendPoint[]
}

export interface SchoolStats {
  school: { id: number; name: string; district: string; is_active: boolean } | null
  totals: Metrics
  teachers: GroupRow[]
  classes: ClassRow[]
  trend: TrendPoint[]
  attention: AttentionRow[]
}

export interface MyClassesStats {
  totals: Metrics
  schools: GroupRow[]
  classes: ClassRow[]
  trend: TrendPoint[]
  attention: AttentionRow[]
}

export interface UnlinkedName {
  text: string
  variants: string[]
  classes: number
  slots: number
  teachers: string[]
}

export interface DirectoryRow {
  id: number
  name: string
  class_id: number
  class_name: string
  teacher_id: string
  teacher: string
  school_id: number | null
  school: string
  school_linked: boolean
  login: string | null
  avg_mark: number | null
  marks: number
  abs_s: number
  abs_n: number
  late: number
}

const chorakParam = (chorak: string) => (chorak && chorak !== 'all' ? { chorak } : {})

export function useSchools() {
  return useQuery({
    queryKey: ['schools', 'list'],
    queryFn: async () => (await api.get<Paginated<School>>('/schools/', { params: { page_size: 500 } })).data.results,
  })
}

export function useSchool(id: string | undefined) {
  return useQuery({
    queryKey: ['schools', 'one', id],
    enabled: !!id && id !== 'none',
    queryFn: async () => (await api.get<School & { teachers: SchoolTeacherRow[] }>(`/schools/${id}/`)).data,
  })
}

export function useSchoolsOverview(chorak: string) {
  return useQuery({
    queryKey: ['schools', 'overview', chorak],
    queryFn: async () => (await api.get<Overview>('/schools/stats/overview/', { params: chorakParam(chorak) })).data,
  })
}

export function useSchoolStats(id: string | undefined, chorak: string) {
  return useQuery({
    queryKey: ['schools', 'stats', id, chorak],
    enabled: !!id,
    queryFn: async () => (await api.get<SchoolStats>(`/schools/stats/school/${id}/`, { params: chorakParam(chorak) })).data,
  })
}

export function useMyClassesStats(chorak: string) {
  return useQuery({
    queryKey: ['schools', 'mine', chorak],
    queryFn: async () => (await api.get<MyClassesStats>('/schools/stats/mine/', { params: chorakParam(chorak) })).data,
  })
}

export function useUnlinked(enabled = true) {
  return useQuery({
    queryKey: ['schools', 'unlinked'],
    enabled,
    queryFn: async () => (await api.get<UnlinkedName[]>('/schools/unlinked/')).data,
  })
}

export function useDirectory(params: Record<string, string | number | undefined>) {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''))
  return useQuery({
    queryKey: ['schools', 'directory', clean],
    queryFn: async () => (await api.get<Paginated<DirectoryRow>>('/schools/directory/', { params: clean })).data,
    placeholderData: (prev) => prev,
  })
}

export function useSchoolsMutation<T, R = unknown>(fn: (v: T) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schools'] })
      qc.invalidateQueries({ queryKey: ['journal'] })
    },
  })
}

export const CHORAK_OPTIONS = [
  { value: 'all', label: "Butun o'quv yili" },
  { value: '1', label: '1-chorak' },
  { value: '2', label: '2-chorak' },
  { value: '3', label: '3-chorak' },
  { value: '4', label: '4-chorak' },
]
