import { useTranslation } from 'react-i18next'
import { Link, NavLink } from 'react-router-dom'

import { IC } from '@/icons'

export interface EduminNavItem {
  to: string
  label: string
  icon: keyof typeof IC
}

/** 2-rejim yon menyusi bo'limlarga ajratilgan — 1-rejimdagi yagona
 *  tekis ro'yxatdan asosiy tuzilmaviy farqi shu. Ro'yxatga kirmagan
 *  yangi marshrut yo'qolib qolmasligi uchun oxirgi bo'limga tushadi. */
const GROUPS: { title: string; paths: string[] }[] = [
  { title: 'Asosiy', paths: ['/'] },
  { title: "O'quv jarayoni", paths: ['/lessons', '/journal', '/timetable', '/library'] },
  { title: 'Tizim', paths: ['/statistics', '/admin', '/settings', '/about'] },
]

function groupItems(items: EduminNavItem[]) {
  const known = new Set(GROUPS.flatMap((g) => g.paths))
  const leftovers = items.filter((item) => !known.has(item.to))
  return GROUPS.map((g, gi) => ({
    title: g.title,
    items: [
      ...g.paths.flatMap((p) => items.filter((item) => item.to === p)),
      ...(gi === GROUPS.length - 1 ? leftovers : []),
    ],
  })).filter((g) => g.items.length > 0)
}

export function EduminSidebar({ items, onNav }: { items: EduminNavItem[]; onNav: () => void }) {
  const { t } = useTranslation()
  const groups = groupItems(items)

  return (
    <aside className="edside">
      <Link className="edside__brand" to="/" onClick={onNav}>
        <img className="edside__logo" src="/logo.png" alt="KO'RAGONIY EDU" width={40} height={40} />
        <span className="edside__bx">
          <span className="edside__name">KO'RAGONIY EDU</span>
          {/* `.brand__sig--day/--night` almashinuvi legacy.css'dagi
              `[data-theme="dark"]` qoidalari orqali bo'ladi (486-489) —
              shuning uchun shu klasslar qayta ishlatildi. */}
          <img className="brand__sig brand__sig--day" src="/sign-day.png" alt="Muhandis D" height={12} />
          <img className="brand__sig brand__sig--night" src="/sign-night.png" alt="Muhandis D" height={12} />
        </span>
      </Link>

      <nav className="edside__nav" aria-label={t('Asosiy navigatsiya')}>
        {groups.map((g) => (
          <div className="edside__sec" key={g.title}>
            <p className="edside__gt">{t(g.title)}</p>
            {g.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) => `edside__item ${isActive ? 'is-on' : ''}`}
                onClick={onNav}
              >
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
