import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

import { api, refreshAccessToken, setAccessToken } from '@/lib/api/client'
import type { User } from '@/lib/api/types'
import { clearHistory } from '@/lib/history'

// renamedLogin: signed in with a login that has since been regenerated —
// the new one, to show the student (the old one still works meanwhile).
type LoginResult = { totpRequired: false; user: User; renamedLogin?: string } | { totpRequired: true; challenge: string }

interface AuthState {
  user: User | null
  loading: boolean
  /** `login` is an email (staff) or a username (student). */
  login: (login: string, password: string, remember?: boolean) => Promise<LoginResult>
  verifyTotp: (challenge: string, code: string) => Promise<User>
  register: (email: string, name: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refreshMe: () => Promise<void>
  /** Applies the fresh session the change-password endpoint hands back
   * (every other session of the account is revoked by that call). */
  applySession: (access: string, user: User) => void
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

  // Presence heartbeat (backend common/presence.py): while a tab is open
  // and visible, tell the server once a minute that this user is here —
  // that's what makes "onlayn" / "oxirgi marta HH:MM" accurate even when
  // someone is just watching a video without clicking anything.
  const userId = user?.id
  useEffect(() => {
    if (!userId) return
    const beat = () => {
      if (document.visibilityState === 'visible') api.post('/accounts/me/heartbeat/').catch(() => {})
    }
    const id = setInterval(beat, 60_000)
    document.addEventListener('visibilitychange', beat)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', beat)
    }
  }, [userId])

  const login = useCallback(async (loginName: string, password: string, remember = true): Promise<LoginResult> => {
    const res = await api.post('/auth/login/', { login: loginName, password, remember })
    if (res.data.totp_required) return { totpRequired: true, challenge: res.data.challenge }
    setAccessToken(res.data.access)
    setUser(res.data.user)
    return { totpRequired: false, user: res.data.user, renamedLogin: res.data.renamed_login }
  }, [])

  const verifyTotp = useCallback(async (challenge: string, code: string) => {
    const res = await api.post('/auth/2fa/verify/', { challenge, code })
    setAccessToken(res.data.access)
    setUser(res.data.user)
    return res.data.user as User
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

  const applySession = useCallback((access: string, next: User) => {
    setAccessToken(access)
    setUser(next)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, verifyTotp, register, logout, refreshMe, applySession }}>
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

export function isStudent(user: User | null): boolean {
  return !!user && user.role === 'student' && !user.is_dev_superuser
}

/** Kuzatuvchi — read-only oversight (inspector/methodist). */
export function isObserver(user: User | null): boolean {
  return !!user && user.role === 'kuzatuvchi' && !user.is_dev_superuser
}

/** May see every teacher's results/analytics (admin roles + Kuzatuvchi). */
export function isOversight(user: User | null): boolean {
  return isAdmin(user) || isObserver(user)
}

/** Runs classes: approved staff that isn't the read-only observer. */
export function isTeacherLike(user: User | null): boolean {
  return isApproved(user) && !isStudent(user) && !isObserver(user)
}

/** Where a freshly logged-in user lands — each role has its own portal. */
export function homePathFor(user: User | null): string {
  if (!user) return '/login'
  if (user.must_change_password) return '/change-password'
  if (isStudent(user)) return user.approved ? '/s' : '/pending-approval'
  if (!isApproved(user)) return '/pending-approval'
  if (isObserver(user)) return '/manage'
  return '/'
}

/** isAdmin(), but respects the profile "view as teacher" preview toggle
 * (js/auth.js's session.isAdmin getter = isRealAdmin && viewMode !== 'teacher')
 * — an admin previewing the app as a regular teacher sees teacher-only UI. */
export function isAdminInView(user: User | null, viewMode: 'admin' | 'teacher'): boolean {
  return isAdmin(user) && viewMode !== 'teacher'
}
