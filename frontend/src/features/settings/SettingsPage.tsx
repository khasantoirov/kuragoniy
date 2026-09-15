import { isAxiosError } from 'axios'
import QRCode from 'qrcode'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useToast } from '@/components/Toast'
import { IC, themeIconMoon, themeIconSun } from '@/icons'
import { api } from '@/lib/api/client'
import { isAdmin, useAuth } from '@/lib/auth/AuthContext'
import { TELEGRAM_BOT_USERNAME } from '@/lib/config'
import { NavRail, type RailItem } from '@/layouts/NavRail'
import { NAV_STYLES } from '@/layouts/navStyles'
import { useUIStore, type Lang, type Theme, type ViewMode } from '@/store/uiStore'

const LANGS: { k: Lang; label: string }[] = [
  { k: 'uz', label: "O'zbekcha" },
  { k: 'ru', label: 'Ruscha' },
  { k: 'en', label: 'Inglizcha' },
]

const PREVIEW_LABELS: [keyof typeof IC, string][] = [
  ['home', 'Bosh sahifa'],
  ['atom', 'Darslar'],
  ['clipboard', 'Jurnal'],
  ['calendar', 'Jadval'],
  ['book', 'Kutubxona'],
]

export function SettingsPage() {
  const { t } = useTranslation()
  const { user, refreshMe } = useAuth()
  const { lang, setLang, theme, setTheme, navStyle, setNavStyle, viewMode, setViewMode } = useUIStore()
  const toast = useToast()
  const realAdmin = isAdmin(user ?? null)

  const [pwOpen, setPwOpen] = useState(false)
  const [curPw, setCurPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [newPw2, setNewPw2] = useState('')
  const [showCurPw, setShowCurPw] = useState(false)
  const [showNewPw, setShowNewPw] = useState(false)
  const [pwBusy, setPwBusy] = useState(false)

  const [totpSetupOpen, setTotpSetupOpen] = useState(false)
  const [totpQr, setTotpQr] = useState<string | null>(null)
  const [totpSecret, setTotpSecret] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [totpBusy, setTotpBusy] = useState(false)
  const [totpDisableOpen, setTotpDisableOpen] = useState(false)
  const [totpDisablePw, setTotpDisablePw] = useState('')

  const previewItems: RailItem[] = PREVIEW_LABELS.map(([icon, label]) => ({ to: label, icon: IC[icon], label: t(label) }))
  const previewActive = previewItems[2].to

  const connectTelegram = () => {
    if (!TELEGRAM_BOT_USERNAME) {
      toast(t('Bot hali sozlanmagan'), 'error')
      return
    }
    window.open(`https://t.me/${TELEGRAM_BOT_USERNAME}?start=${user?.id}`, '_blank', 'noopener')
    toast(t("Botda 'Start' bosing. So'ng bu oynani yopib qayta oching."))
  }

  const disconnectTelegram = async () => {
    try {
      await api.patch('/accounts/me/', { telegram_linked: false, telegram_chat_id: null, telegram_username: '' })
      await refreshMe()
      toast(t('Telegram uzildi'))
    } catch (err) {
      toast(`${t('Xatolik: ')}${err instanceof Error ? err.message : ''}`, 'error')
    }
  }

  const closePwForm = () => {
    setPwOpen(false)
    setCurPw('')
    setNewPw('')
    setNewPw2('')
    setShowCurPw(false)
    setShowNewPw(false)
  }

  const onChangePassword = async () => {
    if (newPw.length < 8) return toast(t("Parol kamida 8 belgidan iborat bo'lishi kerak."), 'error')
    if (newPw !== newPw2) return toast(t('Parollar mos kelmadi'), 'error')
    setPwBusy(true)
    try {
      await api.post('/accounts/me/change-password/', { current_password: curPw, new_password: newPw })
      toast(t('Parol yangilandi.'))
      closePwForm()
    } catch (err) {
      toast(t(errDetail(err) ?? "Amalni bajarib bo'lmadi"), 'error')
    } finally {
      setPwBusy(false)
    }
  }

  const errDetail = (err: unknown) => (isAxiosError<{ detail?: string }>(err) ? err.response?.data?.detail : undefined)

  const closeTotpSetup = () => {
    setTotpSetupOpen(false)
    setTotpQr(null)
    setTotpSecret('')
    setTotpCode('')
  }

  const startTotpSetup = async () => {
    setTotpBusy(true)
    try {
      const res = await api.post('/accounts/me/2fa/setup/')
      setTotpSecret(res.data.secret)
      setTotpQr(await QRCode.toDataURL(res.data.otpauth_url))
      setTotpCode('')
      setTotpSetupOpen(true)
    } catch (err) {
      toast(t(errDetail(err) ?? "Amalni bajarib bo'lmadi"), 'error')
    } finally {
      setTotpBusy(false)
    }
  }

  const confirmTotpSetup = async () => {
    setTotpBusy(true)
    try {
      await api.post('/accounts/me/2fa/confirm/', { code: totpCode })
      await refreshMe()
      toast(t('Ikki bosqichli tasdiqlash yoqildi'))
      closeTotpSetup()
    } catch (err) {
      toast(t(errDetail(err) ?? "Kod noto'g'ri"), 'error')
    } finally {
      setTotpBusy(false)
    }
  }

  const disableTotp = async () => {
    setTotpBusy(true)
    try {
      await api.post('/accounts/me/2fa/disable/', { password: totpDisablePw })
      await refreshMe()
      toast(t("Ikki bosqichli tasdiqlash o'chirildi"))
      setTotpDisableOpen(false)
      setTotpDisablePw('')
    } catch (err) {
      toast(t(errDetail(err) ?? "Amalni bajarib bo'lmadi"), 'error')
    } finally {
      setTotpBusy(false)
    }
  }

  const applyViewMode = (m: ViewMode) => setViewMode(m)

  return (
    <div className="settings">
      <h2 className="settings__title">{t('Sozlamalar')}</h2>

      <div className="panel">
        <h3 className="panel__title">{t('Til')}</h3>
        <div className="settings__row">
          {LANGS.map((l) => (
            <button key={l.k} className={`chip settings__opt ${l.k === lang ? 'is-on' : ''}`} onClick={() => setLang(l.k)}>
              {t(l.label)}
            </button>
          ))}
        </div>
      </div>

      <div className="panel">
        <h3 className="panel__title">{t('Rejim')}</h3>
        <div className="settings__row">
          {(
            [
              ['light', themeIconSun, 'Kunduzgi'],
              ['dark', themeIconMoon, 'Tungi'],
            ] as [Theme, typeof themeIconSun, string][]
          ).map(([k, Ic, label]) => (
            <button key={k} className={`chip settings__opt ${k === theme ? 'is-on' : ''}`} onClick={() => setTheme(k)}>
              <Ic /> {t(label)}
            </button>
          ))}
        </div>
      </div>

      <div className="panel">
        <h3 className="panel__title">{t('Telegram')}</h3>
        {user?.telegram_linked ? (
          <div className="tgbox tgbox--on">
            <span>✅ {t('Ulangan')} {user.telegram_username ? `(@${user.telegram_username})` : ''} — {t("e'lonlar Telegramga keladi")}</span>
            <button type="button" className="btn btn--sm btn--ghost" onClick={disconnectTelegram}>{t('Uzish')}</button>
          </div>
        ) : (
          <div className="tgbox">
            <span>{t("E'lonlarni Telegramda ham olish uchun hisobingizni ulang.")}</span>
            <button type="button" className="btn btn--sm" onClick={connectTelegram}>{t('Telegramni ulash')}</button>
          </div>
        )}
      </div>

      <div className="panel">
        <h3 className="panel__title">{t("Parolni o'zgartirish")}</h3>
        {pwOpen ? (
          <div className="pf__pw">
            <span className="ifield">
              <span className="ifield__ic">{IC.lock}</span>
              <input
                className="input input--ic input--pw"
                type={showCurPw ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder={t('Joriy parol')}
                value={curPw}
                onChange={(e) => setCurPw(e.target.value)}
              />
              <button
                type="button"
                className={`ifield__eye ${showCurPw ? 'is-on' : ''}`}
                aria-label={t("Parolni ko'rsatish")}
                onClick={() => setShowCurPw((v) => !v)}
              >
                {showCurPw ? IC.eyeOff : IC.eye}
              </button>
            </span>
            <span className="ifield">
              <span className="ifield__ic">{IC.lock}</span>
              <input
                className="input input--ic input--pw"
                type={showNewPw ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder={t('Yangi parol')}
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
              />
              <button
                type="button"
                className={`ifield__eye ${showNewPw ? 'is-on' : ''}`}
                aria-label={t("Parolni ko'rsatish")}
                onClick={() => setShowNewPw((v) => !v)}
              >
                {showNewPw ? IC.eyeOff : IC.eye}
              </button>
            </span>
            <span className="ifield">
              <span className="ifield__ic">{IC.lock}</span>
              <input
                className="input input--ic input--pw"
                type={showNewPw ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder={t('Yangi parolni takrorlang')}
                value={newPw2}
                onChange={(e) => setNewPw2(e.target.value)}
              />
            </span>
            <div className="row row--2">
              <button type="button" className="btn btn--sm btn--primary" onClick={onChangePassword} disabled={pwBusy}>
                {t('Parolni yangilash')}
              </button>
              <button type="button" className="btn btn--sm btn--ghost" onClick={closePwForm}>
                {t('Bekor qilish')}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn btn--sm" onClick={() => setPwOpen(true)}>
            {t("Parolni o'zgartirish")}
          </button>
        )}
      </div>

      <div className="panel">
        <h3 className="panel__title">{t('Ikki bosqichli tasdiqlash')}</h3>
        {user?.totp_enabled ? (
          totpDisableOpen ? (
            <div className="pf__pw">
              <span className="ifield">
                <span className="ifield__ic">{IC.lock}</span>
                <input
                  className="input input--ic input--pw"
                  type="password"
                  autoComplete="current-password"
                  placeholder={t('Joriy parol')}
                  value={totpDisablePw}
                  onChange={(e) => setTotpDisablePw(e.target.value)}
                />
              </span>
              <div className="row row--2">
                <button type="button" className="btn btn--sm btn--danger" onClick={disableTotp} disabled={totpBusy}>
                  {t("O'chirish")}
                </button>
                <button
                  type="button"
                  className="btn btn--sm btn--ghost"
                  onClick={() => { setTotpDisableOpen(false); setTotpDisablePw('') }}
                >
                  {t('Bekor qilish')}
                </button>
              </div>
            </div>
          ) : (
            <div className="tgbox tgbox--on">
              <span>✅ {t('Yoqilgan')} — {t('kirishda tasdiqlash kodi so\'raladi')}</span>
              <button type="button" className="btn btn--sm btn--ghost" onClick={() => setTotpDisableOpen(true)}>
                {t("O'chirish")}
              </button>
            </div>
          )
        ) : totpSetupOpen ? (
          <div className="pf__pw">
            <p className="prose prose--note">
              {t("Google Authenticator yoki shunga o'xshash ilovada QR kodni skanerlang, so'ng ilovada chiqqan 6 xonali kodni kiriting.")}
            </p>
            {totpQr && <img src={totpQr} alt="QR kod" className="totp-qr" />}
            <p className="prose prose--note">
              {t("QR skanerlab bo'lmasa, kalitni qo'lda kiriting:")} <code>{totpSecret}</code>
            </p>
            <label className="field">
              <span className="field__label">{t('Tasdiqlash kodi')}</span>
              <input
                className="input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="123456"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
              />
            </label>
            <div className="row row--2">
              <button
                type="button"
                className="btn btn--sm btn--primary"
                onClick={confirmTotpSetup}
                disabled={totpBusy || totpCode.length !== 6}
              >
                {t('Tasdiqlash')}
              </button>
              <button type="button" className="btn btn--sm btn--ghost" onClick={closeTotpSetup}>
                {t('Bekor qilish')}
              </button>
            </div>
          </div>
        ) : (
          <div className="tgbox">
            <span>{t("Hisobingizni parolga qo'shimcha kod bilan himoyalang.")}</span>
            <button type="button" className="btn btn--sm" onClick={startTotpSetup} disabled={totpBusy}>
              {t('Yoqish')}
            </button>
          </div>
        )}
      </div>

      {realAdmin && (
        <div className="panel">
          <h3 className="panel__title">{t("Ko'rish rejimi")}</h3>
          <div className="pf__mode">
            <button type="button" className={`grade ${viewMode === 'admin' ? 'is-on' : ''}`} onClick={() => applyViewMode('admin')}>
              {t('Admin')}
            </button>
            <button type="button" className={`grade ${viewMode === 'teacher' ? 'is-on' : ''}`} onClick={() => applyViewMode('teacher')}>
              {t("O'qituvchi")}
            </button>
          </div>
          <p className="form__note">{t("Platformani oddiy o'qituvchi qanday ko'rishini shu yerdan tekshirasiz.")}</p>
        </div>
      )}

      <div className="panel panel--mobile-only">
        <h3 className="panel__title">{t('Pastki navigatsiya uslubi')}</h3>
        <p className="prose prose--note">{t("Tugmalar pastki navigatsiya panelida qanday ko'rinishini tanlang.")}</p>
        <p className="prose prose--note">{t("Faqat mobil ko'rinishga tegishli — desktopda tepadagi navigatsiya ishlatiladi.")}</p>
        <div className="navstyle-grid">
          {NAV_STYLES.map((s) => (
            <button
              key={s.key}
              className={`navstyle-card ${s.key === navStyle ? 'is-on' : ''}`}
              onClick={() => setNavStyle(s.key)}
            >
              <span className="navstyle-card__preview">
                <NavRail items={previewItems} activeTo={previewActive} styleKey={s.key} interactive={false} />
              </span>
              <span className="navstyle-card__name">{s.label}</span>
              <span className="navstyle-card__desc">{t(s.desc)}</span>
              {s.key === navStyle && <span className="navstyle-card__check">{IC.check2}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
