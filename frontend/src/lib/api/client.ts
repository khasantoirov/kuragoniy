import axios, { isAxiosError, type AxiosError, type InternalAxiosRequestConfig } from 'axios'

import { idleMs } from '@/lib/auth/idle'
import { deviceHeader, deviceReady } from '@/lib/device'

/**
 * Access token is kept in memory only (not localStorage) — the refresh
 * token lives in an httpOnly cookie set by the backend (see
 * backend/accounts/views.py), so a page reload re-derives a fresh access
 * token from /api/auth/refresh/ rather than ever persisting it client-side.
 */
let accessToken: string | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function getAccessToken() {
  return accessToken
}

/** Fired when the server ends the session on a refresh — detail is its
 * reason code ('expired' after 24 hours, 'idle' after 30 minutes untouched,
 * 'revoked' when signed out elsewhere). AuthContext signs the app out. */
export const SESSION_ENDED_EVENT = 'af:session-ended'

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true, // send the httpOnly refresh cookie on refresh calls
})

api.interceptors.request.use(async (config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }
  // Sign-in and refresh carry the device details for the sessions list;
  // the hints resolve in milliseconds, but never hold a request for long.
  if (config.url?.includes('/auth/') || config.url?.includes('change-password')) {
    await Promise.race([deviceReady, new Promise((r) => setTimeout(r, 300))])
    const device = deviceHeader()
    if (device) config.headers['X-Device'] = device
  }
  return config
})

let refreshPromise: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = api
      .post('/auth/refresh/', { idle: Math.round(idleMs() / 1000) })
      .then((res) => {
        const token = res.data.access as string
        setAccessToken(token)
        return token
      })
      .catch((err: unknown) => {
        setAccessToken(null)
        if (isAxiosError(err) && err.response?.status === 401) {
          const code = (err.response.data as { code?: string } | undefined)?.code ?? ''
          window.dispatchEvent(new CustomEvent(SESSION_ENDED_EVENT, { detail: code }))
        }
        return null
      })
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retried?: boolean }
    if (error.response?.status === 401 && original && !original._retried && !original.url?.includes('/auth/')) {
      original._retried = true
      const token = await refreshAccessToken()
      if (token) {
        original.headers.Authorization = `Bearer ${token}`
        return api(original)
      }
    }
    return Promise.reject(error)
  },
)

export { refreshAccessToken }
