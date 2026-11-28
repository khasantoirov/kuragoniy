import { lazy, Suspense, useEffect, type ComponentType, type ReactNode } from 'react'
import { Navigate, useSearchParams, type RouteObject } from 'react-router-dom'

import { Skeleton } from '@/components/Skeleton'
import { LoginPage } from '@/features/auth/LoginPage'
import { SettingsTabs } from '@/features/settings/SettingsTabs'
import { AuthLayout } from '@/layouts/AuthLayout'
import { panelUrl } from '@/lib/adminHost'
import { mayUseAdminPanel, useAuth } from '@/lib/auth/AuthContext'
import { goToPanel } from '@/lib/panelTicket'

import { FullScreenSpinner, RequireAdmin, RequireFan, RequireGuest, RequireModule, RequireOversight, RequirePasswordChange, RequireShop } from './guards'
import { EquipmentTabs, LessonsTabs, ReportsTabs, ShopTabs } from './portalRoutes'

/* admin.kuragoniy.uz: the sign-in and the Boshqaruv paneli — its own
   sections and the platform's administration pages inside it (owner,
   2026-11-26: "to'liq ajratish"; lib/adminHost.ts). No teaching pages. */

function named<T extends string>(load: () => Promise<Record<T, ComponentType>>, name: T) {
  return lazy(() => load().then((m) => ({ default: m[name] })))
}

const AdminConsole = named(() => import('@/features/console/AdminConsole'), 'AdminConsole')
const NotForPanel = named(() => import('@/features/console/AdminConsole'), 'NotForPanel')
const ForgotPasswordPage = named(() => import('@/features/auth/ForgotPasswordPage'), 'ForgotPasswordPage')
const ChangePasswordPage = named(() => import('@/features/auth/ChangePasswordPage'), 'ChangePasswordPage')

const StatsHub = named(() => import('@/features/schools/StatsHub'), 'StatsHub')
const TimetablePage = named(() => import('@/features/timetable/TimetablePage'), 'TimetablePage')
const PartnerSchoolsPage = named(() => import('@/features/schools/PartnerSchoolsPage'), 'PartnerSchoolsPage')
const SchoolDetailPage = named(() => import('@/features/schools/SchoolDetailPage'), 'SchoolDetailPage')
const EquipmentSheetPage = named(() => import('@/features/admin/EquipmentSheetPage'), 'EquipmentSheetPage')
const SubscriptionsPage = named(() => import('@/features/subscriptions/SubscriptionsPage'), 'SubscriptionsPage')
const LessonDetail = named(() => import('@/features/lessons/LessonDetail'), 'LessonDetail')
const KitPage = named(() => import('@/features/kits/KitPage'), 'KitPage')
const LibraryPage = named(() => import('@/features/library/LibraryPage'), 'LibraryPage')
const BookReaderPage = named(() => import('@/features/library/reader/BookReaderPage'), 'BookReaderPage')
const GuidesPage = named(() => import('@/features/guides/GuidesPage'), 'GuidesPage')
const TrainingPage = named(() => import('@/features/training/TrainingPage'), 'TrainingPage')
const CoursePage = named(() => import('@/features/training/CoursePage'), 'CoursePage')
const CourseEditor = named(() => import('@/features/training/CourseEditor'), 'CourseEditor')
const GuidePage = named(() => import('@/features/guide/GuidePage'), 'GuidePage')
const HelpPage = named(() => import('@/features/help/HelpPage'), 'HelpPage')
const GuestRequestsPage = named(() => import('@/features/staffroom/StaffroomPage'), 'GuestRequestsPage')
const FeedPage = named(() => import('@/features/feed/FeedPage'), 'FeedPage')
const AchievementsPage = named(() => import('@/features/achievements/AchievementsPage'), 'AchievementsPage')
const InboxPage = named(() => import('@/features/notifications/InboxPage'), 'InboxPage')
const ProfilePage = named(() => import('@/features/settings/ProfilePage'), 'ProfilePage')
const AppearancePage = named(() => import('@/features/settings/AppearancePage'), 'AppearancePage')
const NotificationSettingsPage = named(() => import('@/features/settings/NotificationSettingsPage'), 'NotificationSettingsPage')
const IntegrationsPage = named(() => import('@/features/settings/IntegrationsPage'), 'IntegrationsPage')

