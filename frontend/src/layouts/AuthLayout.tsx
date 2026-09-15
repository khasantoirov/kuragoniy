import { useTranslation } from 'react-i18next'
import { Link, Outlet, useLocation } from 'react-router-dom'

import { themeIconMoon, themeIconSun } from '@/icons'
import { useUIStore, type Lang } from '@/store/uiStore'

const LANGS: { k: Lang; label: string }[] = [
  { k: 'uz', label: "O'zbekcha" },
  { k: 'ru', label: 'Русский' },
  { k: 'en', label: 'English' },
]

export function AuthLayout() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const { lang, setLang, theme, toggleTheme } = useUIStore()
  const isReg = pathname === '/register'

  return (
    <div className="gate">
      <div className="gate__card">
        <div className="gate__brand">
          <img className="gate__logo" src="/logo.png" alt="STEM LMS" />
          <div className="gate__bx">
            <span className="gate__name">STEM LMS</span>
            <img className="gate__sign gate__sign--day" src="/sign-day.png" alt="Muhandis D" />
            <img className="gate__sign gate__sign--night" src="/sign-night.png" alt="Muhandis D" />
          </div>
        </div>

        <div className="gate__forms">
          <div className="tabs" role="tablist">
            <Link to="/login" className={`tab ${!isReg ? 'is-active' : ''}`} role="tab">
              {t('Kirish')}
            </Link>
            <Link to="/register" className={`tab ${isReg ? 'is-active' : ''}`} role="tab">
              {t("Ro'yxatdan o'tish")}
            </Link>
          </div>

          <Outlet />

          <div className="gate__opts">
            {LANGS.map((l) => (
              <button key={l.k} type="button" className={`gopt ${l.k === lang ? 'is-on' : ''}`} onClick={() => setLang(l.k)}>
                {l.label}
              </button>
            ))}
            <button type="button" className="gopt gopt--th" title={t('Rejim')} onClick={toggleTheme}>
              {theme === 'dark' ? themeIconMoon() : themeIconSun()}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
