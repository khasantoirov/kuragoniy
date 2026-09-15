export interface Student {
  id: number
  full_name: string
  order: number
  active: boolean
}

export interface JournalClass {
  id: number
  school: string
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

export interface Grid {
  students: Student[]
  days: GridDay[]
  finals: Record<string, Record<string, number>>
}

export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  s: 'Sababli',
  n: 'Sababsiz',
  k: 'Kech',
}