function RequirePanel({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <FullScreenSpinner />
  if (!user) return <Navigate to="/login" replace />
  if (user.must_change_password) return <Navigate to="/change-password" replace />
  if (!mayUseAdminPanel(user)) return <Suspense fallback={<FullScreenSpinner />}><NotForPanel /></Suspense>
  return children
}

const page = (el: ReactNode) => <Suspense fallback={<Skeleton lines={5} />}>{el}</Suspense>
const mod = (keys: Parameters<typeof RequireModule>[0]['keys'], el: ReactNode) => <RequireModule keys={keys}>{page(el)}</RequireModule>
const settings = (el: ReactNode) => page(<><SettingsTabs />{el}</>)

/** The platform's administration pages, shown inside the console. */
const panelPages: RouteObject[] = [
  { path: '/statistics', element: <RequireOversight>{page(<StatsHub />)}</RequireOversight> },
  { path: '/timetable', element: mod(['timetable'], <TimetablePage />) },
  { path: '/manage/schools', element: page(<PartnerSchoolsPage />) },
  { path: '/manage/schools/:id', element: page(<SchoolDetailPage />) },
  { path: '/manage/equipment', element: <RequireFan fan="fizika">{mod(['equipment'], <EquipmentTabs />)}</RequireFan> },
  { path: '/equipment-sheet', element: <RequireAdmin>{mod(['equipment'], <EquipmentSheetPage />)}</RequireAdmin> },
  { path: '/reports', element: mod(['reports'], <ReportsTabs />) },
  { path: '/obuna', element: <RequireShop>{page(<SubscriptionsPage />)}</RequireShop> },
  { path: '/shop', element: <RequireShop>{mod(['shop'], <ShopTabs />)}</RequireShop> },
  { path: '/lessons', element: page(<LessonsTabs />) },
  { path: '/lessons/:id', element: page(<LessonDetail />) },
  { path: '/kits/:id', element: mod(['kits'], <KitPage />) },
  { path: '/library', element: mod(['library'], <LibraryPage />) },
  { path: '/library/:id/read', element: mod(['library'], <BookReaderPage />) },
  { path: '/qollanmalar', element: mod(['library'], <GuidesPage />) },
  { path: '/training', element: mod(['training'], <TrainingPage />) },
  { path: '/training/:id', element: mod(['training'], <CoursePage />) },
  { path: '/training/:id/edit', element: <RequireAdmin>{mod(['training'], <CourseEditor />)}</RequireAdmin> },
  { path: '/guide', element: <RequireAdmin>{page(<GuidePage />)}</RequireAdmin> },
  { path: '/help', element: mod(['help'], <HelpPage />) },
  { path: '/mehmon', element: mod(['staffroom'], <GuestRequestsPage />) },
  { path: '/feed', element: mod(['feed'], <FeedPage />) },
  { path: '/achievements', element: mod(['achievements'], <AchievementsPage />) },
  { path: '/notifications', element: page(<InboxPage />) },
  { path: '/settings', element: <Navigate to="/settings/profile" replace /> },
  { path: '/settings/profile', element: settings(<ProfilePage />) },
  { path: '/settings/appearance', element: settings(<AppearancePage />) },
  { path: '/settings/notifications', element: settings(<NotificationSettingsPage />) },
  { path: '/settings/integrations', element: settings(<IntegrationsPage />) },
  // the teaching pages' old addresses lead to the panel's own
  { path: '/staffroom', element: <Navigate to="/mehmon" replace /> },
  { path: '/admin', element: <Navigate to="/" replace /> },
]

export const adminRoutes: RouteObject[] = [
  {
    element: <RequireGuest><AuthLayout /></RequireGuest>,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/forgot-password', element: page(<ForgotPasswordPage />) },
    ],
  },
  {
    path: '/change-password',
    element: <RequirePasswordChange><Suspense fallback={<FullScreenSpinner />}><ChangePasswordPage /></Suspense></RequirePasswordChange>,
  },
  {
    element: <RequirePanel><Suspense fallback={<FullScreenSpinner />}><AdminConsole /></Suspense></RequirePanel>,
    children: [
      // the console sends an unknown or empty section to the first one
      { path: '/', element: <Navigate to="/monitoring" replace /> },
      { path: '/:bolim', element: null },
      ...panelPages,
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]

/** kuragoniy.uz/admin (the old Boshqaruv, its bookmarks and notification
 *  links): over to the panel, on the same section. */
export function GoToPanel() {
  const { user } = useAuth()
  const [params] = useSearchParams()
  const bolim = params.get('bolim')
  const allowed = mayUseAdminPanel(user)
  useEffect(() => {
    if (allowed) void goToPanel(panelUrl(bolim))  // signed in there too
  }, [allowed, bolim])
  if (!allowed) return <Navigate to="/" replace />
  return <FullScreenSpinner />
}
