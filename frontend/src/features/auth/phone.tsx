import { isAxiosError } from 'axios'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { errText } from '@/features/portal/ui'
import { IC } from '@/icons'
import { api } from '@/lib/api/client'
import type { User } from '@/lib/api/types'
import { telegramUrl, useLanding } from '@/lib/publicSite'
import { useCaptchaBadge } from '@/lib/captcha'

/* Signing in / up with a phone number. The number is proven through our
   Telegram bot (backend accounts/phone_auth.py): an account already linked
   to Telegram gets its 6-digit code at once; anyone else opens the bot,
   shares their own contact there, and the bot sends the code. */

/** What /auth/phone/start/ and /register/ hand back when a code is due. */
export type VerifyStart = {
  step: 'code' | 'telegram'
  ticket: string
  bot_url: string
  resend_in?: number
}

/** What /auth/phone/verify/ hands back. */
export type VerifyDone =
  | { access: string; user: User }
  | { totp_required: true; challenge: string }
  | { step: 'password'; ticket: string }

/** The nine digits after +998, from whatever was typed or pasted. */
export function localDigits(v: string): string {
  let d = v.replace(/\D/g, '')
  if (d.length > 9 && d.startsWith('998')) d = d.slice(3)
  return d.slice(0, 9)
}

/** "90 123 45 67" */
export function formatLocal(d: string): string {
  return [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean).join(' ')
}

export const fullPhone = (local: string) => `+998${local}`

export function PhoneField({ value, onChange, autoFocus, label }: {
  value: string
  onChange: (digits: string) => void
  autoFocus?: boolean
  label?: string
}) {
  const { t } = useTranslation()
  return (
    <label className="field">
      <span className="field__label">{label ?? t('Telefon raqam')}</span>
      <span className="ifield ifield--phone">
        <span className="ifield__pre" aria-hidden="true">+998</span>
        <input
          className="input input--phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          required
          autoFocus={autoFocus}
          placeholder="90 123 45 67"
          aria-label={t('Telefon raqam')}
          value={formatLocal(value)}
          onChange={(e) => onChange(localDigits(e.target.value))}
        />
      </span>
    </label>
  )
}

/** Six boxes over one real input — paste, autofill and the keyboard's
 * "one-time code" suggestion all land in it whole. */
export function OtpInput({ value, onChange, onComplete, disabled, autoFocus }: {
  value: string
  onChange: (v: string) => void
  onComplete?: (v: string) => void
  disabled?: boolean
  autoFocus?: boolean
}) {
  const { t } = useTranslation()
  const ref = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useState(false)
  const cur = Math.min(value.length, 5)
  return (
    <div className={`otp ${disabled ? 'is-off' : ''}`} onClick={() => ref.current?.focus()}>
      {Array.from({ length: 6 }, (_, i) => (
        <span key={i} className={`otp__cell ${value[i] ? 'is-full' : ''} ${focused && i === cur ? 'is-cur' : ''}`} aria-hidden="true">
          {value[i] ?? ''}
        </span>
      ))}
      <input
        ref={ref}
        className="otp__input"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        aria-label={t('Tasdiqlash kodi')}
        maxLength={6}
        disabled={disabled}
        autoFocus={autoFocus}
        value={value}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, '').slice(0, 6)
          onChange(v)
          if (v.length === 6) onComplete?.(v)
        }}
      />
    </div>
  )
}

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

/** "Muammo bormi? Yordam olish" — our Telegram, or the bot when unset. */
export function HelpLink() {
  const { t } = useTranslation()
  const { data } = useLanding()
  const url = telegramUrl(data?.contacts.telegram) || 'https://t.me/Muhandis_D'
  return (
    <p className="gx-form__help">
      {t('Muammo bormi?')} <a href={url} target="_blank" rel="noreferrer">{t('Yordam olish')}</a>
    </p>
  )
}

/** The verification screen: open the bot (when not linked yet), then the
 * 6-digit code with a resend countdown. */
