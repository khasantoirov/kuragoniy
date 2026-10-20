import type { Grid } from './types'

export function computeStats(grid: Pick<Grid, 'students'>, days: Grid['days']) {
  const perStudent = grid.students.map((s) => {
    const vals = days.map((d) => d.marks[s.id]).filter((v): v is number => typeof v === 'number' && v >= 0 && v <= 5)
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
    return { avg, n: vals.length }
  })
  const all = perStudent.filter((s) => s.avg !== null) as { avg: number; n: number }[]
  const classAvg = all.length ? all.reduce((a, b) => a + b.avg, 0) / all.length : null
  // O'zlashtirish: share of pupils averaging 3.5 or more («4»–«5») — the
  // same definition as the statistics pages (backend schools/stats.py).
  const pct = all.length ? Math.round((100 * all.filter((s) => s.avg >= 3.5).length) / all.length) : null
  return { perStudent, classAvg, pct }
}
