import { isAxiosError } from 'axios'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'

import { IC } from '@/icons'
import { homePathFor, useAuth } from '@/lib/auth/AuthContext'

type Portal = 'student' | 'teacher' | 'admin'

const PORTALS: { k: Portal; label: string; hint: string }[] = [
  { k: 'student', label: "O'quvchi", hint: "O'qituvchingiz bergan login yoki o'zingiz tanlagan login bilan kiring." },
  { k: 'teacher', label: "O'qituvchi", hint: 'Email va parolingiz bilan kiring.' },
  { k: 'admin', label: "Ma'muriyat", hint: 'Administrator, boshliq, kuzatuvchi va dasturchi uchun.' },
]

function savedPortal(): Portal {
  try {
    const v = localStorage.getItem('af-portal')
    if (v === 'student' || v === 'teacher' || v === 'admin') return v
  } catch {
    // storage blocked — fall back to the default tab
  }
  return 'teacher'
}

export function LoginPage() {
  const { t } = useTranslation()
  const { login, verifyTotp } = useAuth()
  const navigate = useNavigate()
  const [portal, setPortal] = useState<Portal>(savedPortal)
  const [loginName, setLoginName] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [challenge, setChallenge] = useState<string | null>(null)
  const [totpCode, setTotpCode] = useState('')

  const isStudentTab = portal === 'student'
  const current = PORTALS.find((p) => p.k === portal)!

  const pickPortal = (p: Portal) => {
    setPortal(p)
    setNote('')
    try {
      localStorage.setItem('af-portal', p)
    } catch {
      // ignore
    }
  }

  const failMessage = (err: unknown) => {
    if (isAxiosError(err)) {
      if (!err.response) return t("Internet aloqasi yo'q")
      const detail = (err.response.data as { detail?: string })?.detail
      if (err.response.status === 429 && detail) return t(detail)
      if (err.response.status === 429) return t("Juda ko'p urinish. Biroz kutib qayta urining")
    }
    return isStudentTab ? t("Login yoki parol noto'g'ri") : t("Email yoki parol noto'g'ri")
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setNote('')
    try {
      const result = await login(loginName.trim(), password)
      if (result.totpRequired) setChallenge(result.challenge)
      else navigate(homePathFor(result.user))
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
      navigate(homePathFor(user))
    } catch (err) {
      setNote(isAxiosError(err) && err.response?.status === 429 ? failMessage(err) : t("Kod noto'g'ri"))
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
        {note && <p className="form__note form__note--err">{note}</p>}
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
      <div className="portals" role="tablist" aria-label={t('Kirish oynasi')}>
        {PORTALS.map((p) => (
          <button
            key={p.k}
            type="button"
            role="tab"
            aria-selected={portal === p.k}
            className={`portal ${portal === p.k ? 'is-on' : ''}`}
            onClick={() => pickPortal(p.k)}
          >
            <span className="portal__ic">{p.k === 'student' ? IC.user : p.k === 'teacher' ? IC.book : IC.settings}</span>
            {t(p.label)}
          </button>
        ))}
      </div>
      <p className="form__note">{t(current.hint)}</p>

      <label className="field">
        <span className="field__label">{isStudentTab ? t('Login') : t('Email')}</span>
        <span className="ifield">
          <span className="ifield__ic">{isStudentTab ? IC.user : IC.mail}</span>
          <input
            className="input input--ic"
            type={isStudentTab ? 'text' : 'email'}
            required
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="username"
            placeholder={isStudentTab ? 'aliyev.vali' : 'ismfamiliya@email.uz'}
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
      {note && <p className="form__note form__note--err" role="alert">{note}</p>}
      <p className="form__note">
        <Link to="/forgot-password">{t('Parolni unutdingizmi?')}</Link>
        {isStudentTab && (
          <>
            {' · '}
            <Link to="/join">{t("Sinf kodi bilan ro'yxatdan o'tish")}</Link>
          </>
        )}
      </p>
    </form>
  )
}
