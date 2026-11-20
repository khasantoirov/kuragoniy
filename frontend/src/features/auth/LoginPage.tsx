import { isAxiosError } from 'axios'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { errText } from '@/features/portal/ui'
import { IC } from '@/icons'
import { api } from '@/lib/api/client'
import { homePathFor, LOGOUT_REASON_KEY, useAuth } from '@/lib/auth/AuthContext'
import { useCaptcha } from '@/lib/publicSite'

import { CaptchaNote, fullPhone, HelpLink, localDigits, PhoneField, PhoneVerify, type VerifyDone, type VerifyStart } from './phone'

// Two ways in, one screen: a phone number proven through our Telegram bot,
// or the login and password everyone already has (pupils mostly have no
// phone on their account). Where people land afterwards is decided by their
// role (homePathFor). The last login is remembered only when "Eslab qolish"
// is ticked, so a shared school computer forgets it.
const LAST_LOGIN_KEY = 'af-last-login'
const MODE_KEY = 'ke-login-mode'
export const RENAMED_LOGIN_KEY = 'af-renamed-login'

type Mode = 'phone' | 'password'

// Kirish faqat login + parol yoki telefon raqam bilan — email bilan emas.
const EMAIL_LOGIN_OFF = "Email bilan kirish o'chirilgan. Loginingiz yoki telefon raqamingiz bilan kiring."

function readLastLogin() {
  try {
    const last = localStorage.getItem(LAST_LOGIN_KEY) || ''
    // an email remembered from before is no way in any more
    return last.includes('@') ? '' : last
  } catch {
    return ''
  }
}

function readMode(): Mode {
  try {
    const m = localStorage.getItem(MODE_KEY)
    if (m === 'phone' || m === 'password') return m
  } catch {
    // storage blocked
  }
  // someone who signed in with a login before keeps that form
  return readLastLogin() ? 'password' : 'phone'
}

function saveMode(m: Mode) {
  try {
    localStorage.setItem(MODE_KEY, m)
  } catch {
    // storage blocked — the default comes back next time
  }
}

function rememberLogin(login: string | null) {
  try {
    if (login) localStorage.setItem(LAST_LOGIN_KEY, login)
    else localStorage.removeItem(LAST_LOGIN_KEY)
    localStorage.removeItem('af-portal') // the old per-role tab choice
  } catch {
    // storage blocked — nothing to remember
  }
}

const REASON_TEXT: Record<string, string> = {
  idle: "30 daqiqa faollik bo'lmagani uchun xavfsizlik maqsadida tizimdan chiqdingiz. Qaytadan kiring.",
  expired: "Xavfsizlik uchun har 24 soatda login va parol bilan qaytadan kirish talab qilinadi.",
  revoked: "Bu qurilmadagi seans yakunlangan. Qaytadan kiring.",
}

/** Read once: why the app just signed this browser out. */
function takeLogoutReason() {
  try {
    const code = sessionStorage.getItem(LOGOUT_REASON_KEY) || ''
    sessionStorage.removeItem(LOGOUT_REASON_KEY)
    return REASON_TEXT[code] ?? ''
  } catch {
    return ''
  }
}

type NavState = { phone?: string; note?: string } | null

