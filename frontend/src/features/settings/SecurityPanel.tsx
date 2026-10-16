import { isAxiosError } from 'axios'
import QRCode from 'qrcode'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useToast } from '@/components/Toast'
import { ChangePasswordForm, LogoutEverywhereButton } from '@/features/portal/AccountSecurity'
import { fmtDateTime } from '@/features/portal/ui'
import { IC } from '@/icons'
import { api } from '@/lib/api/client'
import { useAuth } from '@/lib/auth/AuthContext'

import { useRevokeSession, useSecurityLog, useSessions } from './api'

const errDetail = (err: unknown) => (isAxiosError<{ detail?: string }>(err) ? err.response?.data?.detail : undefined)

/** Two-step verification on/off (moved here from the old one-page Settings). */
export function TwoFactorBox() {
  const { t } = useTranslation()
  const { user, refreshMe } = useAuth()
  const toast = useToast()
  const [setupOpen, setSetupOpen] = useState(false)
  const [qr, setQr] = useState<string | null>(null)
  const [secret, setSecret] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [disableOpen, setDisableOpen] = useState(false)
  const [disablePw, setDisablePw] = useState('')

  const closeSetup = () => {
    setSetupOpen(false)
    setQr(null)
    setSecret('')
    setCode('')
  }

  const start = async () => {
    setBusy(true)
    try {
      const res = await api.post('/accounts/me/2fa/setup/')
      setSecret(res.data.secret)
      setQr(await QRCode.toDataURL(res.data.otpauth_url))
      setCode('')
      setSetupOpen(true)
    } catch (err) {
      toast(t(errDetail(err) ?? "Amalni bajarib bo'lmadi"), 'error')
    } finally {
      setBusy(false)
    }
  }

  const confirm = async () => {
    setBusy(true)
    try {
      await api.post('/accounts/me/2fa/confirm/', { code })
      await refreshMe()
      toast(t('Ikki bosqichli tasdiqlash yoqildi'))
      closeSetup()
    } catch (err) {
      toast(t(errDetail(err) ?? "Kod noto'g'ri"), 'error')
    } finally {
      setBusy(false)
    }
  }

  const disable = async () => {
    setBusy(true)
    try {
      await api.post('/accounts/me/2fa/disable/', { password: disablePw })
      await refreshMe()
      toast(t("Ikki bosqichli tasdiqlash o'chirildi"))
      setDisableOpen(false)
      setDisablePw('')
    } catch (err) {
      toast(t(errDetail(err) ?? "Amalni bajarib bo'lmadi"), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (user?.totp_enabled) {
    return disableOpen ? (
      <div className="pf__pw">
        <span className="ifield">
          <span className="ifield__ic">{IC.lock}</span>
          <input className="input input--ic input--pw" type="password" autoComplete="current-password"
            placeholder={t('Joriy parol')} value={disablePw} onChange={(e) => setDisablePw(e.target.value)} />
        </span>
        <div className="row row--2">
          <button type="button" className="btn btn--sm btn--danger" onClick={disable} disabled={busy}>{t("O'chirish")}</button>
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => { setDisableOpen(false); setDisablePw('') }}>{t('Bekor qilish')}</button>
        </div>
      </div>
    ) : (
      <div className="tgbox tgbox--on">
        <span>✅ {t('Yoqilgan')} — {t("kirishda tasdiqlash kodi so'raladi")}</span>
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => setDisableOpen(true)}>{t("O'chirish")}</button>
      </div>
    )
  }
  if (setupOpen) {
    return (
      <div className="pf__pw">
        <p className="prose prose--note">
          {t("Google Authenticator yoki shunga o'xshash ilovada QR kodni skanerlang, so'ng ilovada chiqqan 6 xonali kodni kiriting.")}
        </p>
        {qr && <img src={qr} alt="QR kod" className="totp-qr" />}
        <p className="prose prose--note">{t("QR skanerlab bo'lmasa, kalitni qo'lda kiriting:")} <code>{secret}</code></p>
        <label className="field">
          <span className="field__label">{t('Tasdiqlash kodi')}</span>
          <input className="input" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456"
            value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
        </label>
        <div className="row row--2">
          <button type="button" className="btn btn--sm btn--primary" onClick={confirm} disabled={busy || code.length !== 6}>{t('Tasdiqlash')}</button>
          <button type="button" className="btn btn--sm btn--ghost" onClick={closeSetup}>{t('Bekor qilish')}</button>
        </div>
      </div>
    )
  }
  return (
    <div className="tgbox">
      <span>{t("Hisobingizni parolga qo'shimcha kod bilan himoyalang.")}</span>
      <button type="button" className="btn btn--sm" onClick={start} disabled={busy}>{t('Yoqish')}</button>
    </div>
  )
}

const ACTION_LABEL: Record<string, string> = {
  login_ok: 'Kirish',
  login_failed: "Noto'g'ri parol",
  login_locked: 'Hisob bloklandi',
  password_changed: "Parol o'zgartirildi",
  password_reset_done: 'Parol tiklandi',
  password_reset_requested: "Parolni tiklash so'raldi",
  logout_all: 'Barcha qurilmalardan chiqildi',
  session_revoked: 'Qurilma chiqarildi',
  '2fa_enabled': 'Ikki bosqichli tasdiqlash yoqildi',
  '2fa_disabled': "Ikki bosqichli tasdiqlash o'chirildi",
}

const BAD_ACTIONS = new Set(['login_failed', 'login_locked', '2fa_disabled'])

export function SecurityTab() {
  const { t } = useTranslation()
  const [pwOpen, setPwOpen] = useState(false)
  const log = useSecurityLog()
  return (
    <div className="setgrid">
      <section className="panel">
        <h3 className="panel__title">{t("Parolni o'zgartirish")}</h3>
        <p className="prose prose--note">{t("Yangi parol saqlangach, boshqa barcha qurilmalardagi seanslar yopiladi.")}</p>
        {pwOpen ? <ChangePasswordForm onDone={() => setPwOpen(false)} />
          : <button type="button" className="btn btn--sm" onClick={() => setPwOpen(true)}>{IC.lock} {t("O'zgartirish")}</button>}
      </section>
      <section className="panel">
        <h3 className="panel__title">{t('Ikki bosqichli tasdiqlash')}</h3>
        <TwoFactorBox />
      </section>
      <section className="panel setgrid__wide">
        <h3 className="panel__title">{t('Kirishlar tarixi')}</h3>
        {log.data?.length ? (
          <ul className="seclog">
            {log.data.map((r) => (
              <li key={r.id} className={`seclog__row ${BAD_ACTIONS.has(r.action) ? 'is-bad' : ''}`}>
                <span className="seclog__what">{t(ACTION_LABEL[r.action] ?? r.action)}</span>
                <span className="seclog__dev">{[r.device, r.ip].filter(Boolean).join(' · ')}</span>
                <span className="seclog__at">{fmtDateTime(r.at)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="prose prose--note">{t("Hali yozuv yo'q.")}</p>}
      </section>
    </div>
  )
}

export function SessionsTab() {
  const { t } = useTranslation()
  const toast = useToast()
  const sessions = useSessions()
  const revoke = useRevokeSession()

  const onRevoke = async (id: number) => {
    try {
      await revoke.mutateAsync(id)
      toast(t('Qurilma hisobdan chiqarildi'))
    } catch (err) {
      toast(t(errDetail(err) ?? "Amalni bajarib bo'lmadi"), 'error')
    }
  }

  return (
    <section className="panel">
      <div className="thead">
        <h3 className="panel__title">{t('Aktiv seanslar')}</h3>
        <LogoutEverywhereButton />
      </div>
      <p className="prose prose--note">
        {t("Hisobingiz ochiq turgan qurilmalar. Tanimagan qurilmani chiqaring va parolni almashtiring. Chiqarilgan qurilma 15 daqiqa ichida tizimdan chiqadi.")}
      </p>
      {sessions.data?.length ? (
        <ul className="sesslist">
          {sessions.data.map((s) => (
            <li key={s.id} className={`sess ${s.current ? 'is-current' : ''}`}>
              <span className="sess__ic">{s.mobile ? IC.smartphone : IC.monitor}</span>
              <span className="sess__txt">
                <span className="sess__nm">{s.label} {s.current && <em className="sess__cur">{t('Joriy qurilma')}</em>}</span>
                <span className="sess__meta">
                  {s.ip ? `${s.ip} · ` : ''}{t('Oxirgi faollik')}: {fmtDateTime(s.last_seen_at)} · {t('Kirgan')}: {fmtDateTime(s.created_at)}
                </span>
              </span>
              {!s.current && (
                <button type="button" className="btn btn--sm btn--ghost sess__out" onClick={() => onRevoke(s.id)} disabled={revoke.isPending}>
                  {IC.logout} {t('Chiqarish')}
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="prose prose--note">{t("Bu ro'yxat yangilanishdan keyingi kirishlardan boshlab yuritiladi — hozircha yozuv yo'q.")}</p>
      )}
    </section>
  )
}
