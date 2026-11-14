import { useTranslation } from 'react-i18next'

import { Skeleton } from '@/components/Skeleton'
import { Meter } from '@/features/portal/ui'
import { IC } from '@/icons'

import { useBadges } from './api'
import './achievements.css'

const TIER_LABEL = ['', 'Bronza', 'Kumush', 'Oltin']

/** The badges one holds and how far to the next tier — staff (Reyting va
 * nishonlar) and pupils (profile) alike. */
export function BadgeGrid({ student = false }: { student?: boolean }) {
  const { t } = useTranslation()
  const { data, isLoading } = useBadges(student)
  if (isLoading) return <Skeleton lines={4} />
  if (!data?.length) return null
  const held = data.filter((b) => b.tier > 0).length
  return (
    <>
      <p className="achv__sum">{t("Olingan nishonlar")}: <b>{held}/{data.length}</b></p>
      <ul className="achv">
        {data.map((b) => (
          <li key={b.key} className={`achv__b achv__b--t${b.tier}`}>
            <span className="achv__ic" aria-hidden="true">{IC[b.icon] ?? IC.star}</span>
            <div className="achv__body">
              <b>{t(b.label)}</b>
              <small>{b.tier ? t(TIER_LABEL[b.tier]) : t('Hali olinmagan')}</small>
              {b.next != null ? (
                <>
                  <Meter value={b.value} max={b.next} label={t(b.label)} />
                  <small className="achv__next">{b.value} / {b.next} {t(b.unit)} — {t(TIER_LABEL[b.tier + 1])}</small>
                </>
              ) : (
                <small className="achv__next">✓ {b.value} {t(b.unit)} — {t('eng yuqori daraja')}</small>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}
