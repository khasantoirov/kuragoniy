import { useTranslation } from 'react-i18next'

const pad = (n: number) => String(n).padStart(2, '0')

/** "bugun 14:32" / "kecha 09:05" / "12.10.2026 18:40" — hour:minute is
 * what people actually ask for ("qachon chiqqan"). */
export function fmtLastSeen(iso: string, t: (s: string) => string): string {
  const d = new Date(iso)
  const now = new Date()
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const dayDiff = Math.round((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400000)
  if (dayDiff === 0) return `${t('bugun')} ${hm}`
  if (dayDiff === 1) return `${t('kecha')} ${hm}`
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${hm}`
}

/** Online dot or "last seen" time. */
export function Presence({ online, lastSeen }: { online?: boolean; lastSeen?: string | null }) {
  const { t } = useTranslation()
  if (online) {
    return <span className="presence presence--on"><span className="presence__dot" aria-hidden="true" />{t('Onlayn')}</span>
  }
  if (!lastSeen) return <span className="presence">{t('hali kirmagan')}</span>
  return (
    <span className="presence" title={t('Oxirgi faollik')}>
      <span className="presence__dot" aria-hidden="true" />{fmtLastSeen(lastSeen, t)}
    </span>
  )
}
