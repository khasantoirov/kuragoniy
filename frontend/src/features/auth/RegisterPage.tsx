import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { useToast } from '@/components/Toast'
import { IC } from '@/icons'
import { useAuth } from '@/lib/auth/AuthContext'

export function RegisterPage() {
  const { t } = useTranslation()
  const { register } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await register(email, name, password)
      navigate('/')
    } catch {
      toast(t("Ro'yxatdan o'tishda xatolik — email band bo'lishi mumkin"), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="form" onSubmit={onSubmit}>
      <label className="field">
        <span className="field__label">{t('Ism familiya')}</span>
        <span className="ifield">
          <span className="ifield__ic">{IC.user}</span>
          <input className="input input--ic" required placeholder="Muhandis D teacher" value={name} onChange={(e) => setName(e.target.value)} />
        </span>
      </label>
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
            minLength={8}
            autoComplete="new-password"
            placeholder={t('kamida 8 belgi')}
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
        {busy ? t('Yuborilmoqda…') : t('Ariza yuborish')}
      </button>
      <p className="form__note">{t("Ariza yuborilgach, administrator tasdiqlaydi. Tasdiqlangach kira olasiz.")}</p>
    </form>
  )
}
