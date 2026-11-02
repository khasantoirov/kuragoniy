import { Navigate, useSearchParams } from 'react-router-dom'

import { PageTabs } from '@/components/PageTabs'
import { OnlineLearningTab } from '@/features/manage/ManagePages'
import { StatisticsPage } from '@/features/statistics/StatisticsPage'
import { isAdminInView, useAuth } from '@/lib/auth/AuthContext'
import { useUIStore } from '@/store/uiStore'

import { DirectoryPage } from './DirectoryPage'
import { SchoolsPage } from './SchoolsPage'
import { STATS_FILTER_PARAMS, StatsFilterBar, StatsFilterProvider, type StatsField } from './statsFilter'

/** What each tab can be filtered by. */
const FIELDS: Record<string, StatsField[]> = {
  umumiy: ['chorak', 'school', 'teacher', 'class'],
  maktablar: ['chorak', 'school', 'teacher', 'class'],
  sinflar: ['chorak', 'school', 'teacher', 'class'],
  onlayn: ['school', 'teacher', 'class'],
  baza: ['school', 'teacher', 'class'],
}

/** Old tab names, still in bookmarks and old notifications. */
const MOVED: Record<string, string> = { tahlil: 'onlayn', natijalar: 'onlayn', awards: 'onlayn' }

/** Statistika — the administration's analytics in one place, with one
 * filter panel over them (statsFilter.tsx); the overview (Umumiy) keeps its
 * own school and class pickers. */
export function StatsHub() {
  const [params] = useSearchParams()
  const { user } = useAuth()
  const viewMode = useUIStore((s) => s.viewMode)
  const admin = isAdminInView(user, viewMode)
  const tabs = [
    { key: 'umumiy', label: "Umumiy ko'rinish", element: <StatisticsPage />, show: admin },
    { key: 'maktablar', label: 'Hamkor maktablar', element: <SchoolsPage /> },
    { key: 'onlayn', label: "Onlayn ta'lim", element: <OnlineLearningTab /> },
    { key: 'baza', label: "O'quvchilar bazasi", element: <DirectoryPage /> },
  ]
  const bolim = params.get('bolim')
  if (bolim && MOVED[bolim]) {
    const next = new URLSearchParams(params)
    next.set('bolim', MOVED[bolim])
    return <Navigate to={`?${next}`} replace />
  }
  const open = bolim || tabs.find((x) => x.show !== false)!.key
  return (
    <StatsFilterProvider>
      <PageTabs tabs={tabs} keep={STATS_FILTER_PARAMS} toolbar={<StatsFilterBar fields={FIELDS[open] ?? []} />} />
    </StatsFilterProvider>
  )
}
