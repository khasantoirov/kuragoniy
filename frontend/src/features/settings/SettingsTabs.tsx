import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink, useLocation } from 'react-router-dom'

import { useTabScroll } from '@/components/PageTabs'
import { SETTINGS_PAGES } from '@/layouts/navItems'

/** Sozlamalar's pages as tabs — the side menu no longer lists them. */
export function SettingsTabs() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const ref = useRef<HTMLElement>(null)
  useTabScroll(ref, pathname)
  return (
    <nav ref={ref} className="seg settabs" aria-label={t('Sozlamalar')}>
      {SETTINGS_PAGES.map((p) => (
        <NavLink key={p.to} to={p.to} className={({ isActive }) => `seg__b ${isActive ? 'is-on' : ''}`}>
          {t(p.label)}
        </NavLink>
      ))}
    </nav>
  )
}
