import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router-dom'

import { SETTINGS_PAGES } from '@/layouts/navItems'

/** Sozlamalar's pages as tabs — the side menu no longer lists them. */
export function SettingsTabs() {
  const { t } = useTranslation()
  return (
    <nav className="seg settabs" aria-label={t('Sozlamalar')}>
      {SETTINGS_PAGES.map((p) => (
        <NavLink key={p.to} to={p.to} className={({ isActive }) => `seg__b ${isActive ? 'is-on' : ''}`}>
          {t(p.label)}
        </NavLink>
      ))}
    </nav>
  )
}
