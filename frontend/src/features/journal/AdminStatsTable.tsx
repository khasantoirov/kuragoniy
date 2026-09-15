import { useTranslation } from 'react-i18next'

import { Skeleton } from '@/components/Skeleton'

import { useAdminStats } from './api'

export function AdminStatsTable({ chorak }: { chorak: number | 'u' }) {
  const { t } = useTranslation()
  const { data: rows, isLoading } = useAdminStats(chorak)

  if (isLoading) return <Skeleton lines={4} />

  if (!rows?.length) {
    return <p className="prose">{chorak === 'u' ? t("Hali yozuv yo'q.") : t('Bu chorakda hali yozuv yo\'q.')}</p>
  }

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>{t("O'qituvchi")}</th>
            <th>{t('Maktab')}</th>
            <th>{t('Sinf')}</th>
            <th className="table__q">{t("O'quvchi")}</th>
            <th className="table__q">{t('Darslar soni')}</th>
            <th className="table__q">{t("O'rtacha")}</th>
            <th className="table__q">{t("O'zlashtirish")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="table__name">{r.teacher}</td>
              <td>{r.school}</td>
              <td>{r.cls}</td>
              <td className="table__q">{r.students}</td>
              <td className="table__q">{r.days}</td>
              <td className="table__q">{r.avg ? r.avg.toFixed(2) : '—'}</td>
              <td className="table__q">{r.pct !== null ? r.pct + '%' : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
