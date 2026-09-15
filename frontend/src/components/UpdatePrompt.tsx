import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { registerSW } from 'virtual:pwa-register'

/**
 * Own the whole service-worker registration/update lifecycle and — this is
 * the part that used to be missing — never reload the page on its own.
 *
 * The previous version reloaded automatically the moment a new deploy's
 * worker took over (`controllerchange` -> `window.location.reload()`).
 * That's exactly wrong for a mid-edit users: someone writing an
 * announcement or filling in a lesson form loses everything unsaved the
 * instant a deploy happens to land in the background (this app deploys
 * often). Instead: detect the update, show a small dismissible banner, and
 * only reload when the user explicitly clicks it — after they've had a
 * chance to save their work.
 */
export function UpdatePrompt() {
  const { t } = useTranslation()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    registerSW({
      immediate: true,
      // registerType: 'autoUpdate' calls this (instead of reloading itself)
      // once the new worker has activated and taken control.
      onNeedReload() {
        setReady(true)
      },
      onRegisteredSW(_url, registration) {
        if (!registration) return
        // The browser only re-checks the SW script on navigation (and at
        // most once per ~24h in the background) — a tab left open on this
        // SPA (no full navigations happen client-side) can otherwise sit on
        // a stale build indefinitely. Poll ourselves so a deploy is noticed
        // within a minute.
        setInterval(() => {
          registration.update().catch(() => {})
        }, 60_000)
      },
    })
  }, [])

  if (!ready) return null

  return (
    <div className="update-banner">
      <span>{t('Yangi versiya tayyor')}</span>
      <div className="update-banner__acts">
        <button type="button" className="btn btn--sm btn--primary" onClick={() => window.location.reload()}>
          {t('Yangilash')}
        </button>
        <button type="button" className="update-banner__x" aria-label={t('Yopish')} onClick={() => setReady(false)}>
          ×
        </button>
      </div>
    </div>
  )
}
