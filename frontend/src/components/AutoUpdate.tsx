import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { registerSW } from 'virtual:pwa-register'

import { isUpdateGuarded } from '@/lib/updateGuard'
import { router } from '@/routes'

import { isAnyModalOpen } from './Modal'
import { useToast } from './Toast'

const UPDATED_KEY = 'af-updated'

function isField(el: EventTarget | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
}

function mediaActive() {
  // A YouTube lesson can't be asked whether it's playing, so any embedded
  // player counts as "maybe watching".
  const playing = [...document.querySelectorAll<HTMLMediaElement>('video, audio')].some((m) => !m.paused)
  return playing || !!document.querySelector('iframe')
}

/**
 * New versions install themselves — no "update" dialog to click — but
 * never in the middle of someone's work. Once a new build is ready the
 * page switches over right away if that costs nothing, otherwise at the
 * first moment it does:
 *
 *  - following a link: the destination is simply loaded fresh;
 *  - any other page change (Back, a button that navigates);
 *  - the tab going into the background;
 *  - a re-check every half minute (e.g. once a test has been submitted).
 *
 * …and only if nothing would be lost: no unsaved typing (cleared again by
 * a successful save), no open dialog, no save still in flight, no test or
 * live game in progress (useUpdateGuard), no video playing. Until then the
 * old version keeps working. After the switch the same page and scroll
 * position come back (lib/scroll), test drafts survive in sessionStorage,
 * and a short "updated" toast says what happened.
 */
export function AutoUpdate() {
  const { t } = useTranslation()
  const toast = useToast()
  const queryClient = useQueryClient()

  useEffect(() => {
    try {
      if (sessionStorage.getItem(UPDATED_KEY)) {
        sessionStorage.removeItem(UPDATED_KEY)
        toast(t('Platforma yangilandi'))
      }
    } catch {
      // storage blocked — skip the toast
    }
  }, [t, toast])

  useEffect(() => {
    let ready = false
    let unsaved = false
    let retry: ReturnType<typeof setInterval> | undefined

    const reload = (href?: string) => {
      try {
        sessionStorage.setItem(UPDATED_KEY, '1')
      } catch {
        // no toast then — the update itself still happens
      }
      if (href) window.location.assign(href)
      else window.location.reload()
    }

    const safe = () =>
      !unsaved &&
      !isUpdateGuarded() &&
      !isAnyModalOpen() &&
      queryClient.isMutating() === 0 &&
      !isField(document.activeElement) &&
      !mediaActive()

    const tryNow = () => {
      if (ready && safe()) reload()
    }

    const onInput = (e: Event) => {
      if (isField(e.target) && !(e.target as HTMLElement).closest('[data-update-ok]')) unsaved = true
    }
    const offMutations = queryClient.getMutationCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'success') unsaved = false
    })

    // A link click while an update waits becomes a normal page load of the
    // destination, so the new version arrives with no visible reload.
    const onClick = (e: MouseEvent) => {
      if (!ready || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const link = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!link || (link.target && link.target !== '_self') || link.hasAttribute('download')) return
      const url = new URL(link.href, window.location.href)
      if (url.origin !== window.location.origin || /^\/(api|media|static|ws)\//.test(url.pathname)) return
      if (isUpdateGuarded() || isAnyModalOpen() || queryClient.isMutating() > 0) return
      e.preventDefault()
      e.stopPropagation()
      reload(url.pathname + url.search + url.hash)
    }

    let lastPath = router.state.location.pathname
    const offRouter = router.subscribe((state) => {
      if (state.location.pathname === lastPath) return
      lastPath = state.location.pathname
      unsaved = false // whatever was typed belonged to the page just left
      tryNow()
    })

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') tryNow()
    }

    // A lazy page chunk from the old build is gone from the server after a
    // deploy — loading the page fresh is the only way forward there.
    const onPreloadError = (e: Event) => {
      e.preventDefault()
      reload()
    }

    document.addEventListener('input', onInput, true)
    document.addEventListener('click', onClick, true)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('vite:preloadError', onPreloadError)

    if ('serviceWorker' in navigator) {
      registerSW({
        immediate: true,
        // registerType 'autoUpdate' calls this, instead of reloading by
        // itself, once the new worker has taken control.
        onNeedReload() {
          ready = true
          tryNow()
          retry ??= setInterval(tryNow, 30_000)
        },
        onRegisteredSW(_url, registration) {
          if (!registration) return
          // The browser re-checks the worker only on full navigations (and
          // ~daily) — this SPA rarely does one, so poll for new deploys.
          setInterval(() => {
            registration.update().catch(() => {})
          }, 60_000)
        },
      })
    }

    return () => {
      document.removeEventListener('input', onInput, true)
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('vite:preloadError', onPreloadError)
      offMutations()
      offRouter()
      clearInterval(retry)
    }
  }, [queryClient])

  return null
}
