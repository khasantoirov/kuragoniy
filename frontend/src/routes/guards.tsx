import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'

import {
  homePathFor,
  isAdmin,
  isAdminInView,
  isApproved,
  isObserver,
  isOversight,
  isSchoolAdmin,
  isStudent,
  isTeacherLike,
  useAuth,
} from '@/lib/auth/AuthContext'
import { useModules, type ModuleKey } from '@/lib/modules'
import { useSubjects } from '@/lib/subjects'
import type { Subject } from '@/features/lessons/labels'
import { useViewAs } from '@/lib/viewAs'
import { useUIStore } from '@/store/uiStore'

// kuragoniy.uz for a guest — its own chunk, never loaded once signed in
const LandingPage = lazy(() => import('@/features/landing/LandingPage').then((m) => ({ default: m.LandingPage })))

export function FullScreenSpinner() {
  return (
    <div style={{ display: 'flex', minHeight: '100dvh', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="skeleton" style={{ width: 120 }} />
    </div>
  )
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const { pathname } = useLocation()
  if (loading) return <FullScreenSpinner />
  // the site's front page for a guest; every other page asks to sign in
  if (!user && pathname === '/') return <Suspense fallback={<FullScreenSpinner />}><LandingPage /></Suspense>
  if (!user) return <Navigate to="/login" replace />
  // A teacher/admin-generated password must be replaced before anything
  // else — the backend refuses every other call until it is.
  if (user.must_change_password) return <Navigate to="/change-password" replace />
  return children
}

/** Staff portal (teachers, admins, Kuzatuvchi). Students are sent to
 * their own portal instead. */
export function RequireApproved({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  if (isStudent(user)) return <Navigate to={homePathFor(user)} replace />
  if (!isApproved(user)) return <Navigate to="/pending-approval" replace />
  return children
}

export function RequireStudent({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const viewing = useViewAs((s) => s.pupil)
  // an administrator looking at the portal as one pupil (Ko'rish rejimi);
  // without one picked, the place to pick one
  if (isAdmin(user) && !isStudent(user)) return viewing ? children : <Navigate to="/settings/appearance" replace />
  if (!isStudent(user)) return <Navigate to={homePathFor(user)} replace />
  if (!user?.approved) return <Navigate to="/pending-approval" replace />
  return children
}

export function RequireNotApproved({ children }: { children: ReactNode }) {
  // Already-approved users shouldn't get stuck on the pending screen.
  const { user } = useAuth()
  if (isApproved(user)) return <Navigate to={homePathFor(user)} replace />
  return children
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const viewMode = useUIStore((s) => s.viewMode)
  if (!isAdminInView(user, viewMode)) return <Navigate to="/" replace />
  return children
}

/** Administration screens (admin, boshliq, dev, Kuzatuvchi). */
export function RequireOversight({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const viewMode = useUIStore((s) => s.viewMode)
  // An admin previewing the app "as a teacher" doesn't see these either.
  const allowed = isObserver(user) || (isOversight(user) && viewMode !== 'teacher')
  if (!allowed) return <Navigate to="/" replace />
  return children
}

/** STEM do'kon and Obunalar: teachers, a school's ma'muriyat and the
 *  administration (the Kuzatuvchi looks, read-only). */
export function RequireShop({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  if (!(isTeacherLike(user) || isSchoolAdmin(user) || isOversight(user))) return <Navigate to={homePathFor(user)} replace />
  return children
}

/** Teacher tools — everyone on staff except the read-only Kuzatuvchi. */
export function RequireTeacher({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  if (!isTeacherLike(user)) return <Navigate to={homePathFor(user)} replace />
  return children
}

/** Teachers and the administration, the read-only Kuzatuvchi included. */
export function RequireStaff({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  if (!isTeacherLike(user) && !isObserver(user)) return <Navigate to={homePathFor(user)} replace />
  return children
}

/** A page of one fan window only (the Laboratoriya is Fizika's) — from
 *  the other window it leads home. */
export function RequireFan({ fan, children }: { fan: Subject; children: ReactNode }) {
  const { current } = useSubjects()
  if (current !== fan) return <Navigate to="/" replace />
  return children
}

/** A section the administration switched off (Modullar) leads home. */
export function RequireModule({ keys, children }: { keys: ModuleKey[]; children: ReactNode }) {
  const { user } = useAuth()
  const { on } = useModules()
  if (!keys.some(on)) return <Navigate to={homePathFor(user)} replace />
  return children
}

export function RequireGuest({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <FullScreenSpinner />
  if (user) return <Navigate to={homePathFor(user)} replace />
  return children
}

/** Only for /change-password: logged in, password change pending. */
export function RequirePasswordChange({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <FullScreenSpinner />
  if (!user) return <Navigate to="/login" replace />
  if (!user.must_change_password) return <Navigate to={homePathFor(user)} replace />
  return children
}

/** A school's page: the administration, or that school's own ma'muriyat
 *  (the backend keeps them to their own school). */
export function RequireSchoolView({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const viewMode = useUIStore((s) => s.viewMode)
  const allowed = isSchoolAdmin(user) || isObserver(user) || (isOversight(user) && viewMode !== 'teacher')
  if (!allowed) return <Navigate to="/" replace />
  return children
}
