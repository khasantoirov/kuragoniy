import { lazy, Suspense } from 'react'
import { createBrowserRouter } from 'react-router-dom'

import { Skeleton } from '@/components/Skeleton'
import { AboutPage } from '@/features/about/AboutPage'
import { AdminPage } from '@/features/admin/AdminPage'
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage'
import { LoginPage } from '@/features/auth/LoginPage'
import { PendingApprovalPage } from '@/features/auth/PendingApprovalPage'
import { RegisterPage } from '@/features/auth/RegisterPage'
import { NotificationsPage } from '@/features/announcements/NotificationsPage'
import { HomePage } from '@/features/home/HomePage'
import { JournalPage } from '@/features/journal/JournalPage'
import { LessonDetail } from '@/features/lessons/LessonDetail'
import { LessonsPage } from '@/features/lessons/LessonsPage'
import { LessonPosterPage } from '@/features/admin/LessonPosterPage'
import { LibraryPage } from '@/features/library/LibraryPage'
import { ProfilePage } from '@/features/profile/ProfilePage'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { TimetablePage } from '@/features/timetable/TimetablePage'
import { AppShell } from '@/layouts/AppShell'
import { AuthLayout } from '@/layouts/AuthLayout'

import { RequireAdmin, RequireApproved, RequireAuth, RequireGuest, RequireNotApproved } from './guards'

// Lazy-loaded: sims.ts alone is ~4700 lines of ported physics code for
// 111 simulations — keeping it out of the main bundle means users who
// never open the Lab never download it.
const LabPage = lazy(() => import('@/features/lab/LabPage').then((m) => ({ default: m.LabPage })))
const LabSimDetail = lazy(() => import('@/features/lab/LabSimDetail').then((m) => ({ default: m.LabSimDetail })))

function LabFallback() {
  return <Skeleton lines={4} />
}

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
      { path: '/', element: <HomePage /> },
      { path: '/lessons', element: <LessonsPage /> },
      { path: '/lessons/:id', element: <LessonDetail /> },
      { path: '/journal', element: <JournalPage /> },
      { path: '/timetable', element: <TimetablePage /> },
      { path: '/library', element: <LibraryPage /> },
      {
        path: '/lab',
        element: (
          <Suspense fallback={<LabFallback />}>
            <LabPage />
          </Suspense>
        ),
      },
      {
        path: '/lab/:simId',
        element: (
          <Suspense fallback={<LabFallback />}>
            <LabSimDetail />
          </Suspense>
        ),
      },
      {
        path: '/admin',
        element: (
          <RequireAdmin>
            <AdminPage />
          </RequireAdmin>
        ),
      },
      {
        path: '/poster',
        element: (
          <RequireAdmin>
            <LessonPosterPage />
          </RequireAdmin>
        ),
      },
      { path: '/about', element: <AboutPage /> },
      { path: '/profile', element: <ProfilePage /> },
      { path: '/settings', element: <SettingsPage /> },
      { path: '/notifications', element: <NotificationsPage /> },
    ],
  },
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
    ],
  },
])
