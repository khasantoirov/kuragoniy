import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { IS_ADMIN_HOST, PANEL_ENABLED } from '@/lib/adminHost'
import { useViewAs, useViewAsUser } from '@/lib/viewAs'
import { api, refreshAccessToken, SESSION_ENDED_EVENT, setAccessToken } from '@/lib/api/client'
import type { User } from '@/lib/api/types'
import { clearHistory } from '@/lib/history'

import { IDLE_LIMIT_MS, IDLE_WARN_MS, idleMs, markActive } from './idle'

/** Why the app signed the user out — shown once on the login page. */
export const LOGOUT_REASON_KEY = 'af-logout-reason'
const REASONS = ['idle', 'expired', 'revoked', 'not_admin']

function noteReason(code: string) {
  if (!REASONS.includes(code)) return
  try {
    sessionStorage.setItem(LOGOUT_REASON_KEY, code)
  } catch {
    // storage blocked — the login page just won't say why
  }
}

const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'] as const

// renamedLogin: signed in with a login that has since been regenerated —
// the new one, to show the student (the old one still works meanwhile).
type LoginResult = { user: User; renamedLogin?: string }

interface AuthState {
  user: User | null
  loading: boolean
  /** `login` is an email (staff) or a username (student). */
  /** `extra`: the sign-in form's bot-check fields (lib/formGuard.ts). */
  login: (login: string, password: string, remember?: boolean, extra?: Record<string, unknown>) => Promise<LoginResult>
  logout: () => Promise<void>
  refreshMe: () => Promise<User>
  /** Applies the fresh session the change-password endpoint hands back
   * (every other session of the account is revoked by that call). */
  applySession: (access: string, user: User) => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [idleLeft, setIdleLeft] = useState<number | null>(null)

  const refreshMe = useCallback(async () => {
    const res = await api.get<User>('/accounts/me/')
    setUser(res.data)
    return res.data
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

  // The server ended the session on a refresh (24 hours passed, idle, or
  // signed out elsewhere) — drop to the login page, which says why.
  useEffect(() => {
    const onEnded = (e: Event) => {
      noteReason(String((e as CustomEvent<string>).detail ?? ''))
      setAccessToken(null)
      setUser(null)
      setIdleLeft(null)
      clearHistory()
      useViewAsUser.getState().clear()
      useViewAs.getState().stop()
    }
    window.addEventListener(SESSION_ENDED_EVENT, onEnded)
    return () => window.removeEventListener(SESSION_ENDED_EVENT, onEnded)
  }, [])

  // 30 minutes without touching the screen → signed out. The countdown
  // warning shows for the last two minutes; any movement cancels it.
  useEffect(() => {
    if (!userId) return
    markActive(true)
    const onActivity = () => markActive()
    for (const ev of ACTIVITY_EVENTS) window.addEventListener(ev, onActivity, { passive: true, capture: true })
    let ending = false
    const check = () => {
      const idle = idleMs()
      if (idle >= IDLE_LIMIT_MS) {
        if (ending) return
        ending = true
        noteReason('idle')
        void api.post('/auth/logout/').catch(() => {}).finally(() => {
          setAccessToken(null)
          setUser(null)
          setIdleLeft(null)
          clearHistory()
          useViewAsUser.getState().clear()
          useViewAs.getState().stop()
        })
        return
      }
      setIdleLeft(idle >= IDLE_LIMIT_MS - IDLE_WARN_MS ? Math.ceil((IDLE_LIMIT_MS - idle) / 1000) : null)
    }
    const id = setInterval(check, 1000)
    document.addEventListener('visibilitychange', check)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', check)
      for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, onActivity, { capture: true })
    }
  }, [userId])

  const login = useCallback(async (loginName: string, password: string, remember = true, extra: Record<string, unknown> = {}): Promise<LoginResult> => {
    const res = await api.post('/auth/login/', { ...extra, login: loginName, password, remember })
    markActive(true)
    setAccessToken(res.data.access)
    setUser(res.data.user)
    return { user: res.data.user, renamedLogin: res.data.renamed_login }
  }, [])

  const logout = useCallback(async () => {
    await api.post('/auth/logout/').catch(() => {})
    setAccessToken(null)
    setUser(null)
    clearHistory()
    // nobody's view outlives the session
    useViewAsUser.getState().clear()
    useViewAs.getState().stop()
  }, [])

