/**
 * reCAPTCHA v3 for the public forms (kirish, ro'yxat, parol tiklash, bosh
 * sahifadagi so'rov). The site key comes from /api/public/landing/; with no
 * key set on the server the check is off and every helper here returns ''.
 *
 * Google's script is loaded only when a form first needs it. Its small
 * corner badge (which Google's terms require to be visible) shows only
 * while a protected form is on screen — useCaptchaBadge below; elsewhere
 * styles/gate.css hides it, so it never follows the user into the app.
 */

import { useEffect } from 'react'

type Grecaptcha = {
  ready(cb: () => void): void
  execute(siteKey: string, opts: { action: string }): Promise<string>
}

declare global {
  interface Window {
    grecaptcha?: Grecaptcha
  }
}

let loading: Promise<void> | null = null

function load(siteKey: string): Promise<void> {
  if (!loading) {
    loading = new Promise<void>((resolve, reject) => {
      const s = document.createElement('script')
      s.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`
      s.async = true
      s.defer = true
      s.onload = () => resolve()
      s.onerror = () => {
        loading = null
        s.remove()
        reject(new Error('recaptcha script failed'))
      }
      document.head.appendChild(s)
    })
  }
  return loading
}

let badgeUsers = 0

/** Shows Google's badge while the calling form is mounted (and the check
 * is on): marks <html> with .captcha-on, counted so two forms can't
 * hide it under each other. */
export function useCaptchaBadge(on: boolean) {
  useEffect(() => {
    if (!on) return
    badgeUsers += 1
    document.documentElement.classList.add('captcha-on')
    return () => {
      badgeUsers -= 1
      if (badgeUsers <= 0) {
        badgeUsers = 0
        document.documentElement.classList.remove('captcha-on')
      }
    }
  }, [on])
}

/** Start loading early (a form came on screen), so the submit isn't slowed. */
export function preloadCaptcha(siteKey: string | null | undefined) {
  if (siteKey) load(siteKey).catch(() => {})
}

/** A fresh token for one submit; '' when the check is off or Google can't
 * be reached (the server then decides — it lets the form through only
 * when the check is off). Never waits more than 8 seconds. */
export async function captchaToken(siteKey: string | null | undefined, action: string): Promise<string> {
  if (!siteKey) return ''
  try {
    await load(siteKey)
    const g = window.grecaptcha
    if (!g) return ''
    await new Promise<void>((r) => g.ready(r))
    return await Promise.race([
      g.execute(siteKey, { action }),
      new Promise<string>((r) => setTimeout(() => r(''), 8000)),
    ])
  } catch {
    return ''
  }
}
