import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api/client'
import type { Paginated } from '@/lib/api/types'

// ── Types (mirror backend/learning serializers) ─────────────────────

export interface TeacherClass {
  id: number
  name: string
  school: string
  teacher: string
  teacher_name: string
  grade: number | null
  invite_code: string | null
  invite_active: boolean
  auto_approve: boolean
  roster_count: number
  account_count: number
  pending_count: number
}

export interface StudentAccountRow {
  id: string
  name: string
  username: string
  approved: boolean
  is_active: boolean
  must_change_password: boolean
  telegram_linked: boolean
  last_login: string | null
  locked: boolean
  roster_id: number | null
  attempts: number
}

export interface ClassStudents {
  class: TeacherClass
  accounts: StudentAccountRow[]
  roster_without_account: { id: number; full_name: string }[]
}

export interface Credential {
  id: string
  name: string
  username: string
  password: string
}

export type QuestionKind = 'test' | 'multi' | 'number' | 'text'

export interface Question {
  id?: number
  lesson?: number | null
  assignment?: number | null
  audience?: 'student' | 'teacher'
  kind: QuestionKind
  topic: 'nazariya' | 'formula' | 'tajriba' | 'masala'
  text: string
  image_url: string
  options: string[]
  correct: (number | string)[]
  answer_value: number | null
  tolerance_pct: number
  unit: string
  explanation: string
  points: number
  order?: number
}

export interface Assignment {
  id: number
  journal_class: number
  class_name: string
  lesson: number | null
  lesson_title: string
  teacher: string
  teacher_name: string
  title: string
  instructions: string
  include_lesson_questions: boolean
  due_at: string | null
  max_attempts: number
  show_answers: 'after_submit' | 'after_due' | 'never'
  is_published: boolean
  created_at: string
  custom_questions: Question[]
  question_count: number
  stats?: { submitted: number; avg_percent: number | null; students: number } | null
}

export interface AssignmentResults {
  assignment: Assignment
  rows: {
    user: string
    name: string
    state: 'submitted' | 'in_progress' | 'overdue' | 'todo'
    attempts: number
    best_percent: number | null
    best_attempt: number | null
    is_late: boolean
    submitted_at: string | null
    duration_sec: number | null
  }[]
  question_stats: { text: string; topic: string; kind: string; n: number; ok: number; percent: number }[]
}

export interface AttemptSummary {
  id: number
  user: string
  user_name: string
  kind: 'practice' | 'homework' | 'readiness'
  assignment: number | null
  assignment_title: string
  lesson: number | null
  lesson_title: string
  started_at: string
  submitted_at: string | null
  is_late: boolean
  score: number
  max_score: number
  percent: number
  duration_sec: number | null
}

export interface LessonReport {
  id: number
  teacher: string
  teacher_name: string
  journal_class: number | null
  class_name: string
  lesson: number | null
  lesson_title: string
  date: string
  topic: string
  summary: string
  methods: string
  students_present: number | null
  students_total: number | null
  media_links: string[]
  readiness_attempt: number | null
  readiness_percent: number | null
  status: 'submitted' | 'reviewed' | 'returned'
  rating: number | null
  review_comment: string
  reviewed_by_name: string
  reviewed_at: string | null
  created_at: string
}

export interface Award {
  id: number
  recipient: string
  recipient_name: string
  recipient_role: string
  kind: 'student_of_month' | 'best_lesson' | 'top_teacher' | 'custom'
  title: string
  reason: string
  period: string
  granted_by_name: string
  created_at: string
}

export interface LessonMaterial {
  lesson: number
  lesson_title: string
  grade: number
  theory: string
  formulas: { expr: string; desc: string }[]
  video_url: string
  extra_videos: { title: string; url: string }[]
  is_published: boolean
  updated_at: string | null
  question_counts?: Record<string, number>
}

export interface Overview {
  students: number
  active_students: number
  attempts: number
  avg_percent: number | null
  homework_expected: number
  homework_done: number
  completion_rate: number | null
  assignments: number
  reports: number
  avg_rating: number | null
  readiness_checks: number
  readiness_avg: number | null
  trend: { week: string; attempts: number; avg_percent: number }[]
  lessons: number
  with_material: number
}

export interface TopStudent {
  rank: number
  user: string
  name: string
  class_id: number | null
  class_name: string
  grade: number | null
  attempts: number
  avg_percent: number
  quality: number
  completion_rate: number | null
  activity: number
  score: number
}

export interface TopTeacher {
  rank: number
  user: string
  name: string
  reports: number
  avg_rating: number | null
  rating_score: number | null
  readiness_checks: number
  readiness_avg: number | null
  class_avg_percent: number | null
  completion_rate: number | null
  score: number
}

