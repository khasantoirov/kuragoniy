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
  /** A school's page: the o'quv yili in view, and the partnership year by year. */
  year?: number
  years?: SchoolYearRow[]
  /** A school's page: its licence state (backend schools/licensing.py). */
  licence?: LicenceStatus & { usage: { teachers: number; pupils: number }; enforced: boolean }
  /** A school's page: its own ma'muriyat on the platform. */
  managers?: { id: string; name: string; phone: string; position: ManagerPosition; position_label: string }[]
}

export type ManagerPosition = 'direktor' | 'zavuch' | 'boshqa'
export type TeacherKind = 'maktab' | 'muhandis'
export type LicenceState = 'none' | 'future' | 'expired' | 'ending' | 'trial' | 'unpaid' | 'active'
export type LicencePlan = 'sinov' | 'standart' | 'premium'

export interface Licence {
  id: number
  plan: LicencePlan
  plan_label: string
  starts_on: string
  ends_on: string
  teacher_seats: number | null
  pupil_seats: number | null
  amount: number | null
  paid: boolean
  paid_on: string | null
  note: string
}

export interface LicenceStatus {
  state: LicenceState
  label: string
  in_force: boolean
  days_left: number | null
  licence: Licence | null
}

export interface LicenceRow extends LicenceStatus {
  school: { id: number; name: string; is_active: boolean; district: string }
  usage: { teachers: number; pupils: number }
  history: Licence[]
}

export interface LicencesOverview {
  enforced: boolean
  ending_days: number
  plans: { value: LicencePlan; label: string }[]
  schools: LicenceRow[]
}

export function useLicences(enabled = true) {
  return useQuery({
    queryKey: ['schools', 'licences'],
    enabled,
    queryFn: async () => (await api.get<LicencesOverview>('/schools/licenses/')).data,
  })
}

export interface SchoolYearRow {
  id: number
  name: string
  is_current: boolean
  is_active: boolean
  classes: number
}

export interface SchoolTeacherRow {
  id: string
  name: string
  phone: string
  email: string | null
  assigned: boolean
  /** the school's own teacher, or one Muhandis D sends */
  kind: TeacherKind
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
  /** a teacher's row: the partner schools of their classes, and whether some are linked to none */
  schools?: string[]
  unlinked?: boolean
}

/** What Statistika's journal rows are grouped by. */
export type StatsGroup = 'school' | 'teacher' | 'class'

/** Pupils by the band their average rounds to, and those with no mark yet. */
export interface PupilBands {
  alo: number
  yaxshi: number
  qoniqarli: number
  qoniqarsiz: number
  yomon: number
  ungraded: number
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
  /** Sortable bucket id (week start, YYYY-MM, year-chorak, year). */
  key: string
  /** Axis label: "07.09", "09.26", "1-chorak", "2026–27". */
  label: string
  month?: string
  avg_mark: number | null
  uzlashtirish?: number | null
  marks: number
  attendance: number | null
}

/** What the pie charts show for the selected period. */
export interface Composition {
  marks: Record<'5' | '4' | '3' | '2' | '1', number>
  attendance: { present: number; late: number; excused: number; unexcused: number }
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
  group: StatsGroup
  /** GroupRow for school / teacher, ClassRow for class */
  rows: (GroupRow | ClassRow)[]
  trend: TrendPoint[]
  composition?: Composition
  bands: PupilBands
  /** pupils with an average below "3" or several unexcused absences */
  attention: AttentionRow[]
}

export interface SchoolStats {
  school: { id: number; name: string; district: string; is_active: boolean } | null
  totals: Metrics
  teachers: GroupRow[]
  /** Muhandis D's teachers vs the school's own (id: TeacherKind) */
  by_kind?: (GroupRow & { teachers: number })[]
  classes: ClassRow[]
  trend: TrendPoint[]
  composition?: Composition
  attention: AttentionRow[]
}

export interface MyClassesStats {
  totals: Metrics
  schools: GroupRow[]
  classes: ClassRow[]
  trend: TrendPoint[]
  composition?: Composition
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

/** All schools — or as narrowed by Statistika's filter (school / teacher / class). */
export function useSchoolsOverview(chorak: string, period = 'month', scope: { school?: string; teacher?: string; class?: string } = {},
  group: StatsGroup = 'school') {
  const narrow = Object.fromEntries(Object.entries(scope).filter(([, v]) => v))
  return useQuery({
    queryKey: ['schools', 'overview', chorak, period, narrow, group],
    queryFn: async () => (await api.get<Overview>('/schools/stats/overview/', { params: { ...chorakParam(chorak), period, group, ...narrow } })).data,
    placeholderData: (prev) => prev,
  })
}

export function useSchoolStats(id: string | undefined, chorak: string, period = 'month') {
  return useQuery({
    queryKey: ['schools', 'stats', id, chorak, period],
    enabled: !!id,
    queryFn: async () => (await api.get<SchoolStats>(`/schools/stats/school/${id}/`, { params: { ...chorakParam(chorak), period } })).data,
    placeholderData: (prev) => prev,
  })
}

export function useMyClassesStats(chorak: string, period = 'month') {
  return useQuery({
    queryKey: ['schools', 'mine', chorak, period],
    queryFn: async () => (await api.get<MyClassesStats>('/schools/stats/mine/', { params: { ...chorakParam(chorak), period } })).data,
    placeholderData: (prev) => prev,
  })
}

/** One class as Statistika's filter sees it (backend stats.class_rows). */
export interface ClassRowLite {
  class_id: number
  name: string
  school_id: number | null
  school: string
  school_text: string
  teacher_id: string
  teacher: string
}

/** O'quv yili (backend schools.AcademicYear): one is current. */
export interface AcademicYear {
  id: number
  name: string
  start_year: number
  is_current: boolean
  classes: number
  /** the four choraks' dates (Ustozlar xonasi counts weeks by them) */
  quarters: { start: string; end: string }[]
  /** false: the usual dates, not set by the administration yet */
  quarters_exact: boolean
}

export function useYears() {
  return useQuery({
    queryKey: ['schools', 'years'],
    queryFn: async () => (await api.get<AcademicYear[]>('/schools/years/')).data,
    staleTime: 5 * 60_000,
  })
}

/** Every class in view — the filter panel's schools, teachers and classes. */
export function useClassRows() {
  return useQuery({
    queryKey: ['schools', 'class-rows'],
    queryFn: async () => (await api.get<ClassRowLite[]>('/schools/stats/classes/')).data,
    staleTime: 60_000,
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
  { value: 'all', label: "O'quv yili" },
  { value: '1', label: '1-chorak' },
  { value: '2', label: '2-chorak' },
  { value: '3', label: '3-chorak' },
  { value: '4', label: '4-chorak' },
]