  const applySession = useCallback((access: string, next: User) => {
    markActive(true)
    setAccessToken(access)
    setUser(next)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshMe, applySession }}>
      {children}
      {user && idleLeft !== null && (
        <div className="idlewarn" role="alertdialog" aria-live="assertive">
          <span className="idlewarn__t">{t("Faollik yo'q")}</span>
          <span className="idlewarn__b">
            {t("Xavfsizlik uchun tizimdan chiqasiz:")} <b>{Math.floor(idleLeft / 60)}:{String(idleLeft % 60).padStart(2, '0')}</b>
          </span>
          <button type="button" className="btn btn--primary btn--sm" onClick={() => { markActive(true); setIdleLeft(null) }}>
            {t('Davom etish')}
          </button>
        </div>
      )}
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

/** One account, two addresses (owner, 2026-11-27): an Admin and the
 * developer run the platform at admin.kuragoniy.uz and teach at
 * kuragoniy.uz, with the same login — here they are teachers only. */
const TEACHING_HERE = PANEL_ENABLED && !IS_ADMIN_HOST

/** On kuragoniy.uz an Admin and the developer only teach — like any
 * teacher: their own fan, no administration, no role switch. */
export function teachesHere(user: User | null): boolean {
  // (while the developer looks through someone, the viewed account's role decides)
  return TEACHING_HERE && !!user && (user.is_dev_superuser || user.role === 'admin')
}

/** Mirrors accounts.models.User.is_admin on the backend — Boshliq (a
 * non-teaching head) has the same admin-level oversight as Admin. On
 * kuragoniy.uz an Admin and the developer teach (TEACHING_HERE); the
 * boshliq keeps the oversight there. */
export function isAdmin(user: User | null): boolean {
  if (!user) return false
  if (teachesHere(user)) return false
  return user.is_dev_superuser || user.role === 'admin' || user.role === 'boshliq'
}

export function isStudent(user: User | null): boolean {
  return !!user && user.role === 'student' && !user.is_dev_superuser
}

/** Kuzatuvchi — read-only oversight (inspector/methodist). */
export function isObserver(user: User | null): boolean {
  return !!user && user.role === 'kuzatuvchi' && !user.is_dev_superuser
}

/** A partner school's own ma'muriyat (direktor, zavuch): their school(s)
 *  only, read-only — backend schools/access.py. */
export function isSchoolAdmin(user: User | null): boolean {
  return !!user && user.role === 'maktab' && !user.is_dev_superuser
}

/** May see every teacher's results/analytics (admin roles + Kuzatuvchi). */
export function isOversight(user: User | null): boolean {
  return isAdmin(user) || isObserver(user)
}

/** Runs classes: approved staff that isn't the read-only observer. */
export function isTeacherLike(user: User | null): boolean {
  // admin.kuragoniy.uz is the administration's only: nobody teaches there
  return !IS_ADMIN_HOST && isApproved(user) && !isStudent(user) && !isObserver(user) && !isSchoolAdmin(user)
}

/** Where a freshly logged-in user lands — each role has its own portal. */
export function homePathFor(user: User | null): string {
  if (!user) return '/login'
  if (user.must_change_password) return '/change-password'
  if (isStudent(user)) return user.approved ? '/s' : '/pending-approval'
  if (!isApproved(user)) return '/pending-approval'
  if (isObserver(user)) return '/statistics'
  if (isSchoolAdmin(user)) return '/my-school'
  return '/'
}

/** May use the Boshqaruv paneli at admin.kuragoniy.uz — an Admin or the
 *  developer; not the boshliq (owner's choice, 2026-11-26). Mirrors
 *  backend common/adminhost.may_use_admin_panel. */
export function mayUseAdminPanel(user: User | null): boolean {
  return !!user && (user.is_dev_superuser || user.role === 'admin')
}

/** isAdmin(), but respects the profile "view as teacher" preview toggle
 * (js/auth.js's session.isAdmin getter = isRealAdmin && viewMode !== 'teacher')
 * — an admin previewing the app as a regular teacher sees teacher-only UI. */
export function isAdminInView(user: User | null, viewMode: 'admin' | 'teacher'): boolean {
  return isAdmin(user) && viewMode !== 'teacher'
}
