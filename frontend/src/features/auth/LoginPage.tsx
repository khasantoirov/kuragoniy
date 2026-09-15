import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'

import { IC } from '@/icons'
import { useAuth } from '@/lib/auth/AuthContext'

export function LoginPage() {
  const { t } = useTranslation()
  const { login, verifyTotp } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [challenge, setChallenge] = useState<string | null>(null)
  const [totpCode, setTotpCode] = useState('')

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setNote('')
    try {
      const result = await login(email, password)
      if (result.totpRequired) setChallenge(result.challenge)
      else navigate('/')
    } catch {
      setNote(t("Email yoki parol noto'g'ri"))
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
      await verifyTotp(challenge, totpCode)
      navigate('/')
    } catch {
      setNote(t("Kod noto'g'ri"))
    } finally {
      setBusy(false)
    }
  }

  if (challenge) {
    return (
      <form className="form" onSubmit={onVerifyTotp}>
        <p className="form__note">{t("Ilova (Google Authenticator va h.k.) ko'rsatayotgan 6 xonali kodni kiriting.")}</p>
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
        <button className="btn btn--primary btn--block" type="submit" disabled={busy}>
          {busy ? t('Tekshirilmoqda…') : t('Tasdiqlash')}
        </button>
        {note && <p className="form__note">{note}</p>}
        <p className="form__note">
          <button type="button" className="linklike" onClick={() => { setChallenge(null); setTotpCode('') }}>
            {t('Orqaga')}
          </button>
        </p>
      </form>
    )
  }

  return (
    <form className="form" onSubmit={onSubmit}>
      <label className="field">
        <span className="field__label">{t('Email')}</span>
        <span className="ifield">
          <span className="ifield__ic">{IC.mail}</span>
          <input
            className="input input--ic"
            type="email"
            required
            autoComplete="email"
            placeholder="ismfamiliya@email.uz"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
            autoComplete="current-password"
            placeholder="••••••••"
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
      <button className="btn btn--primary btn--block" type="submit" disabled={busy}>
        {busy ? t('Tekshirilmoqda…') : t('Kirish')}
      </button>
      {note && <p className="form__note">{note}</p>}
      <p className="form__note">
        <Link to="/forgot-password">{t('Parolni unutdingizmi?')}</Link>
      </p>
    </form>
  )
}
