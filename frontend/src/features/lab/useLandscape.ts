import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

import { lockPageScroll } from '@/lib/scroll'

type LockableOrientation = ScreenOrientation & { lock?: (o: 'landscape') => Promise<void>; unlock?: () => void }

const PORTRAIT_PHONE = '(orientation: portrait) and (max-width: 900px)'
/** A phone turned sideways by hand (a short screen with a finger for a pointer). */
const LANDSCAPE_PHONE = '(orientation: landscape) and (max-height: 560px) and (pointer: coarse)'

function subscribeMedia(cb: () => void) {
  const mq = window.matchMedia(PORTRAIT_PHONE)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

/** A phone held upright — the moment "turn it sideways" is the offer. */
export function usePortraitPhone() {
  return useSyncExternalStore(subscribeMedia, () => window.matchMedia(PORTRAIT_PHONE).matches, () => false)
}

/**
 * Shows a scene filling the screen sideways.
 *
 * - The button: where the browser allows it (Android Chrome) the page goes
 *   full screen and the screen is locked to landscape; everywhere else
 *   (iPhone Safari has neither) the scene is laid over the page and, while
 *   the screen is upright, turned 90° by CSS — the phone only has to be
 *   turned to read it.
 * - Turning the phone by hand (`auto`): the scene fills the screen by
 *   itself, and turning it back returns to the page. Closed with ✕, it
 *   stays closed until the next turn.
 *
 * Closing undoes all of it, and so does leaving full screen with the
 * system Back button.
 */
export function useLandscape({ auto = false }: { auto?: boolean } = {}) {
  const [mode, setMode] = useState<'button' | 'auto' | null>(() =>
    auto && window.matchMedia(LANDSCAPE_PHONE).matches ? 'auto' : null)
  const open = useCallback(() => setMode('button'), [])
  const close = useCallback(() => setMode(null), [])

  useEffect(() => {
    if (!auto) return
    const mq = window.matchMedia(LANDSCAPE_PHONE)
    const onTurn = () => setMode((m) => (mq.matches ? m ?? 'auto' : m === 'auto' ? null : m))
    mq.addEventListener('change', onTurn)
    return () => mq.removeEventListener('change', onTurn)
  }, [auto])

  useEffect(() => {
    if (!mode) return
    const release = lockPageScroll()
    const root = document.documentElement
    const orientation = screen.orientation as LockableOrientation | undefined
    let wentFull = false
    let gone = false

    // Only a tap may ask for full screen (a turn of the phone isn't a user
    // gesture). It is asked of the whole page, not the scene: under
    // body { zoom: 1.1 } a full-screen element would be sized 10% too big,
    // while the scene's own position:fixed; inset:0 always fits.
    if (mode === 'button' && root.requestFullscreen && !document.fullscreenElement) {
      root.requestFullscreen({ navigationUI: 'hide' })
        .then(() => {
          wentFull = true
          if (gone) return document.exitFullscreen()
          return orientation?.lock?.('landscape')
        })
        .catch(() => {
          // No lock (desktop, iPad) — the CSS turn still covers a phone.
        })
    }
    const onFull = () => {
      if (wentFull && !document.fullscreenElement) setMode(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMode(null)
    }
    document.addEventListener('fullscreenchange', onFull)
    window.addEventListener('keydown', onKey)
    return () => {
      gone = true
      document.removeEventListener('fullscreenchange', onFull)
      window.removeEventListener('keydown', onKey)
      try {
        orientation?.unlock?.()
      } catch {
        // never locked
      }
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
      release()
    }
  }, [mode])

  return { on: mode !== null, open, close }
}
