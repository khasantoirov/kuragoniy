import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'

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

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true, // send the httpOnly refresh cookie on refresh calls
})

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }
  return config
})

let refreshPromise: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = api
      .post('/auth/refresh/')
      .then((res) => {
        const token = res.data.access as string
        setAccessToken(token)
        return token
      })
      .catch(() => {
        setAccessToken(null)
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
