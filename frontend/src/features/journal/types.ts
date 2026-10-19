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
  created_at: string
  students: Student[]
}

export type AttendanceStatus = 's' | 'n' | 'k'

export interface GridDay {
  id: number
  date: string
  chorak: number
  topic: string
  marks: Record<string, number>
  attendance: Record<string, AttendanceStatus>
}

/** Which days the current user may still change (backend journal/locks.py):
 * the lesson day itself, days an administrator opened, or any day for an
 * administrator (`free`). */
export interface GridLock {
  today: string
  free: boolean
  grants: { id: number; date_from: string; date_to: string; expires_at: string }[]
  pending: { id: number; date_from: string; date_to: string }[]
}

export interface Grid {
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
  classes: { id: number; label: string }[]
}

export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  s: 'Sababli',
  n: 'Sababsiz',
  k: 'Kech',
}
