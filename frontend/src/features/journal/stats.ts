import { levelOf, type Scale } from './scales'
import type { ControlWork, Grid } from './types'

/** Per-pupil averages on the class's own scale, plus O'zlashtirish: the
 * mean of all marks as a percent of the top mark (4.2 of 5 = 84%) — the
 * same definition as the statistics pages (backend schools/stats.py), so it
 * means the same on a 0-5, 0-10 or 0-100 class. */
export function computeStats(grid: { students: { id: number }[] }, days: Grid['days'], scale: Scale) {
  const perStudent = grid.students.map((s) => {
    const vals = days.map((d) => d.marks[s.id]).filter((v): v is number => typeof v === 'number' && v >= 0 && v <= scale)
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
    const lvl = vals.length ? vals.reduce((a, v) => a + levelOf(v, scale), 0) / vals.length : null
    return { avg, lvl, n: vals.length }
  })
  const all = perStudent.filter((s) => s.avg !== null) as { avg: number; lvl: number; n: number }[]
  const classAvg = all.length ? all.reduce((a, b) => a + b.avg, 0) / all.length : null
  let sum = 0
  let n = 0
  for (const d of days) {
    for (const v of Object.values(d.marks)) {
      if (typeof v === 'number' && v >= 0 && v <= scale) {
        sum += (100 * v) / scale
        n++
      }
    }
  }
  const pct = n ? Math.round(sum / n) : null
  return { perStudent, classAvg, pct }
}

/** The roster's mean of one set of marks — a lesson day's, or the
 * quarter grades — on the class's scale; null when nobody has one. */
export function meanOf(students: { id: number }[], marks: Record<string, number> | undefined) {
  const vals = students.map((s) => marks?.[s.id]).filter((v): v is number => typeof v === 'number')
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
}

/** Nazorat ishi: the roster's mean result (out of 100) over some control
 * works — kept apart from the lesson marks above. */
export function controlAvg(students: { id: number }[], works: ControlWork[]) {
  let sum = 0
  let n = 0
  for (const w of works) {
    for (const st of students) {
      const v = w.marks[st.id]
      if (typeof v === 'number') {
        sum += v
        n++
      }
    }
  }
  return n ? Math.round(sum / n) : null
}
