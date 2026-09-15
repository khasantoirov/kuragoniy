import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

import { api, refreshAccessToken, setAccessToken } from '@/lib/api/client'
import type { User } from '@/lib/api/types'
import { clearHistory } from '@/lib/history'

type LoginResult = { totpRequired: false } | { totpRequired: true; challenge: string }

interface AuthState {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<LoginResult>
  verifyTotp: (challenge: string, code: string) => Promise<void>
  register: (email: string, name: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refreshMe: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshMe = useCallback(async () => {
    const res = await api.get<User>('/accounts/me/')
    setUser(res.data)
  }, [])

  useEffect(() => {
    // On page load there's no access token in memory yet — silently try
    // the httpOnly refresh cookie before deciding the user is logged out.
    ;(async () => {
      const token = await refreshAccessToken()
      if (token) {
        try {
          await refreshMe()
        } catch {
          setAccessToken(null)
          setUser(null)
        }
      }
      setLoading(false)
    })()
  }, [refreshMe])

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    const res = await api.post('/auth/login/', { email, password })
    if (res.data.totp_required) return { totpRequired: true, challenge: res.data.challenge }
    setAccessToken(res.data.access)
    setUser(res.data.user)
    return { totpRequired: false }
  }, [])

  const verifyTotp = useCallback(async (challenge: string, code: string) => {
    const res = await api.post('/auth/2fa/verify/', { challenge, code })
    setAccessToken(res.data.access)
    setUser(res.data.user)
  }, [])

  const register = useCallback(async (email: string, name: string, password: string) => {
    await api.post('/auth/register/', { email, name, password })
    await login(email, password)
  }, [login])

  const logout = useCallback(async () => {
    await api.post('/auth/logout/').catch(() => {})
    setAccessToken(null)
    setUser(null)
    clearHistory()
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, verifyTotp, register, logout, refreshMe }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

/** Mirrors accounts.models.User.is_approved_effective on the backend. */
export function isApproved(user: User | null): boolean {
  if (!user) return false
  return user.is_dev_superuser || user.approved || user.role === 'admin' || user.role === 'boshliq'
}

/** Mirrors accounts.models.User.is_admin on the backend — Boshliq (a
 * non-teaching head) has the same admin-level oversight as Admin. */
export function isAdmin(user: User | null): boolean {
  if (!user) return false
  return user.is_dev_superuser || user.role === 'admin' || user.role === 'boshliq'
}

/** isAdmin(), but respects the profile "view as teacher" preview toggle
 * (js/auth.js's session.isAdmin getter = isRealAdmin && viewMode !== 'teacher')
 * — an admin previewing the app as a regular teacher sees teacher-only UI. */
export function isAdminInView(user: User | null, viewMode: 'admin' | 'teacher'): boolean {
  return isAdmin(user) && viewMode !== 'teacher'
}
