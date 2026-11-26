import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import { Navigate, useSearchParams, type RouteObject } from 'react-router-dom'

import { Skeleton } from '@/components/Skeleton'
import { LoginPage } from '@/features/auth/LoginPage'
import { AuthLayout } from '@/layouts/AuthLayout'
import { panelUrl } from '@/lib/adminHost'
import { mayUseAdminPanel, useAuth } from '@/lib/auth/AuthContext'

import { FullScreenSpinner, RequireGuest, RequirePasswordChange } from './guards'

/* admin.kuragoniy.uz: the sign-in and the Boshqaruv paneli, nothing else
   (lib/adminHost.ts). The console is its own chunk. */

const AdminConsole = lazy(() => import('@/features/console/AdminConsole').then((m) => ({ default: m.AdminConsole })))
const NotForPanel = lazy(() => import('@/features/console/AdminConsole').then((m) => ({ default: m.NotForPanel })))
const ForgotPasswordPage = lazy(() => import('@/features/auth/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })))
const ChangePasswordPage = lazy(() => import('@/features/auth/ChangePasswordPage').then((m) => ({ default: m.ChangePasswordPage })))

function RequirePanel({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <FullScreenSpinner />
  if (!user) return <Navigate to="/login" replace />
  if (user.must_change_password) return <Navigate to="/change-password" replace />
  if (!mayUseAdminPanel(user)) return <Suspense fallback={<FullScreenSpinner />}><NotForPanel /></Suspense>
  return children
}

const console = <RequirePanel><Suspense fallback={<FullScreenSpinner />}><AdminConsole /></Suspense></RequirePanel>

export const adminRoutes: RouteObject[] = [
  {
    element: <RequireGuest><AuthLayout /></RequireGuest>,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/forgot-password', element: <Suspense fallback={<Skeleton lines={5} />}><ForgotPasswordPage /></Suspense> },
    ],
  },
  {
    path: '/change-password',
    element: <RequirePasswordChange><Suspense fallback={<FullScreenSpinner />}><ChangePasswordPage /></Suspense></RequirePasswordChange>,
  },
  // the console sends an unknown or empty section to the first one
  { path: '/', element: console },
  { path: '/:bolim', element: console },
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
    if (allowed) window.location.replace(panelUrl(bolim))
  }, [allowed, bolim])
  if (!allowed) return <Navigate to="/" replace />
  return <FullScreenSpinner />
}
