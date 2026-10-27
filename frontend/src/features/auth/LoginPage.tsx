import { isAxiosError } from 'axios'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'

import { IC } from '@/icons'
import { homePathFor, LOGOUT_REASON_KEY, useAuth } from '@/lib/auth/AuthContext'

// One form for everyone — students, teachers and administration all sign
// in with a login (or email) and password; where they land afterwards is
// decided by their role (homePathFor). The last login is remembered only
// when "Eslab qolish" is ticked, so a shared school computer forgets it.
const LAST_LOGIN_KEY = 'af-last-login'
export const RENAMED_LOGIN_KEY = 'af-renamed-login'

function readLastLogin() {
  try {
    return localStorage.getItem(LAST_LOGIN_KEY) || ''
  } catch {
    return ''
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

export function LoginPage() {
  const { t } = useTranslation()
  const { login, verifyTotp } = useAuth()
  const navigate = useNavigate()
  const [loginName, setLoginName] = useState(readLastLogin)
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [reason, setReason] = useState(takeLogoutReason)
  const [challenge, setChallenge] = useState<string | null>(null)
  const [totpCode, setTotpCode] = useState('')

  const failMessage = (err: unknown) => {
    if (isAxiosError(err)) {
      if (!err.response) return t("Internet aloqasi yo'q")
      const detail = (err.response.data as { detail?: string })?.detail
      if (err.response.status === 429 && detail) return t(detail)
      if (err.response.status === 429) return t("Juda ko'p urinish. Biroz kutib qayta urining")
    }
    return t("Login yoki parol noto'g'ri")
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setNote('')
    setReason('')
    try {
      const result = await login(loginName.trim(), password, remember)
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

  const onVerifyTotp = async (e: FormEvent) => {
    e.preventDefault()
    if (!challenge) return
    setBusy(true)
    setNote('')
    try {
      const user = await verifyTotp(challenge, totpCode)
      rememberLogin(remember ? loginName.trim() : null)
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

  return (
    <form className="form gx-form" onSubmit={onSubmit}>
      <h1 className="gx-form__title">{t('Tizimga kirish')}</h1>
      <p className="gx-form__sub gx-form__sub--opt">{t('Login va parolingiz bilan kiring.')}</p>

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

      <div className="gx-form__row">
        <label className="gx-check">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <span>{t('Eslab qolish')}</span>
        </label>
        <Link className="gx-form__link" to="/forgot-password">{t('Parolni unutdingizmi?')}</Link>
      </div>

      <button className="btn btn--primary btn--block gx-form__go" type="submit" disabled={busy}>
        {busy ? t('Tekshirilmoqda…') : t('Kirish')}
      </button>
      {note && <p className="form__note form__note--err" role="alert">{note}</p>}
      {!note && reason && <p className="form__note form__note--info" role="status">{IC.lock} {t(reason)}</p>}
    </form>
  )
}
