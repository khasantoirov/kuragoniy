import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { useUIStore } from '@/store/uiStore'

/* Telegram Mini App — the platform opened inside @kuragoniybot (owner,
   2026-11-28): "botda mini app qilaylik … ios rejimidagidek animatsiyalar".
   Telegram opens https://kuragoniy.uz/tg with #tgWebAppData=… in the
   address; then its script (telegram.org/js/telegram-web-app.js) is loaded —
   only in that case, never for the website — and the app follows Telegram:
   its light/dark scheme, its Back button, light haptics on taps, links in
   Telegram's browser. The signed-in account comes from Telegram's initData
   (lib/auth/AuthContext.tsx → /api/auth/telegram/). */

interface TgButton {
  show(): void
  hide(): void
  onClick(cb: () => void): void
  offClick(cb: () => void): void
}
export interface TgWebApp {
  initData: string
  colorScheme: 'light' | 'dark'
  version: string
  ready(): void
  expand(): void
  isVersionAtLeast(v: string): boolean
  disableVerticalSwipes?(): void
  setHeaderColor?(color: string): void
  setBackgroundColor?(color: string): void
  setBottomBarColor?(color: string): void
  onEvent(event: string, cb: () => void): void
  openLink(url: string): void
  BackButton: TgButton
  HapticFeedback?: {
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void
    selectionChanged(): void
    notificationOccurred(type: 'error' | 'success' | 'warning'): void
  }
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp }
  }
}

const FLAG = 'ke-in-telegram'

function detect(): boolean {
  const launched = /[#&]tgWebAppData=/.test(window.location.hash) || window.location.pathname === '/tg'
  try {
    if (launched) sessionStorage.setItem(FLAG, '1')
    return launched || sessionStorage.getItem(FLAG) === '1'
  } catch {
    return launched
  }
}

/** This tab is the mini app inside Telegram. */
export const IN_TELEGRAM = detect()

let loading: Promise<TgWebApp | null> | null = null

/** Telegram's WebApp object (its script is loaded on the first call); null
 *  outside Telegram or if the script can't be had. */
export function telegram(): Promise<TgWebApp | null> {
  if (!IN_TELEGRAM) return Promise.resolve(null)
  if (window.Telegram?.WebApp) return Promise.resolve(window.Telegram.WebApp)
  if (!loading) {
    loading = new Promise((resolve) => {
      const s = document.createElement('script')
      s.src = 'https://telegram.org/js/telegram-web-app.js?59'
      s.async = true
      s.onload = () => resolve(window.Telegram?.WebApp ?? null)
      s.onerror = () => resolve(null)
      document.head.appendChild(s)
      // never hold the app up for long
      window.setTimeout(() => resolve(window.Telegram?.WebApp ?? null), 4000)
    })
  }
  return loading
}

/** The WebApp object once loaded (null before that or outside Telegram). */
export function tgNow(): TgWebApp | null {
  return IN_TELEGRAM ? window.Telegram?.WebApp ?? null : null
}

/** Telegram's signed launch data (empty outside Telegram). */
export function tgInitData(): string {
  return tgNow()?.initData ?? ''
}

function cssColor(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return /^#[0-9a-f]{6}$/i.test(v) ? v : fallback
}

/** Telegram's header and background in the app's own colours. */
function paintChrome(tg: TgWebApp) {
  const surface = cssColor('--surface', tg.colorScheme === 'dark' ? '#1b1e2b' : '#ffffff')
  const paper = cssColor('--paper', tg.colorScheme === 'dark' ? '#14161f' : '#f4f5f7')
  try {
    if (tg.isVersionAtLeast('6.1')) {
      tg.setHeaderColor?.(surface)
      tg.setBackgroundColor?.(paper)
    }
    if (tg.isVersionAtLeast('7.10')) tg.setBottomBarColor?.(surface)
  } catch {
    // an older Telegram keeps its own colours
  }
}

/** Starts the mini app: Telegram is told the app is ready, the app takes
 *  the whole height, follows Telegram's light/dark scheme, and taps get a
 *  light haptic. Called once before the first render (main.tsx). */
export async function startTelegram(): Promise<void> {
  const tg = await telegram()
  if (!tg) return
  document.documentElement.setAttribute('data-tg', '')
  tg.ready()
  tg.expand()
  try {
    if (tg.isVersionAtLeast('7.7')) tg.disableVerticalSwipes?.()  // a long scroll doesn't close the app
  } catch {
    // older Telegram
  }
  const follow = () => {
    useUIStore.getState().setTheme(tg.colorScheme === 'dark' ? 'dark' : 'light')
    requestAnimationFrame(() => paintChrome(tg))
  }
  follow()
  tg.onEvent('themeChanged', follow)

  // haptics: a tab or switch → a selection tick; a button or link → a light tap
  document.addEventListener('click', (e) => {
    const el = (e.target as Element | null)?.closest?.('button, a, [role="tab"], label.check')
    if (!el || (el as HTMLButtonElement).disabled || !tg.HapticFeedback) return
    if (el.matches('.seg__b, [role="tab"], .gx-tabs button, .bottomnav__item, .fanswitch__b, label.check')) {
      tg.HapticFeedback.selectionChanged()
    } else {
      tg.HapticFeedback.impactOccurred('light')
    }
  }, { capture: true, passive: true })

  // a link out of the platform opens in Telegram's browser
  document.addEventListener('click', (e) => {
    const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
    if (!a || e.defaultPrevented) return
    const url = new URL(a.href, window.location.href)
    if (url.origin !== window.location.origin && /^https?:$/.test(url.protocol)) {
      e.preventDefault()
      tg.openLink(url.href)
    }
  })
}

/** Telegram's Back button: shown on every page but the home one; it goes
 *  back like the system gesture. Mounted in the staff and pupil shells. */
export function useTelegramBack(home: string) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  useEffect(() => {
    const tg = tgNow()
    if (!tg) return
    if (pathname === home) {
      tg.BackButton.hide()
      return
    }
    const back = () => navigate(-1)
    tg.BackButton.onClick(back)
    tg.BackButton.show()
    return () => tg.BackButton.offClick(back)
  }, [pathname, home, navigate])
}