export interface ClassRow {
  class_id: number
  name: string
  school: string
  teacher: string
  students: number
  active_students: number
  attempts: number
  avg_percent: number | null
}

export interface LessonStatRow {
  lesson: number
  title: string
  grade: number
  attempts: number
  students: number
  avg_percent: number
  has_material: boolean
}

export interface AnalyticsFilters {
  period?: string
  teacher?: string
  class?: string | number
  grade?: string | number
}

// ── Hooks ───────────────────────────────────────────────────────────

export function useTeacherClasses(teacher?: string) {
  return useQuery({
    queryKey: ['learning', 'classes', teacher ?? 'me'],
    queryFn: async () =>
      (await api.get<Paginated<TeacherClass>>('/learning/classes/', { params: teacher ? { teacher } : {} })).data.results,
  })
}

export function useClassStudents(classId: number | null) {
  return useQuery({
    queryKey: ['learning', 'class-students', classId],
    enabled: classId != null,
    queryFn: async () => (await api.get<ClassStudents>(`/learning/classes/${classId}/students/`)).data,
  })
}

export function useAssignments(params: Record<string, string | number | undefined> = {}) {
  return useQuery({
    queryKey: ['learning', 'assignments', params],
    queryFn: async () => (await api.get<Paginated<Assignment>>('/learning/assignments/', { params })).data.results,
  })
}

export function useReports(params: Record<string, string | undefined> = {}) {
  return useQuery({
    queryKey: ['learning', 'reports', params],
    queryFn: async () => (await api.get<Paginated<LessonReport>>('/learning/reports/', { params })).data.results,
  })
}

export function useAwards(params: Record<string, string | undefined> = {}) {
  return useQuery({
    queryKey: ['learning', 'awards', params],
    queryFn: async () => (await api.get<Paginated<Award>>('/learning/awards/', { params })).data.results,
  })
}

export function useAnalytics<T>(report: string, filters: AnalyticsFilters, enabled = true) {
  const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined && v !== ''))
  return useQuery({
    queryKey: ['learning', 'analytics', report, params],
    enabled,
    queryFn: async () => (await api.get<T>(`/learning/analytics/${report}/`, { params })).data,
  })
}

export function useTeachersList(enabled = true) {
  return useQuery({
    queryKey: ['learning', 'teachers'],
    enabled,
    queryFn: async () => (await api.get<{ id: string; name: string; role: string }[]>('/learning/teachers/')).data,
  })
}

export function useInvalidateLearning() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['learning'] })
}

export function useReadinessStatus() {
  return useQuery({
    queryKey: ['learning', 'readiness-status'],
    queryFn: async () =>
      (await api.get<Record<string, { attempts: number; best_percent: number | null; passed: boolean }>>('/learning/readiness/status/')).data,
  })
}

export function useLearningMutation<TVars>(fn: (v: TVars) => Promise<unknown>) {
  const invalidate = useInvalidateLearning()
  return useMutation({ mutationFn: fn, onSuccess: () => invalidate() })
}

export const EMPTY_QUESTION: Question = {
  kind: 'test',
  topic: 'nazariya',
  text: '',
  image_url: '',
  options: ['', '', '', ''],
  correct: [0],
  answer_value: null,
  tolerance_pct: 2,
  unit: '',
  explanation: '',
  points: 1,
}

export const PERIOD_OPTIONS = [
  { value: 'week', label: 'Hafta' },
  { value: 'month', label: 'Oy' },
  { value: 'quarter', label: 'Chorak' },
  { value: 'year', label: 'Yil' },
  { value: 'all', label: 'Hammasi' },
]

export interface LessonOption {
  id: number
  title: string
  grade: number
  chorak: number
  hafta: number
}

/** All lessons (optionally one grade) as light options for selects —
 * walks every page, since a grade can exceed one page of results. */
export function useLessonOptions(grade?: number | null) {
  return useQuery({
    queryKey: ['learning', 'lesson-options', grade ?? 'all'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const out: LessonOption[] = []
      let url: string | null = '/lessons/'
      let params: Record<string, number> | undefined = grade ? { grade } : undefined
      while (url) {
        const res: { data: Paginated<LessonOption> } = await api.get(url, { params })
        out.push(...res.data.results.map(({ id, title, grade: g, chorak, hafta }) => ({ id, title, grade: g, chorak, hafta })))
        url = res.data.next ? res.data.next.replace(/^.*\/api/, '') : null
        params = undefined
      }
      return out.sort((a, b) => a.grade - b.grade || a.chorak - b.chorak || a.hafta - b.hafta)
    },
  })
}
