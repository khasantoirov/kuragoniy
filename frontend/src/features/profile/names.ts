import type { User } from '@/lib/api/types'

/** The first name and surname as stored — or, for an account from before
 *  they were split, the server's guess from the old one-field name. */
export function nameParts(u: User | null | undefined): [string, string] {
  if (!u) return ['', '']
  if (u.first_name) return [u.first_name, u.last_name ?? '']
  return u.name_guess ?? [u.name ?? '', '']
}

/** The server's field errors ({field: ["..."]}) as one message per field. */
export function fieldErrors(err: unknown): Record<string, string> {
  const data = (err as { response?: { data?: Record<string, string[] | string> } }).response?.data
  if (!data || typeof data !== 'object') return {}
  return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, Array.isArray(v) ? String(v[0]) : String(v)]))
}

/** A space in the first-name box: the surname has its own field. */
export const ONE_WORD = "Ism bitta so'zdan iborat bo'lsin — familiyani alohida maydonga yozing."
