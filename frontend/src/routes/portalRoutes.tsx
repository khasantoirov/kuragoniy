import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, type RouteObject } from 'react-router-dom'

import { MovedTo, PageTabs } from '@/components/PageTabs'
import { Skeleton } from '@/components/Skeleton'
import { YearPicker } from '@/features/schools/YearPicker'
import { HomePage } from '@/features/home/HomePage'
import { isAdminInView, isObserver, isOversight, isSchoolAdmin, isTeacherLike, useAuth } from '@/lib/auth/AuthContext'
import { useModules } from '@/lib/modules'
import { useUIStore, type ViewMode } from '@/store/uiStore'

import {
  RequireAdmin, RequireAuth, RequireFan, RequireOversight, RequirePasswordChange, RequireModule, RequireSchoolView, RequireShop,
  RequireStaff, RequireStudent, RequireTeacher,
} from './guards'

// Every portal feature is its own lazy chunk: students never download the
// staff pages (and vice versa), and the shop (administration only for
// now) is never downloaded by teachers.
const StudentApp = lazy(() => import('@/features/student/routes'))
const named = <T extends Record<string, unknown>>(loader: () => Promise<T>, key: keyof T) =>
  lazy(() => loader().then((m) => ({ default: m[key] as React.ComponentType })))

// the everyday pages too: the first screen downloads only Bosh sahifa,
// and AppShell warms these up once the browser is idle (routes/prefetch.ts)
const JournalPage = named(() => import('@/features/journal/JournalPage'), 'JournalPage')
const LessonsPage = named(() => import('@/features/lessons/LessonsPage'), 'LessonsPage')
const AssignmentsMonitor = named(() => import('@/features/lessons/AssignmentsMonitor'), 'AssignmentsMonitor')
const ChangePasswordPage = named(() => import('@/features/auth/ChangePasswordPage'), 'ChangePasswordPage')
const StudentRegisterPage = named(() => import('@/features/auth/StudentRegisterPage'), 'StudentRegisterPage')
const StudentsPage = named(() => import('@/features/teacher/StudentsPage'), 'StudentsPage')
const AssignmentsPage = named(() => import('@/features/teacher/AssignmentsPage'), 'AssignmentsPage')
const AssignmentResultsPage = named(() => import('@/features/teacher/AssignmentsPage'), 'AssignmentResultsPage')
const ReportsPage = named(() => import('@/features/teacher/ReportsPage'), 'ReportsPage')
const ReadinessPage = named(() => import('@/features/teacher/ReadinessPage'), 'ReadinessPage')
const GamesPage = named(() => import('@/features/teacher/GamesPage'), 'GamesPage')
// Jihozlar jadvali (from amaliyfizika.uz) — the Fizika window's
const EquipmentRegistryPage = named(() => import('@/features/manage/equipment/EquipmentRegistryPage'), 'EquipmentRegistryPage')
const EquipmentSheetPage = named(() => import('@/features/admin/EquipmentSheetPage'), 'EquipmentSheetPage')
const ReviewReportsPage = named(() => import('@/features/manage/ManagePages'), 'ReviewReportsPage')
const MaterialsPage = named(() => import('@/features/manage/MaterialsPage'), 'MaterialsPage')
const ShopPage = named(() => import('@/features/shop/ShopPage'), 'ShopPage')
const OrdersPage = named(() => import('@/features/shop/OrdersPage'), 'OrdersPage')
const ShopAdminPage = named(() => import('@/features/shop/ShopAdminPage'), 'ShopAdminPage')
const SchoolDetailPage = named(() => import('@/features/schools/SchoolDetailPage'), 'SchoolDetailPage')
const PartnerSchoolsPage = named(() => import('@/features/schools/PartnerSchoolsPage'), 'PartnerSchoolsPage')
const MySchoolPage = named(() => import('@/features/schools/MySchoolPage'), 'MySchoolPage')
const TrainingPage = named(() => import('@/features/training/TrainingPage'), 'TrainingPage')
const StaffroomPage = named(() => import('@/features/staffroom/StaffroomPage'), 'StaffroomPage')
const HelpPage = named(() => import('@/features/help/HelpPage'), 'HelpPage')
const GuidesPage = named(() => import('@/features/guides/GuidesPage'), 'GuidesPage')
const SubscriptionsPage = named(() => import('@/features/subscriptions/SubscriptionsPage'), 'SubscriptionsPage')
const AchievementsPage = named(() => import('@/features/achievements/AchievementsPage'), 'AchievementsPage')
const FeedPage = named(() => import('@/features/feed/FeedPage'), 'FeedPage')
const KitsPage = named(() => import('@/features/kits/KitsPage'), 'KitsPage')
const KitPage = named(() => import('@/features/kits/KitPage'), 'KitPage')
const CoursePage = named(() => import('@/features/training/CoursePage'), 'CoursePage')
const CourseEditor = named(() => import('@/features/training/CourseEditor'), 'CourseEditor')
const VerifyPage = named(() => import('@/features/training/VerifyPage'), 'VerifyPage')
const StatsHub = named(() => import('@/features/schools/StatsHub'), 'StatsHub')
const MyClassesPage = named(() => import('@/features/schools/MyClassesPage'), 'MyClassesPage')

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<Skeleton lines={5} />}>{children}</Suspense>
}

