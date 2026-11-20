import { isAxiosError } from 'axios'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { errText } from '@/features/portal/ui'
import { IC } from '@/icons'
import { api } from '@/lib/api/client'
import type { User } from '@/lib/api/types'
import { useAuth } from '@/lib/auth/AuthContext'
import { useCaptcha } from '@/lib/publicSite'

import { CaptchaBadge, fullPhone, HelpLink, localDigits, PhoneField, PhoneVerify, type VerifyDone, type VerifyStart } from './phone'

/* "Ro'yxatdan o'tish" for teachers: name → the number proven through the
   Telegram bot → a password. The account then waits for the
   administration, who approve it and point it to its subject (Amaliy
   fizika or STEAM / Robototexnika). Pupils join with their class code. */

type NavState = { phone?: string; note?: string } | null

export function RegisterPage() {
  const { t } = useTranslation()
  const { applySession } = useAuth()
  const navigate = useNavigate()
  const navState = useLocation().state as NavState
  const captcha = useCaptcha()
  const [step, setStep] = useState<'form' | 'verify' | 'password'>('form')
  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [phone, setPhone] = useState(() => localDigits(navState?.phone ?? ''))
  const [verify, setVerify] = useState<VerifyStart | null>(null)
  const [ticket, setTicket] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState(navState?.note ?? '')
  const [isInfo, setIsInfo] = useState(!!navState?.note)

  const fail = (text: string) => {
    setIsInfo(false)
    setNote(text)
  }

  const onStart = async (e: FormEvent) => {
    e.preventDefault()
    if (phone.length !== 9) return fail(t("Telefon raqamni to'liq kiriting: +998 90 123 45 67."))
    setBusy(true)
    setNote('')
    try {
      const r = await api.post<VerifyStart>('/auth/phone/register/', {
        phone: fullPhone(phone),
        first_name: first,
        last_name: last,
        captcha: await captcha.token('phone_register'),
      })
      setVerify(r.data)
      setTicket(r.data.ticket)
      setStep('verify')
    } catch (err) {
      const data = isAxiosError(err) ? (err.response?.data as { step?: string; detail?: string } | undefined) : undefined
      if (data?.step === 'login') {
        navigate('/login', { state: { phone, note: t(data.detail ?? '') } })
        return
      }
      fail(t(errText(err)))
    } finally {
      setBusy(false)
    }
  }

  const onVerified = (data: VerifyDone) => {
    if ('step' in data && data.step === 'password') {
      setTicket(data.ticket)
      setStep('password')
      setNote('')
    }
  }

  const onComplete = async (e: FormEvent) => {
    e.preventDefault()
    if (pw !== pw2) return fail(t('Parollar mos kelmadi'))
    setBusy(true)
    setNote('')
    try {
      const r = await api.post<{ access: string; user: User; login: string }>('/auth/phone/complete/', { ticket, password: pw })
      applySession(r.data.access, r.data.user)
      navigate('/pending-approval', { replace: true })
    } catch (err) {
      const data = isAxiosError(err) ? (err.response?.data as { step?: string; detail?: string } | undefined) : undefined
      if (data?.step === 'login') {
        navigate('/login', { state: { phone, note: t(data.detail ?? '') } })
        return
      }
      fail(t(errText(err)))
      if (isAxiosError(err) && err.response?.status === 410) setStep('form')
    } finally {
      setBusy(false)
    }
  }

  if (step === 'verify' && verify) {
    return (
      <PhoneVerify
        phone={fullPhone(phone)}
        start={verify}
        onDone={onVerified}
        onBack={() => { setVerify(null); setStep('form') }}
      />
    )
  }

  if (step === 'password') {
    return (
      <form className="form gx-form" onSubmit={onComplete}>
        <h1 className="gx-form__title">{t('Parol yarating')}</h1>
        <p className="gx-form__sub">{t("Raqamingiz tasdiqlandi. Endi hisobingiz uchun parol o'ylab toping.")}</p>
        <label className="field">
          <span className="field__label">{t('Yangi parol')}</span>
          <span className="ifield">
            <span className="ifield__ic">{IC.lock}</span>
            <input
              className="input input--ic input--pw"
              type={showPw ? 'text' : 'password'}
              required
              autoFocus
              minLength={8}
              autoComplete="new-password"
              placeholder={t('Kamida 8 ta belgi')}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
            />
            <button type="button" className={`ifield__eye ${showPw ? 'is-on' : ''}`} aria-label={t("Parolni ko'rsatish")} onClick={() => setShowPw((v) => !v)}>
              {showPw ? IC.eyeOff : IC.eye}
            </button>
          </span>
        </label>
        <label className="field">
          <span className="field__label">{t("Parol tasdig'i")}</span>
          <span className="ifield">
            <span className="ifield__ic">{IC.lock}</span>
            <input
              className="input input--ic"
              type={showPw ? 'text' : 'password'}
              required
              minLength={8}
              autoComplete="new-password"
              placeholder={t('Parolni qayta kiriting')}
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
            />
          </span>
        </label>
        <p className="gx-form__hint">{t("Harf va raqamlardan iborat bo'lsin; ism yoki 12345678 kabi oddiy parol qabul qilinmaydi.")}</p>
        <button className="btn btn--primary btn--block gx-form__go" type="submit" disabled={busy}>
          {busy ? t('Yuborilmoqda…') : t('Davom etish')}
        </button>
        {note && <p className="form__note form__note--err" role="alert">{note}</p>}
        <HelpLink />
      </form>
    )
  }

  return (
    <form className="form gx-form" onSubmit={onStart}>
      <h1 className="gx-form__title">{t("Ro'yxatdan o'tish")}</h1>
      <p className="gx-form__sub gx-form__sub--opt">{t("O'qituvchilar uchun. Ariza ma'muriyat tomonidan tasdiqlanadi.")}</p>
      <div className="gx-form__pair">
        <label className="field">
          <span className="field__label">{t('Ismingiz')}</span>
          <input className="input" required autoFocus autoComplete="given-name" placeholder={t('Ism')} value={first} onChange={(e) => setFirst(e.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">{t('Familiyangiz')}</span>
          <input className="input" required autoComplete="family-name" placeholder={t('Familiya')} value={last} onChange={(e) => setLast(e.target.value)} />
        </label>
      </div>
      <PhoneField value={phone} onChange={setPhone} />
      <button className="btn btn--primary btn--block gx-form__go" type="submit" disabled={busy}>
        {busy ? t('Yuborilmoqda…') : t('Davom etish')}
      </button>
      {note && <p className={`form__note ${isInfo ? 'form__note--info' : 'form__note--err'}`} role={isInfo ? 'status' : 'alert'}>{note}</p>}
      <p className="gx-form__foot">
        {t('Hisobingiz bormi?')} <Link className="gx-form__link" to="/login">{t('Kirish')}</Link>
      </p>
      <p className="gx-form__foot gx-form__foot--sm">
        {t("O'quvchimisiz?")} <Link className="gx-form__link" to="/join">{t("Sinf kodi bilan ro'yxatdan o'ting")}</Link>
      </p>
      <CaptchaBadge on={captcha.enabled} />
    </form>
  )
}
