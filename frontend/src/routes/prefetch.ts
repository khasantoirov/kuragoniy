/**
 * The everyday pages are lazy chunks (routes/index.tsx, portalRoutes.tsx),
 * so the first screen downloads and runs less. Once it is up and the
 * browser has nothing else to do, fetch them anyway, so a tap on Darslar,
 * Jurnal or Jadval opens at once instead of showing a skeleton first.
 * Skipped when the phone asks to save data or the connection is 2G.
 */
const EVERYDAY = [
  () => import('@/features/lessons/LessonsPage'),
  () => import('@/features/journal/JournalPage'),
  () => import('@/features/timetable/TimetablePage'),
  () => import('@/features/lessons/LessonDetail'),
]

interface Connection {
  saveData?: boolean
  effectiveType?: string
}

let started = false

export function prefetchEverydayPages() {
  if (started || typeof window === 'undefined') return
  started = true
  const conn = (navigator as Navigator & { connection?: Connection }).connection
  if (conn?.saveData || /(^|-)2g$/.test(conn?.effectiveType ?? '')) return
  const whenIdle = (run: () => void) => {
    if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 5000 })
    else setTimeout(run, 2000)
  }
  whenIdle(() => {
    for (const load of EVERYDAY) {
      load().catch(() => {
        // offline or a deploy in between: the page loads when it is opened
      })
    }
  })
}
