export interface Student {
  id: number
  full_name: string
  order: number
  active: boolean
}

export interface JournalClass {
  id: number
  school: string
  partner_school?: number | null
  partner_school_name?: string
  name: string
  /** Grading scale: marks go 0..scale (5, 10 or 100). */
  scale: number
  /** O'quv yili (backend schools.AcademicYear) — "2026-2027". */
  year?: number | null
  year_name?: string
  created_at: string
  students: Student[]
}

export type AttendanceStatus = 's' | 'n' | 'k' | 'x'

export interface GridDay {
  id: number
  date: string
  chorak: number
  topic: string
  period?: number | null
  marks: Record<string, number>
  attendance: Record<string, AttendanceStatus>
}

/** Which days of this journal are open (backend journal/locks.py): the
 * lesson day itself and days an administrator opened — for everyone,
 * administrators included. `owner`: the viewer is this journal's teacher
 * (only they write to it); `can_grant`: the viewer may open days. */
export interface GridLock {
  today: string
  owner: boolean
  /** A past o'quv yili's journal: read-only but for opened days. */
  past_year?: boolean
  can_grant: boolean
  /** The viewer grades nazorat ishi here (administrators). */
  can_control?: boolean
  teacher: string
  teacher_name: string
  grants: { id: number; date_from: string; date_to: string; expires_at: string }[]
  pending: { id: number; date_from: string; date_to: string; reason: string }[]
}

/** Nazorat ishi: a control test the administration grades, always out
 * of 100. Read-only for the class's teacher. */
export interface ControlWork {
  id: number
  journal_class: number
  date: string
  chorak: number
  title: string
  marks: Record<string, number>
  by_name: string
}

/** A pupil moved to another class with their marks left here as an
 * archive (backend journal/transfer.py) — shown greyed under the roster. */
export interface ArchivedStudent {
  id: number
  full_name: string
  moved_to_class: string
}

export interface Grid {
  scale?: number
  students: Student[]
  archived?: ArchivedStudent[]
  days: GridDay[]
  finals: Record<string, Record<string, number>>
  controls?: ControlWork[]
  lock?: GridLock
}

export type GrantStatus = 'pending' | 'approved' | 'rejected' | 'revoked'

export interface EditGrant {
  id: number
  teacher: string
  teacher_name: string
  journal_class: number | null
  class_label: string
  date_from: string
  date_to: string
  reason: string
  status: GrantStatus
  created_at: string
  decided_by_name: string
  decided_at: string | null
  note: string
  expires_at: string | null
  active: boolean
}

export interface GrantTeacher {
  id: string
  name: string
  role: string
  classes: { id: number; label: string }[]
  open: { id: number; class_label: string; date_from: string; date_to: string; expires_at: string }[]
  pending: number
}

export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  s: 'Sababli',
  n: 'Kelmadi',
  k: 'Kech',
  x: 'Kirmadi',
}
