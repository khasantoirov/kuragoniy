import { useQuery } from '@tanstack/react-query'

import type { AttemptSummary, Award } from '@/features/learning/api'
import { api } from '@/lib/api/client'

export interface XpInfo {
  xp: number
  level: number
  level_progress: number
  next_level_xp: number
  lessons_completed: number
}

export interface StudentDashboard {
  xp: XpInfo
  pending_homework: { id: number; title: string; due_at: string | null; state: string }[]
  pending_count: number
  recent_results: AttemptSummary[]
  avg_percent: number | null
  attempts: number
  class_rank: number | null
  class_size: number
  awards: Award[]
  lessons_available: number
}

export interface LessonProgress {
  opened?: boolean
  theory_done: boolean
  video_done: boolean
  best_percent: number | null
  completed: boolean
}

export interface StudentLesson {
  id: number
  title: string
  title_ru: string
  title_en: string
  grade: number
  chorak: number
  hafta: number
  cat: string
  question_count: number
  progress: LessonProgress
}

export interface StudentLessonDetail {
  id: number
  title: string
  title_ru: string
  title_en: string
  grade: number
  chorak: number
  hafta: number
  goal: string
  sim_id: string
  theory: string
  formulas: { expr: string; desc: string }[]
  video_url: string
  extra_videos: { title: string; url: string }[]
  experiments: { id: number; name: string; type: string; desc: string; video: string; image: string; minutes: number | null; safety: string }[]
  question_count: number
  progress: LessonProgress
}

export interface StudentAssignment {
  id: number
  title: string
  instructions: string
  lesson: number | null
  lesson_title: string
  teacher_name: string
  due_at: string | null
  max_attempts: number
  created_at: string
  is_overdue: boolean
  state: 'todo' | 'in_progress' | 'submitted' | 'overdue'
  attempts_used: number
  best_percent: number | null
  last_attempt: number | null
}

export interface LeaderRow {
  rank: number
  name: string
  attempts: number
  avg: number
  score: number
  is_me: boolean
}

export function useStudentDashboard() {
  return useQuery({ queryKey: ['student', 'dashboard'], queryFn: async () => (await api.get<StudentDashboard>('/student/dashboard/')).data })
}

export function useStudentLessons() {
  return useQuery({ queryKey: ['student', 'lessons'], queryFn: async () => (await api.get<StudentLesson[]>('/student/lessons/')).data })
}

export function useStudentLesson(id: number) {
  return useQuery({
    queryKey: ['student', 'lesson', id],
    queryFn: async () => (await api.get<StudentLessonDetail>(`/student/lessons/${id}/`)).data,
  })
}

export function useStudentAssignments() {
  return useQuery({ queryKey: ['student', 'assignments'], queryFn: async () => (await api.get<StudentAssignment[]>('/student/assignments/')).data })
}

export function useStudentResults() {
  return useQuery({ queryKey: ['student', 'results'], queryFn: async () => (await api.get<AttemptSummary[]>('/student/results/')).data })
}

export function useLeaderboard() {
  return useQuery({
    queryKey: ['student', 'leaderboard'],
    queryFn: async () => (await api.get<{ class_name: string; rows: LeaderRow[] }>('/student/leaderboard/')).data,
  })
}
