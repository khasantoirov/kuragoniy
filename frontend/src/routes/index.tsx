import { createBrowserRouter } from 'react-router-dom'

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
import { LibraryPage } from '@/features/library/LibraryPage'
import { ProfilePage } from '@/features/profile/ProfilePage'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { StatisticsPage } from '@/features/statistics/StatisticsPage'
import { TimetablePage } from '@/features/timetable/TimetablePage'
import { AppShell } from '@/layouts/AppShell'
import { AuthLayout } from '@/layouts/AuthLayout'

import { RequireApproved, RequireAuth, RequireGuest, RequireNotApproved } from './guards'

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
      { path: '/statistics', element: <StatisticsPage /> },
      { path: '/admin', element: <AdminPage /> },
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
