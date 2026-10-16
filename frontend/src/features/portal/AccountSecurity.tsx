import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useConfirm } from '@/components/ConfirmProvider'
import { useToast } from '@/components/Toast'
import { IC } from '@/icons'
import { api } from '@/lib/api/client'
import type { User } from '@/lib/api/types'
import { useAuth } from '@/lib/auth/AuthContext'

import { errText } from './ui'

/** Telegram link/unlink. Linking goes through a single-use token from the
 * server (never the raw account id), and a linked Telegram is what makes
 * self-service password reset possible. */
export function TelegramLinkBox() {
  const { t } = useTranslation()
  const { user, refreshMe } = useAuth()
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
    } catch (err) {
      win?.close()
      toast(t(errText(err)), 'error')
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async () => {
    try {
      await api.post('/accounts/me/telegram-unlink/')
      await refreshMe()
      toast(t('Telegram uzildi'))
    } catch (err) {
      toast(t(errText(err)), 'error')
    }
  }

  return user?.telegram_linked ? (
    <div className="tgbox tgbox--on">
      <span>✅ {t('Ulangan')} {user.telegram_username ? `(@${user.telegram_username})` : ''} — {t("xabarlar va parol tiklash kodi Telegramga keladi")}</span>
      <span className="tgbox__acts">
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => refreshMe()}>{t('Yangilash')}</button>
        <button type="button" className="btn btn--sm btn--ghost" onClick={disconnect}>{t('Uzish')}</button>
      </span>
    </div>
  ) : (
    <div className="tgbox">
      <span>{t("Telegramni ulang: parolni unutsangiz, uni o'zingiz bir daqiqada tiklaysiz.")}</span>
      <span className="tgbox__acts">
        <button type="button" className="btn btn--sm" onClick={connect} disabled={busy}>{IC.telegram} {t('Telegramni ulash')}</button>
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => refreshMe()}>{t('Tekshirish')}</button>
      </span>
    </div>
  )
}

export function ChangePasswordForm({ onDone }: { onDone?: () => void }) {
  const { t } = useTranslation()
  const { applySession } = useAuth()
  const toast = useToast()
  const [cur, setCur] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (pw.length < 8) return toast(t("Parol kamida 8 belgidan iborat bo'lishi kerak."), 'error')
    if (pw !== pw2) return toast(t('Parollar mos kelmadi'), 'error')
    setBusy(true)
    try {
      const res = await api.post<{ access: string; user: User }>('/accounts/me/change-password/', { current_password: cur, new_password: pw })
      applySession(res.data.access, res.data.user)
      toast(t('Parol yangilandi. Boshqa qurilmalardagi sessiyalar yopildi.'))
      setCur('')
      setPw('')
      setPw2('')
      onDone?.()
    } catch (err) {
      toast(t(errText(err)), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pf__pw">
      <span className="ifield">
        <span className="ifield__ic">{IC.lock}</span>
        <input className="input input--ic input--pw" type={show ? 'text' : 'password'} autoComplete="current-password"
          placeholder={t('Joriy parol')} value={cur} onChange={(e) => setCur(e.target.value)} />
        <button type="button" className={`ifield__eye ${show ? 'is-on' : ''}`} aria-label={t("Parolni ko'rsatish")}
          onClick={() => setShow((v) => !v)}>{show ? IC.eyeOff : IC.eye}</button>
      </span>
      <input className="input" type={show ? 'text' : 'password'} autoComplete="new-password" placeholder={t('Yangi parol')}
        value={pw} onChange={(e) => setPw(e.target.value)} />
      <input className="input" type={show ? 'text' : 'password'} autoComplete="new-password" placeholder={t('Yangi parolni takrorlang')}
        value={pw2} onChange={(e) => setPw2(e.target.value)} />
      <div className="row row--2">
        <button type="button" className="btn btn--sm btn--primary" onClick={submit} disabled={busy}>{t('Parolni yangilash')}</button>
        {onDone && <button type="button" className="btn btn--sm btn--ghost" onClick={onDone}>{t('Bekor qilish')}</button>}
      </div>
    </div>
  )
}

export function LogoutEverywhereButton() {
  const { t } = useTranslation()
  const { logout } = useAuth()
  const confirm = useConfirm()
  const toast = useToast()

  const run = async () => {
    if (!(await confirm({
      title: t('Barcha qurilmalardan chiqish'),
      text: t("Hisobingiz ochiq turgan barcha telefon va kompyuterlardan (shu jumladan shu qurilmadan) chiqiladi. Begona qurilmada kirib qolgan bo'lsangiz yoki parolingiz oshkor bo'lgan deb gumon qilsangiz foydali."),
      danger: true,
    }))) return
    try {
      await api.post('/accounts/me/logout-all/')
    } catch (err) {
      toast(t(errText(err)), 'error')
      return
    }
    await logout()
  }

  return <button type="button" className="btn btn--sm btn--ghost" onClick={run}>{IC.logout} {t('Barcha qurilmalardan chiqish')}</button>
}