/** "/" for the staff app: the read-only Kuzatuvchi lands on the
 * administration dashboard instead of the teacher home. */
export function StaffHome() {
  const { user } = useAuth()
  if (isObserver(user)) return <Navigate to="/statistics" replace />
  if (isSchoolAdmin(user)) return <Navigate to="/my-school" replace />
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
  const buyer = isTeacherLike(user) || isSchoolAdmin(user)
  const seller = admin || isObserver(user)
  return (
    <PageTabs tabs={[
      // teachers and schools' ma'muriyat buy; the administration sells
      { key: 'dokon', label: "STEM do'kon", element: <ShopPage />, show: buyer },
      { key: 'orders', label: 'Buyurtmalarim', element: <OrdersPage />, show: buyer },
      { key: 'sotuv', label: "Sotuv bo'limi", element: <ShopAdminPage />, show: seller },
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

/** Boshqaruv — users and roles, the data tools (Ma'lumot), the security
 * log and the modules. */
/** Darslar — the lessons, the teacher's check before a lesson, and for the
 * administration the pupils' materials. */
export function LessonsTabs() {
  const { user } = useAuth()
  const viewMode = useUIStore((s) => s.viewMode)
  const { on } = useModules()
  const fan = useUIStore((s) => s.subject)
  return (
    <PageTabs tabs={[
      // the lessons, then the window's assignments: who handed in, results
      { key: 'darslar', label: 'Darslar', element: <><LessonsPage /><AssignmentsMonitor /></> },
      { key: 'tayyorgarlik', label: 'Darsga tayyorgarlik', element: <ReadinessPage />, show: isTeacherLike(user) && on('readiness') },
      // Kerakli jihozlar (the kits) belong to the STEAM window
      { key: 'chamadonlar', label: 'Kerakli jihozlar', element: <KitsPage />, show: on('kits') && fan === 'steam' },
      { key: 'materiallar', label: "O'quv materiallari", element: <MaterialsPage />, show: oversees(user, viewMode) && on('materials') },
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
    ]} aside={<YearPicker />} />
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
/** Jihozlar jadvali — the priced registry of the physics lessons'
 * equipment, and (administrators) the picture sheet maker, Jihozlar varag'i. */
function EquipmentTabs() {
  const { user } = useAuth()
  const viewMode = useUIStore((s) => s.viewMode)
  return (
    <PageTabs tabs={[
      { key: 'jadval', label: 'Jihozlar jadvali', element: <EquipmentRegistryPage /> },
      { key: 'varaq', label: "Jihozlar varag'i", element: <EquipmentSheetPage />, show: isAdminInView(user, viewMode) },
    ]} />
  )
}

const staff = (el: ReactNode) => <RequireStaff><Lazy>{el}</Lazy></RequireStaff>
const oversight = (el: ReactNode) => <RequireOversight><Lazy>{el}</Lazy></RequireOversight>

/** Children of the staff AppShell route. */
export const staffPortalRoutes: RouteObject[] = [
  { path: '/students', element: <MovedTo to="/journal" bolim="oquvchilar" /> },
  { path: '/assignments', element: teacher(<RequireModule keys={['assignments', 'games']}><AssignmentsTabs /></RequireModule>) },
  { path: '/assignments/:id', element: <RequireModule keys={['assignments']}><Lazy><AssignmentResultsPage /></Lazy></RequireModule> },
  { path: '/reports', element: staff(<RequireModule keys={['reports']}><ReportsTabs /></RequireModule>) },
  { path: '/readiness', element: <MovedTo to="/lessons" bolim="tayyorgarlik" /> },
  { path: '/results', element: <MovedTo to="/statistics" bolim="onlayn" /> },
  { path: '/class-stats', element: <MovedTo to="/journal" bolim="sinflarim" /> },
  { path: '/games', element: <MovedTo to="/assignments" bolim="oyinlar" /> },
  { path: '/shop', element: <RequireShop><RequireModule keys={['shop']}><Lazy><ShopTabs /></Lazy></RequireModule></RequireShop> },
  // obuna tariflari, the contract and how to pay (features/subscriptions)
  { path: '/obuna', element: <RequireShop><Lazy><SubscriptionsPage /></Lazy></RequireShop> },
  { path: '/shop/orders', element: <MovedTo to="/shop" bolim="orders" /> },
  { path: '/statistics', element: oversight(<StatsHub />) },
  { path: '/manage', element: <MovedTo to="/statistics" bolim="onlayn" /> },
  { path: '/manage/reports', element: <MovedTo to="/reports" bolim="baholash" /> },
  { path: '/manage/awards', element: <MovedTo to="/statistics" bolim="onlayn" /> },
  { path: '/manage/materials', element: <MovedTo to="/lessons" bolim="materiallar" /> },
  { path: '/manage/shop', element: <MovedTo to="/shop" bolim="sotuv" /> },
  { path: '/manage/schools', element: oversight(<Lazy><PartnerSchoolsPage /></Lazy>) },
  { path: '/manage/equipment', element: oversight(<RequireFan fan="fizika"><RequireModule keys={['equipment']}><EquipmentTabs /></RequireModule></RequireFan>) },
  { path: '/manage/schools/:id', element: <RequireSchoolView><Lazy><SchoolDetailPage /></Lazy></RequireSchoolView> },
  { path: '/my-school', element: <Lazy><MySchoolPage /></Lazy> },
  { path: '/kits/:id', element: <RequireModule keys={['kits']}><Lazy><KitPage /></Lazy></RequireModule> },
  { path: '/feed', element: staff(<RequireModule keys={['feed']}><FeedPage /></RequireModule>) },
  { path: '/achievements', element: staff(<RequireModule keys={['achievements']}><AchievementsPage /></RequireModule>) },
  { path: '/help', element: <RequireModule keys={['help']}><Lazy><HelpPage /></Lazy></RequireModule> },
  // the teachers' guides centre — the library's guides by section, and the FAQ
  { path: '/qollanmalar', element: staff(<RequireModule keys={['library']}><GuidesPage /></RequireModule>) },
  { path: '/staffroom', element: teacher(<RequireModule keys={['staffroom']}><StaffroomPage /></RequireModule>) },
  { path: '/training', element: staff(<RequireModule keys={['training']}><TrainingPage /></RequireModule>) },
  { path: '/training/:id', element: staff(<RequireModule keys={['training']}><CoursePage /></RequireModule>) },
  { path: '/training/:id/edit', element: <RequireAdmin><RequireModule keys={['training']}><Lazy><CourseEditor /></Lazy></RequireModule></RequireAdmin> },
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
  // a certificate's public check — no sign-in, inside or outside
  { path: '/verify/:code', element: <Lazy><VerifyPage /></Lazy> },
  {
    path: '/change-password',
    element: (
      <RequirePasswordChange>
        <Lazy><ChangePasswordPage /></Lazy>
      </RequirePasswordChange>
    ),
  },
]

/** Children of the guest AuthLayout route. */
export const guestPortalRoutes: RouteObject[] = [{ path: '/join', element: <Lazy><StudentRegisterPage /></Lazy> }]

