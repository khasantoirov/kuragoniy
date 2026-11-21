import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useToast } from '@/components/Toast'
import { api } from '@/lib/api/client'

import { errText } from './ui'

/** Opens @kuragoniybot with a single-use link token (never the raw account
 * id) — the one way to link Telegram, shared by Integratsiyalar /
 * the pupil's Profil (TelegramLinkBox) and the Bosh sahifa reminder card. */
export function useTelegramConnect() {
  const { t } = useTranslation()
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  const connect = async () => {
    setBusy(true)
    // Opened synchronously (before the await) so popup blockers allow it.
    const win = window.open('', '_blank')
    if (win) win.opener = null
    try {
      const res = await api.post<{ url: string }>('/accounts/me/telegram-link/')
      if (win) win.location.href = res.data.url
      else window.location.href = res.data.url
      toast(t("Botda «Start» bosing, so'ng shu sahifaga qayting."))
      return true
    } catch (err) {
      win?.close()
      toast(t(errText(err)), 'error')
      return false
    } finally {
      setBusy(false)
    }
  }

  return { connect, busy }
}
