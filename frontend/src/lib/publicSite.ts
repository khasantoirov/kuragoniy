import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'

import { api } from '@/lib/api/client'
import { captchaToken, preloadCaptcha } from '@/lib/captcha'

/** GET /api/public/landing/ — the landing page's content, and the two
 * public settings the sign-in screens need (reCAPTCHA key, bot name).
 * Shared by the landing page and AuthLayout, so it is fetched once. */
export interface LandingData {
  contacts: {
    phone: string
    email: string
    address: string
    telegram: string
    instagram: string
    youtube: string
    facebook: string
    video_url: string
  }
  stats: { schools: number; teachers: number; pupils: number; lessons: number }
  photos: { id: number; image: string | null; caption: string }[]
  testimonials: { id: number; name: string; subtitle: string; text: string; photo: string | null; video_url: string }[]
  mentors: { id: number; name: string; title: string; bio: string; photo: string | null }[]
  partners: string[]
  recaptcha_site_key: string
  bot_username: string
}

export function useLanding() {
  return useQuery({
    queryKey: ['public', 'landing'],
    queryFn: async () => (await api.get<LandingData>('/public/landing/')).data,
    staleTime: 60_000,
    retry: 1,
  })
}

/** For a protected form: preloads Google's script once the key is known
 * and hands back `token(action)` for the submit. */
export function useCaptcha() {
  const { data } = useLanding()
  const key = data?.recaptcha_site_key || ''
  useEffect(() => preloadCaptcha(key), [key])
  return {
    enabled: !!key,
    token: (action: string) => captchaToken(key, action),
  }
}

/** A handle (@name or a t.me link) as a Telegram URL. */
export function telegramUrl(v: string | null | undefined): string {
  const s = (v || '').trim()
  if (!s) return ''
  if (/^https?:\/\//i.test(s)) return s
  return `https://t.me/${s.replace(/^@/, '')}`
}

/** A handle or a URL, for Instagram / YouTube / Facebook. */
export function socialUrl(v: string | null | undefined, base: string): string {
  const s = (v || '').trim()
  if (!s) return ''
  if (/^https?:\/\//i.test(s)) return s
  return `${base}${s.replace(/^@/, '')}`
}
