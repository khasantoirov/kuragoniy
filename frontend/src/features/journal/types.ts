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
  can_grant: boolean
  teacher: string
  teacher_name: string
  grants: { id: number; date_from: string; date_to: string; expires_at: string }[]
  pending: { id: number; date_from: string; date_to: string; reason: string }[]
}

export interface Grid {
  scale?: number
  students: Student[]
  days: GridDay[]
  finals: Record<string, Record<string, number>>
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
