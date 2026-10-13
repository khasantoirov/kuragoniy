export type Role = 'teacher' | 'admin' | 'boshliq' | 'kuzatuvchi' | 'student'

export interface StudentInfo {
  grade: number | null
  class_id: number | null
  class_name: string
  school: string
  teacher_name: string
}

export interface User {
  id: string
  name: string
  email: string | null
  role: Role
  approved: boolean
  photo: string | null
  bday: string | null
  phone: string
  telegram_linked: boolean
  telegram_username: string
  // Only present when the viewer is admin/boshliq/dev-superuser — see
  // accounts/serializers.py::AdminUserSerializer. Absent (not null) for a
  // plain teacher's own view of a colleague.
  telegram_chat_id?: number | null
  is_dev_superuser: boolean
  created_at: string
  totp_enabled: boolean
  // Self profile (/accounts/me/) only.
  username?: string | null
  must_change_password?: boolean
  student?: StudentInfo | null
  // Admin view only.
  online?: boolean
  last_seen?: string | null
  last_login?: string | null
  locked_until?: string | null
  failed_login_count?: number
}

export interface Paginated<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}
