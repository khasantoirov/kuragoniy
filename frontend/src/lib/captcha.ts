/**
 * reCAPTCHA v3 for the public forms (kirish, ro'yxat, parol tiklash, bosh
 * sahifadagi so'rov). The site key comes from /api/public/landing/; with no
 * key set on the server the check is off and every helper here returns ''.
 *
 * Google's script is loaded only when a form first needs it, and its
 * floating badge is hidden (styles/gate.css) — each protected form carries
 * the required "protected by reCAPTCHA" line instead, so the badge never
 * follows the user into the app after signing in.
 */

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
