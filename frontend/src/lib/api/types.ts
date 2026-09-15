export type Role = 'teacher' | 'admin' | 'boshliq'

export interface User {
  id: string
  name: string
  email: string
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
}

export interface Paginated<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}
