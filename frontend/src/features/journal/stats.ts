import { levelOf, type Scale } from './scales'
import type { Grid } from './types'

/** Per-pupil averages on the class's own scale, plus O'zlashtirish: the
 * share of pupils whose marks average 3.5 or more by colour band («4»–«5»)
 * — the same definition as the statistics pages (backend schools/stats.py),
 * so it means the same on a 0-5, 0-10 or 0-100 class. */
export function computeStats(grid: Pick<Grid, 'students'>, days: Grid['days'], scale: Scale) {
  const perStudent = grid.students.map((s) => {
    const vals = days.map((d) => d.marks[s.id]).filter((v): v is number => typeof v === 'number' && v >= 0 && v <= scale)
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
    const lvl = vals.length ? vals.reduce((a, v) => a + levelOf(v, scale), 0) / vals.length : null
    return { avg, lvl, n: vals.length }
  })
  const all = perStudent.filter((s) => s.avg !== null) as { avg: number; lvl: number; n: number }[]
  const classAvg = all.length ? all.reduce((a, b) => a + b.avg, 0) / all.length : null
  const pct = all.length ? Math.round((100 * all.filter((s) => s.lvl >= 3.5).length) / all.length) : null
  return { perStudent, classAvg, pct }
}
