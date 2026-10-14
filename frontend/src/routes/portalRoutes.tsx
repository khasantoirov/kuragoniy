import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, type RouteObject } from 'react-router-dom'

import { Skeleton } from '@/components/Skeleton'
import { ChangePasswordPage } from '@/features/auth/ChangePasswordPage'
import { StudentRegisterPage } from '@/features/auth/StudentRegisterPage'
import { HomePage } from '@/features/home/HomePage'
import { isObserver, useAuth } from '@/lib/auth/AuthContext'

import { RequireAdmin, RequireAuth, RequireOversight, RequirePasswordChange, RequireStudent, RequireTeacher } from './guards'

// Every portal feature is its own lazy chunk: students never download the
// staff pages (and vice versa), and a teacher who never opens the shop
// never downloads it.
const StudentApp = lazy(() => import('@/features/student/routes'))
const named = <T extends Record<string, unknown>>(loader: () => Promise<T>, key: keyof T) =>
  lazy(() => loader().then((m) => ({ default: m[key] as React.ComponentType })))

const StudentsPage = named(() => import('@/features/teacher/StudentsPage'), 'StudentsPage')
const AssignmentsPage = named(() => import('@/features/teacher/AssignmentsPage'), 'AssignmentsPage')
const AssignmentResultsPage = named(() => import('@/features/teacher/AssignmentsPage'), 'AssignmentResultsPage')
const ReportsPage = named(() => import('@/features/teacher/ReportsPage'), 'ReportsPage')
const ReadinessPage = named(() => import('@/features/teacher/ReadinessPage'), 'ReadinessPage')
const TeacherResultsPage = named(() => import('@/features/teacher/TeacherResultsPage'), 'TeacherResultsPage')
const GamesPage = named(() => import('@/features/teacher/GamesPage'), 'GamesPage')
const ManageDashboard = named(() => import('@/features/manage/ManagePages'), 'ManageDashboard')
const ReviewReportsPage = named(() => import('@/features/manage/ManagePages'), 'ReviewReportsPage')
const AwardsPage = named(() => import('@/features/manage/ManagePages'), 'AwardsPage')
const SecurityLogPage = named(() => import('@/features/manage/ManagePages'), 'SecurityLogPage')
const MaterialsPage = named(() => import('@/features/manage/MaterialsPage'), 'MaterialsPage')
const ShopPage = named(() => import('@/features/shop/ShopPage'), 'ShopPage')
const OrdersPage = named(() => import('@/features/shop/OrdersPage'), 'OrdersPage')
const ShopAdminPage = named(() => import('@/features/shop/ShopAdminPage'), 'ShopAdminPage')
const SchoolsPage = named(() => import('@/features/schools/SchoolsPage'), 'SchoolsPage')
const SchoolDetailPage = named(() => import('@/features/schools/SchoolDetailPage'), 'SchoolDetailPage')
const DirectoryPage = named(() => import('@/features/schools/DirectoryPage'), 'DirectoryPage')
const MyClassesPage = named(() => import('@/features/schools/MyClassesPage'), 'MyClassesPage')

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<Skeleton lines={5} />}>{children}</Suspense>
}

/** "/" for the staff app: the read-only Kuzatuvchi lands on the
 * administration dashboard instead of the teacher home. */
export function StaffHome() {
  const { user } = useAuth()
  if (isObserver(user)) return <Navigate to="/manage" replace />
  return <HomePage />
}

const teacher = (el: ReactNode) => <RequireTeacher><Lazy>{el}</Lazy></RequireTeacher>
const oversight = (el: ReactNode) => <RequireOversight><Lazy>{el}</Lazy></RequireOversight>

/** Children of the staff AppShell route. */
export const staffPortalRoutes: RouteObject[] = [
  { path: '/students', element: teacher(<StudentsPage />) },
  { path: '/assignments', element: teacher(<AssignmentsPage />) },
  { path: '/assignments/:id', element: <Lazy><AssignmentResultsPage /></Lazy> },
  { path: '/reports', element: teacher(<ReportsPage />) },
  { path: '/readiness', element: teacher(<ReadinessPage />) },
  { path: '/results', element: teacher(<TeacherResultsPage />) },
  { path: '/class-stats', element: teacher(<MyClassesPage />) },
  { path: '/games', element: teacher(<GamesPage />) },
  { path: '/shop', element: <Lazy><ShopPage /></Lazy> },
  { path: '/shop/orders', element: <Lazy><OrdersPage /></Lazy> },
  { path: '/manage', element: oversight(<ManageDashboard />) },
  { path: '/manage/reports', element: oversight(<ReviewReportsPage />) },
  { path: '/manage/awards', element: oversight(<AwardsPage />) },
  { path: '/manage/materials', element: oversight(<MaterialsPage />) },
  { path: '/manage/shop', element: oversight(<ShopAdminPage />) },
  { path: '/manage/schools', element: oversight(<SchoolsPage />) },
  { path: '/manage/schools/:id', element: oversight(<SchoolDetailPage />) },
  { path: '/manage/database', element: oversight(<DirectoryPage />) },
  { path: '/manage/security', element: <RequireAdmin><Lazy><SecurityLogPage /></Lazy></RequireAdmin> },
]

/** Top-level routes outside the staff shell. */
export const topLevelPortalRoutes: RouteObject[] = [
  {
    path: '/s/*',
    element: (
      <RequireAuth>
        <RequireStudent>
          <Suspense fallback={<div style={{ padding: 24 }}><Skeleton lines={6} /></div>}>
            <StudentApp />
          </Suspense>
        </RequireStudent>
      </RequireAuth>
    ),
  },
  {
    path: '/change-password',
    element: (
      <RequirePasswordChange>
        <ChangePasswordPage />
      </RequirePasswordChange>
    ),
  },
]

/** Children of the guest AuthLayout route. */
export const guestPortalRoutes: RouteObject[] = [{ path: '/join', element: <StudentRegisterPage /> }]

