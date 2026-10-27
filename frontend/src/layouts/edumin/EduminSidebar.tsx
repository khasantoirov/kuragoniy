import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { useNotifyLive } from '@/features/notifications/liveStore'
import type { IC } from '@/icons'
import { TOPBAR_ONLY } from '@/layouts/navItems'

import { Sidebar } from './Sidebar'

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
  { title: "Sinf va o'quvchilar", paths: ['/class-stats', '/students', '/assignments', '/readiness', '/reports', '/games'] },
  { title: 'Tahlil', paths: ['/statistics', '/manage', '/results', '/manage/schools', '/manage/database'] },
  { title: "Ma'muriyat", paths: ['/admin', '/manage/reports', '/manage/awards', '/manage/security', '/guide'] },
  { title: 'Resurslar', paths: ['/manage/materials', '/equipment-sheet', '/shop', '/manage/shop'] },
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
  const unread = useNotifyLive((s) => s.unread)
  const groups = groupItems(items.filter((item) => !TOPBAR_ONLY.has(item.to))).map((g) => ({
    title: g.title,
    items: g.items.map((item) => ({
      ...item,
      end: item.to === '/' || item.to === '/manage',
      badge: item.to === '/notifications' ? unread : undefined,
    })),
  }))

  return (
    <Sidebar
      home="/"
      groups={groups}
      onNav={onNav}
      footer={
        <Link className="edside__made" to="/about" onClick={onNav}>
          {t('Dastur yaratuvchisi')}: Hasan Toirov
        </Link>
      }
    />
  )
}
