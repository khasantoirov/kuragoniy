import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useToast } from '@/components/Toast'
import { useAuth } from '@/lib/auth/AuthContext'
import { useModules } from '@/lib/modules'
import { editable, reportAttempt, watermarkTile } from '@/lib/protection'

/** Kontent himoyasi, as the developer set it (Boshqaruv → Himoya): for
 *  everyone but the developer, or for pupils only. Mounted once by each
 *  shell (staff AppShell, StudentShell). */
export function ContentGuard() {
  const { t } = useTranslation()
  const toast = useToast()
  const { user } = useAuth()
  const { data } = useModules()
  const p = data?.protection
  const active = !!user && !!p && !user.is_dev_superuser && (p.scope === 'all' || user.role === 'student')
  const copy = active && p.no_copy
  const print = active && p.no_print
  const shot = active && p.screenshot
  const mark = active && p.watermark
  const [shield, setShield] = useState<'' | 'flash' | 'away'>('')

  // <html data-guard-*> switches the CSS half (styles/protection.css).
  useEffect(() => {
    const el = document.documentElement
    const flags: [string, boolean][] = [['data-guard-copy', copy], ['data-guard-print', print], ['data-guard-shot', shot]]
    flags.forEach(([k, on]) => (on ? el.setAttribute(k, '') : el.removeAttribute(k)))
    return () => flags.forEach(([k]) => el.removeAttribute(k))
  }, [copy, print, shot])

  useEffect(() => {
    if (!copy) return
    const block = (e: Event) => {
      if (editable(e.target)) return
      e.preventDefault()
      if (e.type === 'copy' || e.type === 'cut') {
        toast(t("Nusxa olish cheklangan"), 'error')
        reportAttempt('copy')
      }
    }
    const kinds = ['copy', 'cut', 'contextmenu', 'dragstart', 'selectstart'] as const
    kinds.forEach((k) => document.addEventListener(k, block))
    return () => kinds.forEach((k) => document.removeEventListener(k, block))
  }, [copy, t, toast])

  useEffect(() => {
    if (!print) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        toast(t('Chop etish cheklangan'), 'error')
        reportAttempt('print')
      }
    }
    const onBefore = () => {
      if (!document.documentElement.hasAttribute('data-printing')) reportAttempt('print')
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('beforeprint', onBefore)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('beforeprint', onBefore)
    }
  }, [print, t, toast])

  useEffect(() => {
    if (!shot) return
    let timer = 0
    const flash = () => {
      setShield('flash')
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setShield(''), 1800)
      // What PrintScreen just put on the clipboard is replaced.
      navigator.clipboard?.writeText(' ').catch(() => {})
      toast(t("Skrinshot olish cheklangan — urinish qayd etildi"), 'error')
      reportAttempt('screenshot')
    }
    const onKey = (e: KeyboardEvent) => {
      const mac = e.metaKey && e.shiftKey && ['3', '4', '5', '6'].includes(e.key)
      const win = e.metaKey && e.shiftKey && e.key.toLowerCase() === 's'
      if (e.key === 'PrintScreen' || mac || win) flash()
    }
    // Away from the page (another window, the snipping overlay, the phone's
    // app switcher): the content is veiled until it's back. Focus moving
    // into one of the page's own frames (a YouTube video) isn't "away".
    const away = () => window.setTimeout(() => {
      if (document.activeElement?.tagName !== 'IFRAME') setShield((s) => (s === 'flash' ? s : 'away'))
    }, 0)
    const back = () => setShield((s) => (s === 'away' ? '' : s))
    const onVisibility = () => (document.hidden ? setShield((s) => (s === 'flash' ? s : 'away')) : back())
    window.addEventListener('keyup', onKey, true)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('blur', away)
    window.addEventListener('focus', back)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('keyup', onKey, true)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('blur', away)
      window.removeEventListener('focus', back)
      document.removeEventListener('visibilitychange', onVisibility)
      setShield('')
    }
  }, [shot, t, toast])

  const tiles = useMemo(() => {
    if (!mark || !user) return null
    const who = [user.name, user.username || user.email].filter(Boolean).join(' · ')
    const day = new Date().toLocaleDateString('uz-UZ', { year: 'numeric', month: '2-digit', day: '2-digit' })
    const lines = [who, `${window.location.host} · ${day}`]
    return { light: watermarkTile(lines, 'rgba(15,23,42,0.075)'), dark: watermarkTile(lines, 'rgba(255,255,255,0.065)') }
  }, [mark, user])

  return (
    <>
      {tiles && (
        <div className="wmark" aria-hidden="true"
          style={{ ['--wm-light' as string]: tiles.light, ['--wm-dark' as string]: tiles.dark }} />
      )}
      {shield && (
        <div className={`gshield gshield--${shield}`} aria-hidden="true">
          <span>{shield === 'flash' ? t('Himoyalangan kontent') : t('Sahifaga qayting')}</span>
        </div>
      )}
    </>
  )
}
