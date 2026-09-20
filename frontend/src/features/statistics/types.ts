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
  telegram_linked: number
  two_factor_enabled: number
}

export interface ChorakCount {
  chorak: number
  count: number
}

export interface LessonsSection {
  total: number
  by_grade: GradeCount[]
  by_chorak: ChorakCount[]
  experiments_total: number
  /** Yuklangan fayli yoki tashqi havolasi bor darslar. */
  with_document: number
  /** Bot tarjima qilib bo'lgan darslar. */
  translated: number
}

export interface WeekdayHours {
  day_index: number
  hours: number
}

/** Haftalik dars yuklamasi (soatlarda) — band belgilari va bo'sh qatorlarsiz. */
export interface TimetableSection {
  total_hours: number
  by_day: WeekdayHours[]
}

export interface EngagementSection {
  /** Serverda VAPID kalitlari sozlanganmi — aks holda obuna bo'lish mumkin emas. */
  push_configured: boolean
  push_subscribers: number
  announcements_last_30d: number
  translation_jobs_pending: number
}

export interface TeacherDashboardSummary {
  role: 'teacher'
  chorak: string
  generated_at: string
  journal: JournalSection
  timetable: TimetableSection
}

export interface AdminDashboardSummary {
  role: 'admin'
  chorak: string
  generated_at: string
  journal: JournalSection
  timetable: TimetableSection
  users: UsersSection
  lessons: LessonsSection
  engagement: EngagementSection
}

export type DashboardSummary = TeacherDashboardSummary | AdminDashboardSummary
