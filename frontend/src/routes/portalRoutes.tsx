import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, type RouteObject } from 'react-router-dom'

import { MovedTo, PageTabs } from '@/components/PageTabs'
import { Skeleton } from '@/components/Skeleton'
import { AdminPage } from '@/features/admin/AdminPage'
import { ModulesPanel } from '@/features/admin/ModulesPanel'
import { JournalPage } from '@/features/journal/JournalPage'
import { LessonsPage } from '@/features/lessons/LessonsPage'
import { ChangePasswordPage } from '@/features/auth/ChangePasswordPage'
import { StudentRegisterPage } from '@/features/auth/StudentRegisterPage'
import { HomePage } from '@/features/home/HomePage'
import { isAdminInView, isObserver, isOversight, isTeacherLike, useAuth } from '@/lib/auth/AuthContext'
import { useModules } from '@/lib/modules'
import { useUIStore, type ViewMode } from '@/store/uiStore'

import { RequireAuth, RequireOversight, RequirePasswordChange, RequireModule, RequireStaff, RequireStudent, RequireTeacher } from './guards'

// Every portal feature is its own lazy chunk: students never download the
// staff pages (and vice versa), and the shop (administration only for
// now) is never downloaded by teachers.
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
const StatisticsPage = named(() => import('@/features/statistics/StatisticsPage'), 'StatisticsPage')
const DirectoryPage = named(() => import('@/features/schools/DirectoryPage'), 'DirectoryPage')
const MyClassesPage = named(() => import('@/features/schools/MyClassesPage'), 'MyClassesPage')

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<Skeleton lines={5} />}>{children}</Suspense>
}

/** "/" for the staff app: the read-only Kuzatuvchi lands on the
 * administration dashboard instead of the teacher home. */
export function StaffHome() {
  const { user } = useAuth()
  if (isObserver(user)) return <Navigate to="/statistics" replace />
  return <HomePage />
}

// The administration's view of things (RequireOversight's rule).
const oversees = (user: Parameters<typeof isObserver>[0], viewMode: ViewMode) =>
  isObserver(user) || (isOversight(user) && viewMode !== 'teacher')

/** Do'kon — the catalogue and one's orders (administrators: the shop is
 * theirs for now) beside the selling side, Sotuv bo'limi. */
function ShopTabs() {
  const { user } = useAuth()
  const viewMode = useUIStore((s) => s.viewMode)
  const admin = isAdminInView(user, viewMode)
  return (
    <PageTabs tabs={[
      { key: 'dokon', label: "Do'kon", element: <ShopPage />, show: admin },
      { key: 'orders', label: 'Buyurtmalarim', element: <OrdersPage />, show: admin },
      { key: 'sotuv', label: "Sotuv bo'limi", element: <ShopAdminPage /> },
    ]} />
  )
}

/** Dars hisobotlari — teachers hand in their lessons, the administration
 * grades them (Baholash, their first tab). */
function ReportsTabs() {
  const { user } = useAuth()
  const viewMode = useUIStore((s) => s.viewMode)
  const mine = { key: 'mine', label: 'Mening hisobotlarim', element: <ReportsPage />, show: isTeacherLike(user) }
  const review = { key: 'baholash', label: 'Baholash', element: <ReviewReportsPage />, show: oversees(user, viewMode) }
  return <PageTabs tabs={review.show ? [review, mine] : [mine]} />
}

/** Statistika — the administration's analytics in one place: the overview
 * (Umumiy, administrators), the ratings (Tahlil), schools, platform
 * results, the pupils' database and Rag'batlantirish. */
function StatsTabs() {
  const { user } = useAuth()
  const viewMode = useUIStore((s) => s.viewMode)
  return (
    <PageTabs tabs={[
      { key: 'umumiy', label: 'Umumiy', element: <StatisticsPage />, show: isAdminInView(user, viewMode) },
      { key: 'tahlil', label: 'Tahlil', element: <ManageDashboard /> },
      { key: 'maktablar', label: 'Hamkor maktablar', element: <SchoolsPage /> },
      { key: 'natijalar', label: 'Natijalar', element: <TeacherResultsPage /> },
      { key: 'baza', label: "Ma'lumotlar bazasi", element: <DirectoryPage /> },
      { key: 'awards', label: "Rag'batlantirish", element: <AwardsPage /> },
    ]} />
  )
}

