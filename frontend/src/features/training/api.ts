import { useQuery, useQueryClient } from '@tanstack/react-query'

import type { Question } from '@/features/learning/api'
import { api } from '@/lib/api/client'

/* Malaka oshirish (backend training/). */

export type Audience = 'all' | 'maktab' | 'muhandis'

export const AUDIENCES: { value: Audience; label: string }[] = [
  { value: 'all', label: "Barcha o'qituvchilar" },
  { value: 'maktab', label: "Maktab o'qituvchilari" },
  { value: 'muhandis', label: "Muhandis D o'qituvchilari" },
]

export interface Progress {
  modules_total: number
  modules_passed: number
  lessons_total: number
  lessons_read: number
  percent: number
  completed: boolean
}

export interface CourseMeta {
  id: number
  title: string
  summary: string
  hours: number
  audience: Audience
  pass_percent: number
  is_published: boolean
  order: number
  created_at: string
  updated_at: string
}

export interface CourseCard extends CourseMeta, Progress {
  module_count: number
  enrolled: boolean
  assigned: boolean
  due_on: string | null
  overdue: boolean
  certificate: { id: number; number: string } | null
  /** administration only */
  enrolled_count: number | null
  completed_count: number | null
}

export interface LessonView {
  id: number
  title: string
  done: boolean
  /** absent while the module is locked */
  body?: string
  video_url?: string
  links?: { title: string; url: string }[]
}

export interface ModuleView {
  id: number
  title: string
  locked: boolean
  passed: boolean
  lessons_done: boolean
  has_test: boolean
  question_count: number
  best_percent: number | null
  attempts: number
  test_open: boolean
  lessons: LessonView[]
}

export interface Certificate {
  id: number
  user: number
  course: number | null
  course_title: string
  name: string
  hours: number
  percent: number
  number: string
  code: string
  issued_at: string
}

export interface CourseDetail extends CourseMeta, Progress {
  module_count: number
  enrolled: boolean
  due_on: string | null
  certificate: Certificate | null
  can_learn: boolean
  modules: ModuleView[]
}

export interface EditorLesson {
  id?: number
  title: string
  body: string
  video_url: string
  links: { title: string; url: string }[]
}

export interface EditorModule {
  id: number
  title: string
  order: number
  test_size: number
  questions: Question[]
  lessons: EditorLesson[]
}

export interface EditorCourse extends CourseMeta {
  modules: EditorModule[]
}

export interface PersonRow extends Progress {
  user: number
  name: string
  photo: string | null
  assigned: boolean
  due_on: string | null
  overdue: boolean
  started_at: string | null
  certificate: { id: number; number: string; percent: number } | null
}

export interface SchoolTraining {
  certified: number
  teachers: {
    id: number
    name: string
    courses: { course: number; title: string; percent: number; completed: boolean; due_on: string | null; overdue: boolean; certificate: { id: number; number: string } | null }[]
  }[]
}

export function useCourses() {
  return useQuery({
    queryKey: ['training', 'courses'],
    queryFn: async () => (await api.get<CourseCard[]>('/training/courses/')).data,
  })
}

export function useCourse(id: string | number | undefined) {
  return useQuery({
    queryKey: ['training', 'course', String(id)],
    enabled: !!id,
    queryFn: async () => (await api.get<CourseDetail>(`/training/courses/${id}/`)).data,
  })
}

export function useCourseEditor(id: string | undefined) {
  return useQuery({
    queryKey: ['training', 'editor', id],
    enabled: !!id,
    // the editor holds unsaved work: never refetched under it
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    queryFn: async () => (await api.get<EditorCourse>(`/training/courses/${id}/`, { params: { edit: 1 } })).data,
  })
}

export function useCourseProgress(id: number | undefined, enabled = true) {
  return useQuery({
    queryKey: ['training', 'progress', id],
    enabled: !!id && enabled,
    queryFn: async () => (await api.get<PersonRow[]>(`/training/courses/${id}/progress/`)).data,
  })
}

export function useCertificates(who?: 'all') {
  return useQuery({
    queryKey: ['training', 'certificates', who ?? 'mine'],
    queryFn: async () => (await api.get<Certificate[]>('/training/certificates/', { params: who ? { user: who } : {} })).data,
  })
}

export function useCertificate(id: number | null) {
  return useQuery({
    queryKey: ['training', 'certificate', id],
    enabled: id != null,
    queryFn: async () => (await api.get<Certificate>(`/training/certificates/${id}/`)).data,
  })
}

export function useSchoolTraining(schoolId: number | undefined) {
  return useQuery({
    queryKey: ['training', 'school', schoolId],
    enabled: !!schoolId,
    queryFn: async () => (await api.get<SchoolTraining>(`/training/schools/${schoolId}/`)).data,
  })
}

export function useInvalidateTraining() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['training'] })
}

/** Everything but the open editor (which keeps its own unsaved state). */
export function useInvalidateTrainingViews() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['training'], predicate: (q) => q.queryKey[1] !== 'editor' })
}

export function blankQuestion(): Question {
  return {
    kind: 'test', topic: 'nazariya', text: '', image_url: '', options: ['', '', '', ''], correct: [0],
    answer_value: null, tolerance_pct: 2, unit: '', explanation: '', points: 1,
  }
}
