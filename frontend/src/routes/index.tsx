import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom'

import { Skeleton } from '@/components/Skeleton'

import { LoginPage } from '@/features/auth/LoginPage'
import { SettingsTabs } from '@/features/settings/SettingsTabs'
import { AppShell } from '@/layouts/AppShell'
import { AuthLayout } from '@/layouts/AuthLayout'
import { IS_ADMIN_HOST, PANEL_ENABLED } from '@/lib/adminHost'

import { RequireAdmin, RequireApproved, RequireAuth, RequireFan, RequireGuest, RequireModule, RequireNotApproved } from './guards'
import { adminRoutes, GoToPanel } from './adminRoutes'
import { AdminTabsLegacy } from './legacyAdmin'
import { guestPortalRoutes, JournalTabs, LessonsTabs, StaffHome, staffPortalRoutes, topLevelPortalRoutes } from './portalRoutes'

// Sozlamalar and the inbox: their own chunks (QR codes, sound synth, charts
// of sessions) — opened now and then, so kept out of the main bundle.
// Only the sign-in page and the shell come with the first download; every
// page is its own chunk (the everyday ones are warmed up by routes/prefetch.ts).
const AboutPage = lazy(() => import('@/features/about/AboutPage').then((m) => ({ default: m.AboutPage })))
const ForgotPasswordPage = lazy(() => import('@/features/auth/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })))
const PendingApprovalPage = lazy(() => import('@/features/auth/PendingApprovalPage').then((m) => ({ default: m.PendingApprovalPage })))
const LessonDetail = lazy(() => import('@/features/lessons/LessonDetail').then((m) => ({ default: m.LessonDetail })))
const EquipmentSheetPage = lazy(() => import('@/features/admin/EquipmentSheetPage').then((m) => ({ default: m.EquipmentSheetPage })))
const LibraryPage = lazy(() => import('@/features/library/LibraryPage').then((m) => ({ default: m.LibraryPage })))
const TimetablePage = lazy(() => import('@/features/timetable/TimetablePage').then((m) => ({ default: m.TimetablePage })))
const ProfilePage = lazy(() => import('@/features/settings/ProfilePage').then((m) => ({ default: m.ProfilePage })))
const AppearancePage = lazy(() => import('@/features/settings/AppearancePage').then((m) => ({ default: m.AppearancePage })))
const NotificationSettingsPage = lazy(() => import('@/features/settings/NotificationSettingsPage').then((m) => ({ default: m.NotificationSettingsPage })))
const IntegrationsPage = lazy(() => import('@/features/settings/IntegrationsPage').then((m) => ({ default: m.IntegrationsPage })))
const InboxPage = lazy(() => import('@/features/notifications/InboxPage').then((m) => ({ default: m.InboxPage })))
// pdf.js comes with it — only loaded when a book is opened.
const DayPage = lazy(() => import('@/features/journal/DayPage').then((m) => ({ default: m.DayPage })))
const BookReaderPage = lazy(() => import('@/features/library/reader/BookReaderPage').then((m) => ({ default: m.BookReaderPage })))

// the public front page, also for a signed-in administrator checking it
const LandingPage = lazy(() => import('@/features/landing/LandingPage').then((m) => ({ default: m.LandingPage })))
// the virtual lab (from amaliyfizika.uz) — the Fizika window's, its own chunk
// /lab in both windows: the hub, and in Fizika the virtual lab under it
const LabEntry = lazy(() => import('@/features/lab/LabEntry').then((m) => ({ default: m.LabEntry })))
const LabSimDetail = lazy(() => import('@/features/lab/LabSimDetail').then((m) => ({ default: m.LabSimDetail })))
const GuidePage = lazy(() => import('@/features/guide/GuidePage').then((m) => ({ default: m.GuidePage })))
const page = (el: React.ReactNode) => <Suspense fallback={<Skeleton lines={5} />}>{el}</Suspense>
const settings = (el: React.ReactNode) => page(<><SettingsTabs />{el}</>)

/** kuragoniy.uz — the platform. */
const mainRoutes: RouteObject[] = [
  {
    element: (
      <RequireAuth>
        <RequireApproved>
          <AppShell />
        </RequireApproved>
      </RequireAuth>
    ),
    children: [
      { path: '/', element: <StaffHome /> },
      { path: '/lessons', element: page(<LessonsTabs />) },
      { path: '/lessons/:id', element: page(<LessonDetail />) },
      { path: '/journal', element: page(<JournalTabs />) },
      { path: '/journal/:classId/day/:date', element: page(<DayPage />) },
      { path: '/timetable', element: <RequireModule keys={['timetable']}>{page(<TimetablePage />)}</RequireModule> },
      { path: '/library', element: <RequireModule keys={['library']}>{page(<LibraryPage />)}</RequireModule> },
      { path: '/library/:id/read', element: <RequireModule keys={['library']}>{page(<BookReaderPage />)}</RequireModule> },
      { path: '/lab', element: <RequireModule keys={['lab']}>{page(<LabEntry />)}</RequireModule> },
      { path: '/lab/:simId', element: <RequireFan fan="fizika"><RequireModule keys={['lab']}>{page(<LabSimDetail />)}</RequireModule></RequireFan> },
      {
        // Boshqaruv is the panel at admin.kuragoniy.uz (lib/adminHost.ts) —
        // here as tabs until that address has its DNS record and certificate
        path: '/admin',
        // (GoToPanel lets the panel's people through: an Admin, the developer)
        element: PANEL_ENABLED ? <GoToPanel /> : <RequireAdmin>{page(<AdminTabsLegacy />)}</RequireAdmin>,
      },
      {
        path: '/equipment-sheet',
        element: (
          <RequireAdmin>
            <RequireModule keys={['equipment']}>
              {page(<EquipmentSheetPage />)}
            </RequireModule>
          </RequireAdmin>
        ),
      },
      { path: '/about', element: page(<AboutPage />) },
      {
        path: '/guide',
        element: (
          <RequireAdmin>
            {page(<GuidePage />)}
          </RequireAdmin>
        ),
      },
      // Eski xatcho'plar va havolalar uzilib qolmasin — profil endi
      // Sozlamalar ichida.
      { path: '/profile', element: <Navigate to="/settings/profile" replace /> },
      { path: '/settings', element: <Navigate to="/settings/profile" replace /> },
      { path: '/settings/profile', element: settings(<ProfilePage />) },
      { path: '/settings/appearance', element: settings(<AppearancePage />) },
      { path: '/settings/notifications', element: settings(<NotificationSettingsPage />) },
      { path: '/settings/integrations', element: settings(<IntegrationsPage />) },
      { path: '/notifications', element: page(<InboxPage />) },
      ...staffPortalRoutes,
    ],
  },
  ...topLevelPortalRoutes,
  { path: '/sayt', element: page(<LandingPage />) },
  {
    path: '/pending-approval',
    element: (
      <RequireAuth>
        <RequireNotApproved>
          {page(<PendingApprovalPage />)}
        </RequireNotApproved>
      </RequireAuth>
    ),
  },
  {
    element: (
      <RequireGuest>
        <AuthLayout />
      </RequireGuest>
    ),
    children: [
      { path: '/login', element: <LoginPage /> },
      // no self sign-up: staff accounts are made by the administration
      { path: '/register', element: <Navigate to="/login" replace /> },
      { path: '/forgot-password', element: page(<ForgotPasswordPage />) },
      ...guestPortalRoutes,
    ],
  },
]

// admin.kuragoniy.uz is the Boshqaruv paneli only (routes/adminRoutes.tsx)
export const router = createBrowserRouter(IS_ADMIN_HOST ? adminRoutes : mainRoutes)
