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

/** Mirrors backend journal/locks.py can_edit_day(). Grids from an older
 * server carry no `lock` and stay editable. */
export function canEditDay(lock: GridLock | undefined, date: string) {
  if (!lock || lock.free || date === lock.today) return true
  return !!grantFor(lock, date)
}