export function PhoneVerify({ phone, start, remember = true, onDone, onBack }: {
  phone: string
  start: VerifyStart
  remember?: boolean
  onDone: (data: VerifyDone) => void
  onBack: () => void
}) {
  const { t } = useTranslation()
  const [codeSent, setCodeSent] = useState(start.step === 'code')
  const [botUrl, setBotUrl] = useState(start.bot_url)
  const [resendIn, setResendIn] = useState(start.resend_in ?? 0)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [info, setInfo] = useState('')
  const [gone, setGone] = useState(false)
  const ticket = start.ticket

  // While the person is in the bot, ask now and then whether it sent the
  // code — and right away when they come back to this tab.
  const poll = useCallback(async () => {
    try {
      const r = await api.get<{ chat: boolean; code_sent: boolean; resend_in: number }>('/auth/phone/status/', { params: { ticket } })
      if (r.data.code_sent) {
        setCodeSent(true)
        setResendIn(r.data.resend_in)
      }
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 410) {
        setGone(true)
        setNote(t(errText(err)))
      }
    }
  }, [ticket, t])

  useEffect(() => {
    if (codeSent || gone) return
    const id = setInterval(poll, 2500)
    const onVisible = () => document.visibilityState === 'visible' && poll()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [codeSent, gone, poll])

  useEffect(() => {
    if (resendIn <= 0) return
    const id = setTimeout(() => setResendIn((s) => Math.max(0, s - 1)), 1000)
    return () => clearTimeout(id)
  }, [resendIn])

  const verify = async (value: string) => {
    if (busy || value.length !== 6) return
    setBusy(true)
    setNote('')
    setInfo('')
    try {
      const r = await api.post<VerifyDone>('/auth/phone/verify/', { ticket, code: value, remember })
      onDone(r.data)
    } catch (err) {
      setCode('')
      if (isAxiosError(err) && err.response?.status === 410) setGone(true)
      setNote(t(errText(err, "Kod noto'g'ri yoki muddati o'tgan.")))
    } finally {
      setBusy(false)
    }
  }

  const resend = async () => {
    setNote('')
    setInfo('')
    try {
      const r = await api.post<{ step: string; resend_in?: number; bot_url?: string }>('/auth/phone/resend/', { ticket })
      if (r.data.step === 'telegram') {
        setCodeSent(false)
        if (r.data.bot_url) setBotUrl(r.data.bot_url)
        return
      }
      setCode('')
      setResendIn(r.data.resend_in ?? 60)
      setInfo(t('Yangi kod Telegram orqali yuborildi.'))
    } catch (err) {
      const data = isAxiosError(err) ? (err.response?.data as { resend_in?: number } | undefined) : undefined
      if (data?.resend_in) setResendIn(data.resend_in)
      if (isAxiosError(err) && err.response?.status === 410) setGone(true)
      setNote(t(errText(err)))
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    void verify(code)
  }

  return (
    <form className="form gx-form" onSubmit={onSubmit}>
      <h1 className="gx-form__title">{t('Raqamni tasdiqlash')}</h1>
      {codeSent ? (
        <p className="gx-form__sub">
          {t('Telegram botimiz yuborgan 6 xonali kodni kiriting')}: <b className="nowrap">{formatPhone(phone)}</b>
        </p>
      ) : (
        <>
          <p className="gx-form__sub">
            <b className="nowrap">{formatPhone(phone)}</b> {t('raqamini Telegram orqali tasdiqlang')}:
          </p>
          <ol className="gx-steps">
            <li>{t('«Telegram botni ochish» tugmasini bosing.')}</li>
            <li>{t('Botda «Start», keyin «📱 Raqamni yuborish» tugmasini bosing.')}</li>
            <li>{t('Bot yuborgan 6 xonali kodni shu yerga kiriting.')}</li>
          </ol>
          <a className="btn btn--block gx-form__tg" href={botUrl} target="_blank" rel="noreferrer">
            {IC.telegram} {t('Telegram botni ochish')}
          </a>
          {!gone && <p className="gx-wait" role="status"><span className="gx-wait__dot" /> {t('Botdan javob kutilmoqda…')}</p>}
        </>
      )}

      <OtpInput value={code} onChange={setCode} onComplete={verify} disabled={busy || gone} autoFocus={codeSent} />

      <button className="btn btn--primary btn--block gx-form__go" type="submit" disabled={busy || gone || code.length !== 6}>
        {busy ? t('Tekshirilmoqda…') : t('Tasdiqlash')}
      </button>

      {codeSent && !gone && (
        <p className="gx-form__resend">
          {resendIn > 0
            ? <>{mmss(resendIn)} {t("dan so'ng qayta jo'nata olasiz")}</>
            : <button type="button" className="linklike" onClick={resend}>{t('Kodni qayta yuborish')}</button>}
        </p>
      )}
      {note && <p className="form__note form__note--err" role="alert">{note}</p>}
      {info && !note && <p className="form__note form__note--info" role="status">{info}</p>}

      <p className="gx-form__foot gx-form__foot--split">
        <button type="button" className="linklike" onClick={onBack}>{t("Raqamni o'zgartirish")}</button>
      </p>
      <HelpLink />
    </form>
  )
}

/** +998901234567 → "+998 90 123 45 67" */
export function formatPhone(p: string): string {
  const d = localDigits(p)
  return d.length === 9 ? `+998 ${formatLocal(d)}` : p
}

/** Google's reCAPTCHA badge in the corner while this form is on screen
 *  (no text line under the form — the owner asked it away). */
export function CaptchaBadge({ on }: { on: boolean }) {
  useCaptchaBadge(on)
  return null
}
