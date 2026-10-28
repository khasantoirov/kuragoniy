import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useToast } from '@/components/Toast'
import { ChangePasswordForm, LogoutEverywhereButton, TelegramLinkBox } from '@/features/portal/AccountSecurity'
import { errText, PageHead } from '@/features/portal/ui'
import { themeIconMoon, themeIconSun } from '@/icons'
import { api } from '@/lib/api/client'
import { useAuth } from '@/lib/auth/AuthContext'
import { useUIStore, type Lang } from '@/store/uiStore'

const LANGS: { k: Lang; label: string }[] = [
  { k: 'uz', label: "O'zbekcha" },
  { k: 'ru', label: 'Ruscha' },
  { k: 'en', label: 'Inglizcha' },
]

export function StudentProfile() {
  const { t } = useTranslation()
  const { user, refreshMe } = useAuth()
  const { lang, setLang, theme, setTheme } = useUIStore()
  const toast = useToast()
  const [pwOpen, setPwOpen] = useState(false)
  const [code, setCode] = useState('')
  const [joining, setJoining] = useState(false)

  const join = async () => {
    setJoining(true)
    try {
      const res = await api.post<{ approved: boolean; class_name: string }>('/student/join/', { code: code.trim() })
      toast(res.data.approved ? `${t("Sinfga qo'shildingiz")}: ${res.data.class_name}` : t("So'rov yuborildi — o'qituvchi tasdiqlashini kuting."))
      setCode('')
      await refreshMe()
    } catch (err) {
      toast(t(errText(err)), 'error')
    } finally {
      setJoining(false)
    }
  }

  return (
    <div className="settings">
      <PageHead title={t('Profil')} />
      <section className="panel">
        <ul className="kv">
          <li><span>{t('Ism')}</span><b>{user?.name}</b></li>
          <li><span>{t('Login')}</span><b className="mono">{user?.username}</b></li>
          <li><span>{t('Sinf')}</span><b>{user?.student?.class_name || '—'}</b></li>
          <li><span>{t('Maktab')}</span><b>{user?.student?.school || '—'}</b></li>
          <li><span>{t("O'qituvchi")}</span><b>{user?.student?.teacher_name || '—'}</b></li>
        </ul>
        <p className="form__note">{t("Ismingizda xato bo'lsa, o'qituvchingizga ayting — u jurnalda tuzatadi.")}</p>
      </section>

      <section className="panel">
        <h3 className="panel__title">{t('Telegram')}</h3>
        <TelegramLinkBox />
      </section>

      <section className="panel">
        <h3 className="panel__title">{t('Hisob xavfsizligi')}</h3>
        {pwOpen ? <ChangePasswordForm onDone={() => setPwOpen(false)} /> : (
          <div className="panel__acts">
            <button type="button" className="btn btn--sm" onClick={() => setPwOpen(true)}>{t("Parolni o'zgartirish")}</button>
            <LogoutEverywhereButton />
          </div>
        )}
      </section>

      <section className="panel">
        <h3 className="panel__title">{t("Boshqa sinfga o'tish")}</h3>
        <p className="prose prose--note">{t("Yangi o'qituvchingiz bergan sinf kodini kiriting.")}</p>
        <div className="row row--2">
          <input className="input input--code" maxLength={12} placeholder="AB3K9XQ2" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          <button type="button" className="btn" onClick={join} disabled={joining || code.trim().length < 6}>{t("Qo'shilish")}</button>
        </div>
      </section>

      <section className="panel">
        <h3 className="panel__title">{t('Til va rejim')}</h3>
        <div className="settings__row">
          {LANGS.map((l) => (
            <button key={l.k} className={`chip settings__opt ${l.k === lang ? 'is-on' : ''}`} onClick={() => setLang(l.k)}>{t(l.label)}</button>
          ))}
          <button className={`chip settings__opt ${theme === 'light' ? 'is-on' : ''}`} onClick={() => setTheme('light')}>{themeIconMoon()} {t('Kunduzgi')}</button>
          <button className={`chip settings__opt ${theme === 'dark' ? 'is-on' : ''}`} onClick={() => setTheme('dark')}>{themeIconSun()} {t('Tungi')}</button>
        </div>
      </section>
    </div>
  )
}
