import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'

import { Skeleton } from '@/components/Skeleton'

import { AboutPage } from '@/features/about/AboutPage'
import { AdminPage } from '@/features/admin/AdminPage'
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage'
import { LoginPage } from '@/features/auth/LoginPage'
import { PendingApprovalPage } from '@/features/auth/PendingApprovalPage'
import { RegisterPage } from '@/features/auth/RegisterPage'
import { JournalPage } from '@/features/journal/JournalPage'
import { LessonDetail } from '@/features/lessons/LessonDetail'
import { LessonsPage } from '@/features/lessons/LessonsPage'
import { EquipmentSheetPage } from '@/features/admin/EquipmentSheetPage'
import { LibraryPage } from '@/features/library/LibraryPage'
import { StatisticsPage } from '@/features/statistics/StatisticsPage'
import { TimetablePage } from '@/features/timetable/TimetablePage'
import { AppShell } from '@/layouts/AppShell'
import { AuthLayout } from '@/layouts/AuthLayout'

import { RequireAdmin, RequireApproved, RequireAuth, RequireGuest, RequireNotApproved } from './guards'
import { guestPortalRoutes, StaffHome, staffPortalRoutes, topLevelPortalRoutes } from './portalRoutes'

// Sozlamalar and the inbox: their own chunks (QR codes, sound synth, charts
// of sessions) — opened now and then, so kept out of the main bundle.
const ProfilePage = lazy(() => import('@/features/settings/ProfilePage').then((m) => ({ default: m.ProfilePage })))
const AppearancePage = lazy(() => import('@/features/settings/AppearancePage').then((m) => ({ default: m.AppearancePage })))
const NotificationSettingsPage = lazy(() => import('@/features/settings/NotificationSettingsPage').then((m) => ({ default: m.NotificationSettingsPage })))
const IntegrationsPage = lazy(() => import('@/features/settings/IntegrationsPage').then((m) => ({ default: m.IntegrationsPage })))
const InboxPage = lazy(() => import('@/features/notifications/InboxPage').then((m) => ({ default: m.InboxPage })))

const page = (el: React.ReactNode) => <Suspense fallback={<Skeleton lines={5} />}>{el}</Suspense>

export const router = createBrowserRouter([
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
      { path: '/lessons', element: <LessonsPage /> },
      { path: '/lessons/:id', element: <LessonDetail /> },
      { path: '/journal', element: <JournalPage /> },
      { path: '/timetable', element: <TimetablePage /> },
      { path: '/library', element: <LibraryPage /> },
      { path: '/statistics', element: <StatisticsPage /> },
      {
        path: '/admin',
        element: (
          <RequireAdmin>
            <AdminPage />
          </RequireAdmin>
        ),
      },
      {
        path: '/equipment-sheet',
        element: (
          <RequireAdmin>
            <EquipmentSheetPage />
          </RequireAdmin>
        ),
      },
      { path: '/about', element: <AboutPage /> },
      // Eski xatcho'plar va havolalar uzilib qolmasin — profil endi
      // Sozlamalar ichida.
      { path: '/profile', element: <Navigate to="/settings/profile" replace /> },
      { path: '/settings', element: <Navigate to="/settings/profile" replace /> },
      { path: '/settings/profile', element: page(<ProfilePage />) },
      { path: '/settings/appearance', element: page(<AppearancePage />) },
      { path: '/settings/notifications', element: page(<NotificationSettingsPage />) },
      { path: '/settings/integrations', element: page(<IntegrationsPage />) },
      { path: '/notifications', element: page(<InboxPage />) },
      ...staffPortalRoutes,
    ],
  },
  ...topLevelPortalRoutes,
  {
    path: '/pending-approval',
    element: (
      <RequireAuth>
        <RequireNotApproved>
          <PendingApprovalPage />
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
      { path: '/register', element: <RegisterPage /> },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
      ...guestPortalRoutes,
    ],
  },
])
