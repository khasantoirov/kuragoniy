import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { useNotifyLive } from '@/features/notifications/liveStore'
import { IC } from '@/icons'

/** Bell + unread count — the inbox itself is a full page
 * (/notifications); the count comes from NotificationsLive's poll. */
export function AnnouncementsBell() {
  const { t } = useTranslation()
  const unread = useNotifyLive((s) => s.unread)
  return (
    <Link className="iconbtn" to="/notifications" title={t('Bildirishnomalar')} aria-label={t('Bildirishnomalar')}>
      {IC.bell}
      {unread > 0 && <span className="iconbtn__count">{unread > 99 ? '99+' : unread}</span>}
    </Link>
  )
}
