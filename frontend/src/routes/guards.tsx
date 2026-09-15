import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'

import { isAdminInView, isApproved, useAuth } from '@/lib/auth/AuthContext'
import { useUIStore } from '@/store/uiStore'

function FullScreenSpinner() {
  return (
    <div style={{ display: 'flex', minHeight: '100dvh', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="skeleton" style={{ width: 120 }} />
    </div>
  )
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <FullScreenSpinner />
  if (!user) return <Navigate to="/login" replace />
  return children
}

export function RequireApproved({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  if (!isApproved(user)) return <Navigate to="/pending-approval" replace />
  return children
}

export function RequireNotApproved({ children }: { children: ReactNode }) {
  // Already-approved users shouldn't get stuck on the pending screen.
  const { user } = useAuth()
  if (isApproved(user)) return <Navigate to="/" replace />
  return children
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const viewMode = useUIStore((s) => s.viewMode)
  if (!isAdminInView(user, viewMode)) return <Navigate to="/" replace />
  return children
}

export function RequireGuest({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <FullScreenSpinner />
  if (user) return <Navigate to="/" replace />
  return children
}
