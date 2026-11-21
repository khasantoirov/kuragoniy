import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useTelegramConnect } from '@/features/portal/telegramConnect'
import { IC } from '@/icons'
import { useAuth } from '@/lib/auth/AuthContext'

/** "Keyinroq" hides the card on this device for a week. */
const QUIET_FOR_MS = 7 * 24 * 60 * 60 * 1000
const key = (userId: number | string) => `ke-tg-nudge:${userId}`

function quiet(userId?: number | string) {
  if (userId == null) return false
  try {
    return Number(localStorage.getItem(key(userId)) || 0) > Date.now()
  } catch {
    return false
  }
}

/**
 * Bosh sahifa card for a teacher with lessons in the timetable but no
 * Telegram linked: the daily lesson reminders (staffroom/reminders.py) go
 * to Telegram only, so until then they never arrive. One tap opens the bot;
 * back on the page, the card checks the link and goes away by itself.
 */
export function TelegramNudge({ hasLessons }: { hasLessons: boolean }) {
  const { t } = useTranslation()
  const { user, refreshMe } = useAuth()
  const { connect, busy } = useTelegramConnect()
  const [hidden, setHidden] = useState(() => quiet(user?.id))
  const [waiting, setWaiting] = useState(false)

  // back from Telegram (tab focus / app resumed): has the link gone through?
  useEffect(() => {
    if (!waiting) return
    const check = () => {
      if (document.visibilityState === 'visible') void refreshMe().catch(() => undefined)
    }
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    return () => {
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [waiting, refreshMe])

  if (!user || user.telegram_linked || user.viewing || !hasLessons || hidden) return null

  const later = () => {
    try {
      localStorage.setItem(key(user.id), String(Date.now() + QUIET_FOR_MS))
    } catch {
      // private mode: hidden until the page is reloaded
    }
    setHidden(true)
  }

  return (
    <section className="panel home__tg">
      <span className="home__tgic" aria-hidden="true">{IC.telegram}</span>
      <div className="home__tgbody">
        <h3 className="home__tgtitle">{t('Dars eslatmalarini Telegramda oling')}</h3>
        <p className="home__tgtext">
          {t("Dars kunlari ertalab bot bugungi darslaringizni, kechqurun esa jurnalga yozilmagan darslarni eslatadi.")}
        </p>
      </div>
      <div className="home__tgacts">
        <button type="button" className="btn btn--primary btn--sm" disabled={busy}
          onClick={async () => { if (await connect()) setWaiting(true) }}>
          {t('Telegramni ulash')}
        </button>
        <button type="button" className="btn btn--sm btn--ghost" onClick={later}>{t('Keyinroq')}</button>
      </div>
    </section>
  )
}
