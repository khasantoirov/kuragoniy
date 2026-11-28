import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { Avatar } from '@/components/Avatar'
import { roleLabel } from '@/components/roleLabel'
import { useNotifyLive } from '@/features/notifications/liveStore'
import { IC } from '@/icons'
import { TOPBAR_ONLY } from '@/layouts/navItems'
import { useAuth } from '@/lib/auth/AuthContext'

import { Sidebar } from './Sidebar'

export interface EduminNavItem {
  to: string
  label: string
  icon: keyof typeof IC
}

/** 2-rejim yon menyusi bo'limlarga ajratilgan — 1-rejimdagi yagona
 *  tekis ro'yxatdan asosiy tuzilmaviy farqi shu. Ro'yxatga kirmagan
 *  yangi marshrut yo'qolib qolmasligi uchun Ma'muriyat bo'limiga tushadi. */
const GROUPS: { title: string; paths: string[]; rest?: boolean; cls?: string; key?: string }[] = [
  { title: 'Asosiy', paths: ['/', '/my-school'] },
  { title: "O'quv jarayoni", paths: ['/lessons', '/journal', '/timetable', '/assignments', '/reports', '/achievements', '/feed', '/library', '/lab'] },
  // the owner's mock-ups: preparation and subscriptions as a group of their own
  { title: 'Tayyorgarlik va obuna', paths: ['/staffroom', '/training', '/obuna', '/shop'] },
  { title: "Ma'muriyat", paths: ['/statistics', '/manage/schools', '/manage/equipment', '/equipment-sheet', '/guide'], rest: true },
  // no heading: these simply close the menu, at its bottom
  { title: '', paths: ['/qollanmalar', '/settings', '/about', '/help'] },
  // the very last, apart (owner, 2026-11-28): over to admin.kuragoniy.uz, signed in
  { title: '', paths: ['/admin'], cls: 'edside__sec--panel', key: '_panel' },
]

function groupItems(items: EduminNavItem[]) {
  const known = new Set(GROUPS.flatMap((g) => g.paths))
  const leftovers = items.filter((item) => !known.has(item.to))
  return GROUPS.map((g) => ({
    title: g.title,
    cls: g.cls,
    key: g.key,
    items: [
      ...g.paths.flatMap((p) => items.filter((item) => item.to === p)),
      ...(g.rest ? leftovers : []),
    ],
  })).filter((g) => g.items.length > 0)
}

/** The bottom-left corner: the photo, name and role (opens the profile),
 * and a way out. */
function SideAccount({ onNav }: { onNav: () => void }) {
  const { t } = useTranslation()
  const { user, logout } = useAuth()
  if (!user) return null
  return (
    <div className="edside__acct">
      <Link className="edside__me" to="/settings/profile" onClick={onNav} title={t('Profil')}>
        <Avatar name={user.name} photo={user.photo} className="edside__av" />
        <span className="edside__who">
          <b className="edside__nm">{user.name}</b>
          <small className="edside__role">{t(roleLabel(user))}</small>
        </span>
      </Link>
      <button type="button" className="edside__out" onClick={() => logout()} title={t('Chiqish')} aria-label={t('Chiqish')}>
        {IC.logout}
      </button>
    </div>
  )
}

export function EduminSidebar({ items, onNav }: { items: EduminNavItem[]; onNav: () => void }) {
  const unread = useNotifyLive((s) => s.unread)
  const groups = groupItems(items.filter((item) => !TOPBAR_ONLY.has(item.to))).map((g) => ({
    title: g.title,
    cls: g.cls,
    key: g.key,
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
      account={<SideAccount onNav={onNav} />}
    />
  )
}
