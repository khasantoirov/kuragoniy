import type { GridLock } from './types'

const pad = (n: number) => String(n).padStart(2, '0')

/** Today on this device as YYYY-MM-DD — `toISOString()` would give the UTC
 * date, which is still yesterday in Tashkent until 05:00. */
export function localToday() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function grantFor(lock: GridLock | undefined, date: string) {
  return lock?.grants.find((g) => g.date_from <= date && date <= g.date_to)
}

export function isPending(lock: GridLock | undefined, date: string) {
  return !!lock?.pending.some((g) => g.date_from <= date && date <= g.date_to)
}

/** Mirrors backend journal/locks.py can_edit_day(): only the journal's
 * own teacher writes, on the lesson day or a day opened for them. */
export function canEditDay(lock: GridLock | undefined, date: string) {
  if (!lock) return true
  if (!lock.owner) return false
  return date === lock.today || !!grantFor(lock, date)
}

/** "Every past day" grants (the teacher-row button) span ~400 days. */
export function isAllPast(g: { date_from: string; date_to: string }) {
  return (new Date(g.date_to).getTime() - new Date(g.date_from).getTime()) / 86_400_000 > 60
}

/** How long an opened day stays open. */
export const DURATIONS = [
  { h: 1, label: '1 soat' },
  { h: 3, label: '3 soat' },
  { h: 24, label: '24 soat' },
  { h: 72, label: '3 kun' },
  { h: 168, label: '7 kun' },
]
