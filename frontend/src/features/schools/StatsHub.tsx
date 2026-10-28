import { useSearchParams } from 'react-router-dom'

import { PageTabs } from '@/components/PageTabs'
import { AwardsPage, ManageDashboard } from '@/features/manage/ManagePages'
import { StatisticsPage } from '@/features/statistics/StatisticsPage'
import { TeacherResultsPage } from '@/features/teacher/TeacherResultsPage'
import { isAdminInView, useAuth } from '@/lib/auth/AuthContext'
import { useUIStore } from '@/store/uiStore'

import { DirectoryPage } from './DirectoryPage'
import { SchoolsPage } from './SchoolsPage'
import { STATS_FILTER_PARAMS, StatsFilterBar, StatsFilterProvider, type StatsField } from './statsFilter'

/** What each tab can be filtered by. */
const FIELDS: Record<string, StatsField[]> = {
  tahlil: ['school', 'teacher', 'class'],
  maktablar: ['chorak', 'school', 'teacher', 'class'],
  sinflar: ['chorak', 'school', 'teacher', 'class'],
  natijalar: ['school', 'teacher', 'class'],
  baza: ['school', 'teacher', 'class'],
}

/** Statistika — the administration's analytics in one place, with one
 * filter panel over them (statsFilter.tsx); the overview (Umumiy) keeps its
 * own school and class pickers. */
export function StatsHub() {
  const [params] = useSearchParams()
  const { user } = useAuth()
  const viewMode = useUIStore((s) => s.viewMode)
  const admin = isAdminInView(user, viewMode)
  const tabs = [
    { key: 'umumiy', label: 'Umumiy', element: <StatisticsPage />, show: admin },
    { key: 'tahlil', label: 'Tahlil', element: <ManageDashboard /> },
    { key: 'maktablar', label: 'Hamkor maktablar', element: <SchoolsPage /> },
    { key: 'natijalar', label: 'Natijalar', element: <TeacherResultsPage /> },
    { key: 'baza', label: "Ma'lumotlar bazasi", element: <DirectoryPage /> },
    { key: 'awards', label: "Rag'batlantirish", element: <AwardsPage /> },
  ]
  const open = params.get('bolim') || (admin ? 'umumiy' : 'tahlil')
  return (
    <StatsFilterProvider>
      <PageTabs tabs={tabs} keep={STATS_FILTER_PARAMS} toolbar={<StatsFilterBar fields={FIELDS[open] ?? []} />} />
    </StatsFilterProvider>
  )
}
