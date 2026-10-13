import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { errText } from '@/features/portal/ui'
import { IC } from '@/icons'
import { api } from '@/lib/api/client'
import type { User } from '@/lib/api/types'
import { homePathFor, useAuth } from '@/lib/auth/AuthContext'

/** Forced after logging in with a password someone else generated
 * (teacher-created student logins, admin resets) — the server refuses
 * everything else until it's done. */
export function ChangePasswordPage() {
  const { t } = useTranslation()
  const { user, applySession, logout } = useAuth()
  const navigate = useNavigate()
  const [cur, setCur] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (pw !== pw2) return setNote(t('Parollar mos kelmadi'))
    setBusy(true)
    setNote('')
    try {
      const res = await api.post<{ access: string; user: User }>('/accounts/me/change-password/', {
        current_password: cur,
        new_password: pw,
      })
      applySession(res.data.access, res.data.user)
      navigate(homePathFor(res.data.user), { replace: true })
    } catch (err) {
      setNote(t(errText(err)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="gate">
      <div className="gate__panel gate__panel--narrow">
        <img className="gate__logo gate__logo--sm" src="/logo.png" alt="" />
        <h1 className="gate__title gate__title--ink">{t('Yangi parol o\'rnating')}</h1>
        <p className="prose">
          {t('Salom')}, {user?.name}! {t("Sizga berilgan vaqtinchalik parolni o'zingiz biladigan yangi parolga almashtiring. Uni hech kimga aytmang.")}
        </p>
        <form className="form" onSubmit={submit}>
          <label className="field">
            <span className="field__label">{t('Vaqtinchalik (joriy) parol')}</span>
            <span className="ifield">
              <span className="ifield__ic">{IC.lock}</span>
              <input className="input input--ic" type={show ? 'text' : 'password'} required autoComplete="current-password"
                value={cur} onChange={(e) => setCur(e.target.value)} />
            </span>
          </label>
          <label className="field">
            <span className="field__label">{t('Yangi parol')}</span>
            <span className="ifield">
              <span className="ifield__ic">{IC.lock}</span>
              <input className="input input--ic input--pw" type={show ? 'text' : 'password'} required minLength={8}
                autoComplete="new-password" placeholder={t('kamida 8 belgi')} value={pw} onChange={(e) => setPw(e.target.value)} />
              <button type="button" className={`ifield__eye ${show ? 'is-on' : ''}`} aria-label={t("Parolni ko'rsatish")}
                onClick={() => setShow((v) => !v)}>{show ? IC.eyeOff : IC.eye}</button>
            </span>
          </label>
          <label className="field">
            <span className="field__label">{t('Yangi parolni takrorlang')}</span>
            <input className="input" type={show ? 'text' : 'password'} required minLength={8} autoComplete="new-password"
              value={pw2} onChange={(e) => setPw2(e.target.value)} />
          </label>
          <p className="form__note">{t("Maslahat: oddiy so'z yoki faqat raqamlardan foydalanmang, masalan: «Kuch-Massa-27».")}</p>
          <button className="btn btn--primary btn--block" type="submit" disabled={busy}>
            {busy ? t('Saqlanmoqda…') : t('Parolni saqlash')}
          </button>
          {note && <p className="form__note form__note--err" role="alert">{note}</p>}
        </form>
        <button className="btn btn--ghost btn--block" onClick={() => logout()}>{t('Chiqish')}</button>
      </div>
    </div>
  )
}
