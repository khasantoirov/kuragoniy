import { lazy, type ComponentType } from 'react'
import { Navigate } from 'react-router-dom'

import { PageTabs } from '@/components/PageTabs'
import { mayUseAdminPanel, useAuth } from '@/lib/auth/AuthContext'

/* Boshqaruv at kuragoniy.uz/admin — while admin.kuragoniy.uz has no DNS
   record and certificate yet (lib/adminHost PANEL_ENABLED off). The same
   sections as the panel, Rollar included, as tabs; for an Admin or the
   developer only, as the panel would be (owner's choice, 2026-11-26). */

function named<T extends string>(load: () => Promise<Record<T, ComponentType>>, name: T) {
  return lazy(() => load().then((m) => ({ default: m[name] })))
}

const AdminPage = named(() => import('@/features/admin/AdminPage'), 'AdminPage')
const AdminDataPanel = named(() => import('@/features/admin/AdminPage'), 'AdminDataPanel')
const RolesPage = named(() => import('@/features/admin/RolesPage'), 'RolesPage')
const ModulesPanel = named(() => import('@/features/admin/ModulesPanel'), 'ModulesPanel')
const ProtectionPanel = named(() => import('@/features/admin/ProtectionPanel'), 'ProtectionPanel')
const LicencesPanel = named(() => import('@/features/admin/LicencesPanel'), 'LicencesPanel')
const AcademicYearsPanel = named(() => import('@/features/admin/AcademicYearsPanel'), 'AcademicYearsPanel')
const SitePanel = named(() => import('@/features/admin/SitePanel'), 'SitePanel')
const SecurityLogPage = named(() => import('@/features/manage/ManagePages'), 'SecurityLogPage')

export function AdminTabsLegacy() {
  const { user } = useAuth()
  if (!mayUseAdminPanel(user)) return <Navigate to="/" replace />
  return (
    <PageTabs tabs={[
      { key: 'users', label: 'Foydalanuvchilar', element: <AdminPage /> },
      { key: 'rollar', label: 'Rollar', element: <RolesPage /> },
      { key: 'malumot', label: "Ma'lumot", element: <AdminDataPanel /> },
      { key: 'security', label: 'Xavfsizlik jurnali', element: <SecurityLogPage /> },
      { key: 'modules', label: 'Modullar', element: <ModulesPanel /> },
      { key: 'himoya', label: 'Himoya', element: <ProtectionPanel /> },
      { key: 'litsenziya', label: 'Litsenziyalar', element: <LicencesPanel /> },
      { key: 'yillar', label: "O'quv yillari", element: <AcademicYearsPanel /> },
      { key: 'sayt', label: 'Sayt', element: <SitePanel /> },
    ]} />
  )
}
