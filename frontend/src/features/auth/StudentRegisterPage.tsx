import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'

import { errText } from '@/features/portal/ui'
import { IC } from '@/icons'
import { api } from '@/lib/api/client'
import { homePathFor, useAuth } from '@/lib/auth/AuthContext'

interface JoinInfo {
  class_name: string
  school: string
  teacher_name: string
  auto_approve: boolean
}

/** Student self-registration with the class join code the teacher shows
 * on the board. Step 1 checks the code (so a typo is caught before the
 * form), step 2 creates the account and logs straight in. */
export function StudentRegisterPage() {
  const { t } = useTranslation()
  const { login } = useAuth()
  const navigate = useNavigate()
  const [code, setCode] = useState(() => new URLSearchParams(window.location.search).get('code') ?? '')
  const [info, setInfo] = useState<JoinInfo | null>(null)
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  const checkCode = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setNote('')
    try {
      const res = await api.get<JoinInfo>('/student/join-info/', { params: { code: code.trim() } })
      setInfo(res.data)
    } catch (err) {
      setNote(t(errText(err, 'Kod topilmadi yoki faol emas.')))
    } finally {
      setBusy(false)
    }
  }

  const register = async (e: FormEvent) => {
    e.preventDefault()
    if (password !== password2) return setNote(t('Parollar mos kelmadi'))
    setBusy(true)
    setNote('')
    try {
      const res = await api.post<{ username: string; approved: boolean }>('/student/register/', {
        code: code.trim(),
        full_name: fullName,
        username: username.trim().toLowerCase(),
        password,
      })
      const result = await login(res.data.username, password)
      if (!result.totpRequired) navigate(homePathFor(result.user))
    } catch (err) {
      setNote(t(errText(err)))
    } finally {
      setBusy(false)
    }
  }

  if (!info) {
    return (
      <form className="form" onSubmit={checkCode}>
        <p className="form__note">{t("O'qituvchingiz bergan 8 belgili sinf kodini kiriting.")}</p>
        <label className="field">
          <span className="field__label">{t('Sinf kodi')}</span>
          <input
            className="input input--code"
            required
            autoFocus
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={12}
            placeholder="AB3K9XQ2"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </label>
        <button className="btn btn--primary btn--block" type="submit" disabled={busy}>
          {busy ? t('Tekshirilmoqda…') : t('Davom etish')}
        </button>
        {note && <p className="form__note form__note--err" role="alert">{note}</p>}
        <p className="form__note">
          {t('Hisobingiz bormi?')} <Link to="/login">{t('Kirish')}</Link>
        </p>
      </form>
    )
  }

  return (
    <form className="form" onSubmit={register}>
      <div className="joininfo">
        <strong>{info.class_name}</strong>
        <span>{info.school}</span>
        <span>{t("O'qituvchi")}: {info.teacher_name}</span>
      </div>
      <label className="field">
        <span className="field__label">{t('Familiya va ism')}</span>
        <span className="ifield">
          <span className="ifield__ic">{IC.user}</span>
          <input className="input input--ic" required minLength={5} maxLength={150} placeholder="Aliyev Vali"
            value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </span>
      </label>
      <label className="field">
        <span className="field__label">{t('Login')} <span className="field__opt">({t("ixtiyoriy — bo'sh qolsa, ismingizdan yasaladi")})</span></span>
        <input className="input" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={30}
          pattern="[a-zA-Z0-9][a-zA-Z0-9._]{2,29}" placeholder="vali.aliyev"
          value={username} onChange={(e) => setUsername(e.target.value)} />
      </label>
      <label className="field">
        <span className="field__label">{t('Parol')}</span>
        <span className="ifield">
          <span className="ifield__ic">{IC.lock}</span>
          <input className="input input--ic input--pw" type={showPw ? 'text' : 'password'} required minLength={8}
            autoComplete="new-password" placeholder={t('kamida 8 belgi')} value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="button" className={`ifield__eye ${showPw ? 'is-on' : ''}`} aria-label={t("Parolni ko'rsatish")}
            onClick={() => setShowPw((v) => !v)}>{showPw ? IC.eyeOff : IC.eye}</button>
        </span>
      </label>
      <label className="field">
        <span className="field__label">{t('Parolni takrorlang')}</span>
        <input className="input" type={showPw ? 'text' : 'password'} required minLength={8} autoComplete="new-password"
          value={password2} onChange={(e) => setPassword2(e.target.value)} />
      </label>
      <button className="btn btn--primary btn--block" type="submit" disabled={busy}>
        {busy ? t('Yuborilmoqda…') : t("Ro'yxatdan o'tish")}
      </button>
      {note && <p className="form__note form__note--err" role="alert">{note}</p>}
      <p className="form__note">
        {info.auto_approve
          ? t("Ro'yxatdan o'tgach darhol kira olasiz.")
          : t("Ro'yxatdan o'tgach, o'qituvchingiz tasdiqlaydi.")}{' '}
        <button type="button" className="linklike" onClick={() => setInfo(null)}>{t('Boshqa kod')}</button>
      </p>
    </form>
  )
}