export function LoginPage() {
  const { t } = useTranslation()
  const { login, verifyTotp, applySession } = useAuth()
  const navigate = useNavigate()
  const navState = useLocation().state as NavState
  const captcha = useCaptcha()
  const [mode, setModeState] = useState<Mode>(() => (navState?.phone ? 'phone' : readMode()))
  const [loginName, setLoginName] = useState(readLastLogin)
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState(() => localDigits(navState?.phone ?? ''))
  const [verify, setVerify] = useState<VerifyStart | null>(null)
  const [remember, setRemember] = useState(true)
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState(navState?.note ?? '')
  const [reason, setReason] = useState(takeLogoutReason)
  const [challenge, setChallenge] = useState<string | null>(null)
  const [totpCode, setTotpCode] = useState('')

  const setMode = (m: Mode) => {
    setModeState(m)
    saveMode(m)
    setNote('')
  }

  const failMessage = (err: unknown) => {
    if (isAxiosError(err)) {
      if (!err.response) return t("Internet aloqasi yo'q")
      const detail = (err.response.data as { detail?: string })?.detail
      if (err.response.status === 429 && detail) return t(detail)
      if (err.response.status === 429) return t("Juda ko'p urinish. Biroz kutib qayta urining")
      if (err.response.status === 400 && detail) return t(detail)
    }
    return t("Login yoki parol noto'g'ri")
  }

  const onPassword = async (e: FormEvent) => {
    e.preventDefault()
    if (loginName.includes('@')) {
      setReason('')
      return setNote(t(EMAIL_LOGIN_OFF))
    }
    setBusy(true)
    setNote('')
    setReason('')
    try {
      const result = await login(loginName.trim(), password, remember, await captcha.token('login'))
      if (result.totpRequired) {
        setChallenge(result.challenge)
        return
      }
      rememberLogin(remember ? result.renamedLogin || loginName.trim() : null)
      if (result.renamedLogin) {
        try {
          sessionStorage.setItem(RENAMED_LOGIN_KEY, result.renamedLogin)
        } catch {
          // shown only if storage works — the old login keeps working anyway
        }
      }
      navigate(homePathFor(result.user))
    } catch (err) {
      setNote(failMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const onPhone = async (e: FormEvent) => {
    e.preventDefault()
    if (phone.length !== 9) return setNote(t("Telefon raqamni to'liq kiriting: +998 90 123 45 67."))
    setBusy(true)
    setNote('')
    setReason('')
    try {
      const r = await api.post<VerifyStart | { step: 'register'; phone: string }>('/auth/phone/start/', {
        phone: fullPhone(phone),
        captcha: await captcha.token('phone_start'),
      })
      if (r.data.step === 'register') {
        navigate('/register', { state: { phone, note: t("Bu raqam hali ro'yxatdan o'tmagan. Ma'lumotlaringizni kiriting.") } })
        return
      }
      setVerify(r.data as VerifyStart)
    } catch (err) {
      const data = isAxiosError(err) ? (err.response?.data as { step?: string; detail?: string } | undefined) : undefined
      if (data?.step === 'password') {
        setModeState('password')
        setNote(t(data.detail ?? ''))
      } else {
        setNote(t(errText(err)))
      }
    } finally {
      setBusy(false)
    }
  }

  const onVerified = (data: VerifyDone) => {
    if ('totp_required' in data) {
      setVerify(null)
      setChallenge(data.challenge)
      return
    }
    if ('access' in data) {
      applySession(data.access, data.user)
      navigate(homePathFor(data.user))
    }
  }

  const onVerifyTotp = async (e: FormEvent) => {
    e.preventDefault()
    if (!challenge) return
    setBusy(true)
    setNote('')
    try {
      const user = await verifyTotp(challenge, totpCode)
      if (mode === 'password') rememberLogin(remember ? loginName.trim() : null)
      navigate(homePathFor(user))
    } catch (err) {
      setNote(isAxiosError(err) && err.response?.status === 429 ? failMessage(err) : t("Kod noto'g'ri"))
    } finally {
      setBusy(false)
    }
  }

  if (challenge) {
    return (
      <form className="form gx-form" onSubmit={onVerifyTotp}>
        <h1 className="gx-form__title">{t('Ikki bosqichli tekshiruv')}</h1>
        <p className="gx-form__sub">{t("Ilova (Google Authenticator va h.k.) ko'rsatayotgan 6 xonali kodni kiriting.")}</p>
        <label className="field">
          <span className="field__label">{t('Tasdiqlash kodi')}</span>
          <input
            className="input"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            autoFocus
            maxLength={6}
            placeholder="123456"
            value={totpCode}
            onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
          />
        </label>
        <button className="btn btn--primary btn--block gx-form__go" type="submit" disabled={busy}>
          {busy ? t('Tekshirilmoqda…') : t('Tasdiqlash')}
        </button>
        {note && <p className="form__note form__note--err" role="alert">{note}</p>}
        <p className="gx-form__foot">
          <button type="button" className="linklike" onClick={() => { setChallenge(null); setTotpCode('') }}>
            {t('Orqaga')}
          </button>
        </p>
      </form>
    )
  }

  if (verify) {
    return <PhoneVerify phone={fullPhone(phone)} start={verify} remember={remember} onDone={onVerified} onBack={() => setVerify(null)} />
  }

  const tabs = (
    <div className="gx-tabs" role="tablist" aria-label={t('Kirish usuli')}>
      <button type="button" role="tab" aria-selected={mode === 'phone'} className={mode === 'phone' ? 'is-on' : ''} onClick={() => setMode('phone')}>
        {IC.smartphone} {t('Telefon raqam')}
      </button>
      <button type="button" role="tab" aria-selected={mode === 'password'} className={mode === 'password' ? 'is-on' : ''} onClick={() => setMode('password')}>
        {IC.lock} {t('Login va parol')}
      </button>
    </div>
  )

  const rememberRow = (
    <div className="gx-form__row">
      <label className="gx-check">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        <span>{t('Eslab qolish')}</span>
      </label>
      {mode === 'password' && <Link className="gx-form__link" to="/forgot-password">{t('Parolni unutdingizmi?')}</Link>}
    </div>
  )

  const notes = (
    <>
      {note && <p className="form__note form__note--err" role="alert">{note}</p>}
      {!note && reason && <p className="form__note form__note--info" role="status">{IC.lock} {t(reason)}</p>}
    </>
  )

  const signUp = (
    <p className="gx-form__foot">
      {t("Hisobingiz yo'qmi?")} <Link className="gx-form__link" to="/register">{t("Ro'yxatdan o'tish")}</Link>
    </p>
  )

  if (mode === 'phone') {
    return (
      <form className="form gx-form" onSubmit={onPhone}>
        <h1 className="gx-form__title">{t('Hisobingizga kiring')}</h1>
        <p className="gx-form__sub gx-form__sub--opt">{t('Telefon raqamingizni kiriting — kod Telegram orqali keladi.')}</p>
        {tabs}
        <PhoneField value={phone} onChange={setPhone} autoFocus />
        {rememberRow}
        <button className="btn btn--primary btn--block gx-form__go" type="submit" disabled={busy}>
          {busy ? t('Tekshirilmoqda…') : t('Davom etish')}
        </button>
        {notes}
        {signUp}
        <HelpLink />
        <CaptchaNote on={captcha.enabled} />
      </form>
    )
  }

  return (
    <form className="form gx-form" onSubmit={onPassword}>
      <h1 className="gx-form__title">{t('Hisobingizga kiring')}</h1>
      <p className="gx-form__sub gx-form__sub--opt">{t('Login va parolingiz bilan kiring.')}</p>
      {tabs}
      <label className="field">
        <span className="field__label">{t('Login')}</span>
        <span className="ifield">
          <span className="ifield__ic">{IC.user}</span>
          <input
            className="input input--ic"
            type="text"
            required
            autoFocus={!loginName}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="username"
            placeholder={t('Login')}
            value={loginName}
            onChange={(e) => setLoginName(e.target.value)}
          />
        </span>
      </label>
      <label className="field">
        <span className="field__label">{t('Parol')}</span>
        <span className="ifield">
          <span className="ifield__ic">{IC.lock}</span>
          <input
            className="input input--ic input--pw"
            type={showPw ? 'text' : 'password'}
            required
            autoFocus={!!loginName}
            autoComplete="current-password"
            placeholder={t('Kamida 8 ta belgi')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            className={`ifield__eye ${showPw ? 'is-on' : ''}`}
            aria-label={t("Parolni ko'rsatish")}
            onClick={() => setShowPw((v) => !v)}
          >
            {showPw ? IC.eyeOff : IC.eye}
          </button>
        </span>
      </label>
      {rememberRow}
      <button className="btn btn--primary btn--block gx-form__go" type="submit" disabled={busy}>
        {busy ? t('Tekshirilmoqda…') : t('Kirish')}
      </button>
      {notes}
      {signUp}
      <CaptchaNote on={captcha.enabled} />
    </form>
  )
}
