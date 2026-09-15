import { useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { IC } from '@/icons'
import { useAnnouncementsSocket } from '@/lib/ws/useAnnouncementsSocket'

import { useAnnouncements, useApprovedUsers } from './api'
import { getSeenAt, subscribeSeen } from './seen'

const todayMD = () => {
  const d = new Date()
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const startOfToday = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Just the bell icon + unread dot — the panel itself is a full page
 * (/notifications) now, not a topbar dropdown, so it can't get dismissed
 * out from under someone and reads more comfortably on a phone. */
export function AnnouncementsBell() {
  const { t } = useTranslation()
  const { data: anns } = useAnnouncements()
  const { data: people } = useApprovedUsers()
  useAnnouncementsSocket(true)

  const seenAt = useSyncExternalStore(subscribeSeen, getSeenAt)
  const md = todayMD()
  const hasBirthdayToday = (people ?? []).some((p) => (p.bday || '').slice(5) === md)
  const hasUnreadAnn = (anns ?? []).some((a) => new Date(a.at).getTime() > seenAt)
  const hasUnread = (hasBirthdayToday && startOfToday() > seenAt) || hasUnreadAnn

  return (
    <Link className="iconbtn" to="/notifications" title={t('Bildirishnomalar')} aria-label={t('Bildirishnomalar')}>
      {IC.bell}
      {hasUnread && <span className="iconbtn__dot" />}
    </Link>
  )
}
