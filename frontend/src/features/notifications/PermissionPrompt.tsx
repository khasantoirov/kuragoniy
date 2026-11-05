import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useToast } from '@/components/Toast'
import { IC } from '@/icons'
import { useAuth } from '@/lib/auth/AuthContext'
import { getPushState, isPushSupported, subscribeToPush } from '@/lib/push/subscribe'

import { setDeviceSettings, soundFor } from './device'
import { playSound, unlockAudio } from './sounds'

const ASKED_KEY = 'af.notifyAsked'
const AGAIN_AFTER = 3 * 24 * 3600_000

function askedRecently(): boolean {
  try {
    return Date.now() - Number(localStorage.getItem(ASKED_KEY) || 0) < AGAIN_AFTER
  } catch {
    return false
  }
}

function markAsked() {
  try {
    localStorage.setItem(ASKED_KEY, String(Date.now()))
  } catch {
    /* private mode: it asks again next time */
  }
}

/** Ruxsat rejimi: a little card a few seconds after sign-in asking to turn
 *  notifications on — the browser's permission, the push service (messages
 *  arrive with the app closed) and the sound. "Keyinroq" hides it for three
 *  days; Sozlamalar → Bildirishnomalar has the same switches for later. */
export function NotifyPermissionPrompt() {
  const { t } = useTranslation()
  const toast = useToast()
  const { user } = useAuth()
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!user || typeof Notification === 'undefined' || askedRecently()) return
    let alive = true
    const timer = window.setTimeout(async () => {
      if (Notification.permission === 'denied') return
      const pushOff = isPushSupported() && (await getPushState().catch(() => 'unsupported')) === 'unsubscribed'
      if (alive && (Notification.permission === 'default' || pushOff)) setShow(true)
    }, 4000)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [user])

  if (!show) return null

  const later = () => {
    markAsked()
    setShow(false)
  }

  const allow = async () => {
    setBusy(true)
    unlockAudio() // this click lets the page play sounds from now on
    try {
      const perm = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission
      if (perm !== 'granted') {
        toast(t("Ruxsat berilmadi. Keyin brauzer manzil satridagi qulf belgisidan «Bildirishnomalar»ni yoqishingiz mumkin."), 'error')
        later()
        return
      }
      setDeviceSettings({ popup: true, sound: true })
      if (isPushSupported()) await subscribeToPush().catch(() => {})
      playSound(soundFor('tizim'))
      toast(t('Bildirishnomalar yoqildi — yangi xabarlar ovoz bilan keladi'))
      markAsked()
      setShow(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="nask" role="dialog" aria-live="polite" aria-label={t('Bildirishnomalarni yoqing')}>
      <span className="nask__ic" aria-hidden="true">{IC.bell}</span>
      <div className="nask__txt">
        <b>{t('Bildirishnomalarni yoqing')}</b>
        <span>{t("Yangi xabarlar, ruxsat so'rovlari va e'lonlar ovoz bilan darhol keladi — sayt yopiq bo'lsa ham.")}</span>
        <div className="nask__acts">
          <button type="button" className="btn btn--sm btn--primary" onClick={() => void allow()} disabled={busy}>{t('Ruxsat berish')}</button>
          <button type="button" className="btn btn--sm btn--ghost" onClick={later}>{t('Keyinroq')}</button>
        </div>
      </div>
    </div>
  )
}
