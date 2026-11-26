import { isAbsent } from './attendance'
import type { GridDay, PracticalWork } from './types'

/* Amaliy ishlar and the journal's per-pupil extras (owner's mock-ups,
   2026-11-26): the "L-1" / "STEAM-1" column labels, attendance in %, and
   the Faollik holati. */

/** The chorak's works in column order — laboratoriya first, then STEAM,
 *  each by date — with their numbers: "L-1", "L-2", "STEAM-1". */
export function numbered(works: PracticalWork[]) {
  const sorted = [...works].sort((a, b) => (a.kind === b.kind ? a.date.localeCompare(b.date) || a.id - b.id : a.kind === 'lab' ? -1 : 1))
  const seen = { lab: 0, stem: 0 }
  return sorted.map((w) => ({ work: w, tag: `${w.kind === 'lab' ? 'L' : 'STEAM'}-${++seen[w.kind]}` }))
}

export const KIND_LABEL: Record<PracticalWork['kind'], string> = {
  lab: 'Laboratoriya ishi',
  stem: 'STEAM loyiha',
}

/** A pupil's attendance over the chorak's lesson days, in %: late counts
 *  as present; sababli, kelmadi and kirmadi as absent. Null with no days. */
export function attendancePct(studentId: number, days: GridDay[]): number | null {
  if (!days.length) return null
  const absent = days.filter((d) => isAbsent(d.attendance[studentId])).length
  return Math.round((100 * (days.length - absent)) / days.length)
}

// the owner's choice: "Ogohlantirish" below 3.5 (on the 0-5 bands) or 85 %
export const WARN_LEVEL = 3.5
export const WARN_ATTENDANCE = 85

export type Activity = 'faol' | 'ogoh' | null

/** Faollik holati: a warning when the average band is under 3.5 or the
 *  attendance under 85 %; nothing to say before any mark or lesson. */
export function activityOf(level: number | null, attendance: number | null): Activity {
  if (level === null && attendance === null) return null
  if ((level !== null && level < WARN_LEVEL) || (attendance !== null && attendance < WARN_ATTENDANCE)) return 'ogoh'
  return 'faol'
}