/** Boshqaruv — users and roles, and the security log. */
export function AdminTabs() {
  return (
    <PageTabs tabs={[
      { key: 'users', label: 'Foydalanuvchilar', element: <AdminPage /> },
      { key: 'security', label: 'Xavfsizlik jurnali', element: <SecurityLogPage /> },
      { key: 'modules', label: 'Modullar', element: <ModulesPanel /> },
    ]} />
  )
}

/** Darslar — the lessons, the teacher's check before a lesson, and for the
 * administration the pupils' materials. */
export function LessonsTabs() {
  const { user } = useAuth()
  const viewMode = useUIStore((s) => s.viewMode)
  const { on } = useModules()
  return (
    <PageTabs tabs={[
      { key: 'darslar', label: 'Darslar', element: <LessonsPage /> },
      { key: 'tayyorgarlik', label: 'Darsga tayyorgarlik', element: <ReadinessPage />, show: isTeacherLike(user) && on('readiness') },
      { key: 'materiallar', label: "O'quv materiallari", element: <MaterialsPage />, show: oversees(user, viewMode) },
    ]} />
  )
}

/** Jurnal — the journal, one's classes' statistics and the pupils' accounts. */
export function JournalTabs() {
  const { user } = useAuth()
  return (
    <PageTabs tabs={[
      { key: 'jurnal', label: 'Jurnal', element: <JournalPage /> },
      { key: 'sinflarim', label: 'Sinflarim', element: <MyClassesPage />, show: isTeacherLike(user) },
      { key: 'oquvchilar', label: "O'quvchilar", element: <StudentsPage />, show: isTeacherLike(user) },
    ]} />
  )
}

/** Vazifalar — homework for a class, and the live games for the lesson. */
function AssignmentsTabs() {
  const { on } = useModules()
  return (
    <PageTabs tabs={[
      { key: 'vazifalar', label: 'Vazifalar', element: <AssignmentsPage />, show: on('assignments') },
      { key: 'oyinlar', label: "O'yinlar", element: <GamesPage />, show: on('games') },
    ]} />
  )
}

const teacher = (el: ReactNode) => <RequireTeacher><Lazy>{el}</Lazy></RequireTeacher>
const staff = (el: ReactNode) => <RequireStaff><Lazy>{el}</Lazy></RequireStaff>
const oversight = (el: ReactNode) => <RequireOversight><Lazy>{el}</Lazy></RequireOversight>

/** Children of the staff AppShell route. */
export const staffPortalRoutes: RouteObject[] = [
  { path: '/students', element: <MovedTo to="/journal" bolim="oquvchilar" /> },
  { path: '/assignments', element: teacher(<RequireModule keys={['assignments', 'games']}><AssignmentsTabs /></RequireModule>) },
  { path: '/assignments/:id', element: <RequireModule keys={['assignments']}><Lazy><AssignmentResultsPage /></Lazy></RequireModule> },
  { path: '/reports', element: staff(<RequireModule keys={['reports']}><ReportsTabs /></RequireModule>) },
  { path: '/readiness', element: <MovedTo to="/lessons" bolim="tayyorgarlik" /> },
  { path: '/results', element: <MovedTo to="/statistics" bolim="natijalar" /> },
  { path: '/class-stats', element: <MovedTo to="/journal" bolim="sinflarim" /> },
  { path: '/games', element: <MovedTo to="/assignments" bolim="oyinlar" /> },
  { path: '/shop', element: oversight(<RequireModule keys={['shop']}><ShopTabs /></RequireModule>) },
  { path: '/shop/orders', element: <MovedTo to="/shop" bolim="orders" /> },
  { path: '/statistics', element: oversight(<StatsTabs />) },
  { path: '/manage', element: <MovedTo to="/statistics" bolim="tahlil" /> },
  { path: '/manage/reports', element: <MovedTo to="/reports" bolim="baholash" /> },
  { path: '/manage/awards', element: <MovedTo to="/statistics" bolim="awards" /> },
  { path: '/manage/materials', element: <MovedTo to="/lessons" bolim="materiallar" /> },
  { path: '/manage/shop', element: <MovedTo to="/shop" bolim="sotuv" /> },
  { path: '/manage/schools', element: <MovedTo to="/statistics" bolim="maktablar" /> },
  { path: '/manage/schools/:id', element: oversight(<SchoolDetailPage />) },
  { path: '/manage/database', element: <MovedTo to="/statistics" bolim="baza" /> },
  { path: '/manage/security', element: <MovedTo to="/admin" bolim="security" /> },
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

