export type DashboardChorak = 1 | 2 | 3 | 4 | 'u'

export interface MasteryBands {
  good: number
  mid: number
  bad: number
  ungraded: number
  class_avg: number | null
  class_pct: number | null
}

export interface JournalSection {
  total_classes: number
  total_students: number
  mastery: MasteryBands
  attendance_rate_pct: number | null
}

export interface SignupDay {
  date: string
  count: number
}

export interface RoleCount {
  role: string
  count: number
}

export interface GradeCount {
  grade: string
  count: number
}

export interface UsersSection {
  total: number
  pending_approval: number
  by_role: RoleCount[]
  signups_by_day: SignupDay[]
}

export interface LessonsSection {
  total: number
  by_grade: GradeCount[]
}

export interface EngagementSection {
  push_subscribers: number
  announcements_last_30d: number
  translation_jobs_pending: number
}

export interface TeacherDashboardSummary {
  role: 'teacher'
  chorak: string
  generated_at: string
  journal: JournalSection
}

export interface AdminDashboardSummary {
  role: 'admin'
  chorak: string
  generated_at: string
  journal: JournalSection
  users: UsersSection
  lessons: LessonsSection
  engagement: EngagementSection
}

export type DashboardSummary = TeacherDashboardSummary | AdminDashboardSummary
