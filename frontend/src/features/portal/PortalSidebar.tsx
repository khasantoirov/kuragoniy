import { useTranslation } from 'react-i18next'
import { Link, NavLink } from 'react-router-dom'

import { BrandMark } from '@/layouts/edumin/BrandMark'
import { IC } from '@/icons'

export interface PortalNavItem {
  to: string
  label: string
  icon: keyof typeof IC
  end?: boolean
}

/** Same look as the staff sidebar (edside* classes), but with explicit
 * groups — used by the student portal, whose routes the staff sidebar's
 * path-based grouping knows nothing about. */
export function PortalSidebar({ home, groups }: { home: string; groups: { title: string; items: PortalNavItem[] }[] }) {
  const { t } = useTranslation()
  return (
    <aside className="edside">
      <Link className="edside__brand" to={home}>
        <img className="edside__logo" src="/logo.png" alt="Amaliy Fizika" width={56} height={56} />
        <BrandMark />
      </Link>
      <nav className="edside__nav" aria-label={t('Asosiy navigatsiya')}>
        {groups.map((g) => (
          <div className="edside__sec" key={g.title}>
            <p className="edside__gt">{t(g.title)}</p>
            {g.items.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end}
                className={({ isActive }) => `edside__item ${isActive ? 'is-on' : ''}`}>
                <span className="edside__ic">{IC[item.icon]}</span>
                <span className="edside__lb">{t(item.label)}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  )
}
