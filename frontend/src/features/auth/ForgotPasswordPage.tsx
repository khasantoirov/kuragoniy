import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { errText } from '@/features/portal/ui'
import { IC } from '@/icons'
import { api } from '@/lib/api/client'

/** Self-service reset: a 6-digit code arrives over the account's linked
 * Telegram bot (or email when configured). Students without Telegram ask
 * their teacher, teachers ask an administrator — never the developer. */
export function ForgotPasswordPage() {
  const { t } = useTranslation()
  const [step, setStep] = useState<'login' | 'code' | 'done'>('login')
  const [loginName, setLoginName] = useState('')
  const [code, setCode] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  const request = async (e?: FormEvent) => {
    e?.preventDefault()
    setBusy(true)
    setNote('')
    try {
      await api.post('/auth/password-reset/request/', { login: loginName.trim() })
      setStep('code')
    } catch (err) {
      setNote(t(errText(err)))
    } finally {
      setBusy(false)
    }
  }

  const confirm = async (e: FormEvent) => {
    e.preventDefault()
    if (pw !== pw2) return setNote(t('Parollar mos kelmadi'))
    setBusy(true)
    setNote('')
    try {
      await api.post('/auth/password-reset/confirm/', { login: loginName.trim(), code: code.trim(), new_password: pw })
      setStep('done')
    } catch (err) {
      setNote(t(errText(err)))
    } finally {
      setBusy(false)
    }
  }

  if (step === 'done') {
    return (
      <div className="form">
        <p className="prose">✅ {t('Parol yangilandi. Endi yangi parol bilan kiring.')}</p>
        <Link className="btn btn--primary btn--block" to="/login">{t('Kirish sahifasiga qaytish')}</Link>
      </div>
    )
  }

  if (step === 'code') {
    return (
      <form className="form" onSubmit={confirm}>
        <p className="form__note">
          {t("Agar hisobingizga Telegram ulangan bo'lsa, @amaliyfizikabot sizga 6 xonali kod yubordi. Kod 10 daqiqa amal qiladi.")}
        </p>
        <label className="field">
          <span className="field__label">{t('Tasdiqlash kodi')}</span>
          <input className="input input--code" inputMode="numeric" autoComplete="one-time-code" required autoFocus maxLength={6}
            placeholder="123456" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
        </label>
        <label className="field">
          <span className="field__label">{t('Yangi parol')}</span>
          <span className="ifield">
            <span className="ifield__ic">{IC.lock}</span>
            <input className="input input--ic input--pw" type={showPw ? 'text' : 'password'} required minLength={8}
              autoComplete="new-password" placeholder={t('kamida 8 belgi')} value={pw} onChange={(e) => setPw(e.target.value)} />
            <button type="button" className={`ifield__eye ${showPw ? 'is-on' : ''}`} aria-label={t("Parolni ko'rsatish")}
              onClick={() => setShowPw((v) => !v)}>{showPw ? IC.eyeOff : IC.eye}</button>
          </span>
        </label>
        <label className="field">
          <span className="field__label">{t('Yangi parolni takrorlang')}</span>
          <input className="input" type={showPw ? 'text' : 'password'} required minLength={8} autoComplete="new-password"
            value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </label>
        <button className="btn btn--primary btn--block" type="submit" disabled={busy || code.length !== 6}>
          {busy ? t('Tekshirilmoqda…') : t('Parolni yangilash')}
        </button>
        {note && <p className="form__note form__note--err" role="alert">{note}</p>}
        <div className="helpbox">
          <p><strong>{t('Kod kelmadimi?')}</strong></p>
          <ul>
            <li>{t("O'quvchi bo'lsangiz — o'qituvchingiz «O'quvchilar» bo'limida parolingizni bir zumda tiklab beradi.")}</li>
            <li>{t("O'qituvchi bo'lsangiz — maktab administratoriga murojaat qiling.")}</li>
            <li>{t("Parolni tiklagach, Sozlamalarda Telegramni ulang — keyingi safar o'zingiz tiklaysiz.")}</li>
          </ul>
          <button type="button" className="linklike" disabled={busy} onClick={() => request()}>{t('Kodni qayta yuborish')}</button>
        </div>
      </form>
    )
  }

  return (
    <form className="form" onSubmit={request}>
      <p className="form__note">{t('Email (o\'qituvchilar) yoki login (o\'quvchilar) kiriting — tasdiqlash kodi Telegram orqali keladi.')}</p>
      <label className="field">
        <span className="field__label">{t('Email yoki login')}</span>
        <span className="ifield">
          <span className="ifield__ic">{IC.user}</span>
          <input className="input input--ic" required autoFocus autoCapitalize="none" autoCorrect="off" spellCheck={false}
            autoComplete="username" value={loginName} onChange={(e) => setLoginName(e.target.value)} />
        </span>
      </label>
      <button className="btn btn--primary btn--block" type="submit" disabled={busy}>
        {busy ? t('Yuborilmoqda…') : t('Kod yuborish')}
      </button>
      {note && <p className="form__note form__note--err" role="alert">{note}</p>}
      <p className="form__note"><Link to="/login">{t('Kirish sahifasiga qaytish')}</Link></p>
    </form>
  )
}
