import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'

import { EmptyState } from '@/components/EmptyState'
import { Skeleton } from '@/components/Skeleton'
import { ColumnChart } from '@/features/portal/ColumnChart'
import { AttemptReview, type AttemptResult } from '@/features/portal/quiz'
import { ATTEMPT_KIND_LABEL, fmtDate, fmtDateTime, fmtDuration, PageHead, PercentPill } from '@/features/portal/ui'
import { api } from '@/lib/api/client'

import { useStudentResults } from './api'

export function StudentResults() {
  const { t } = useTranslation()
  const { data, isLoading } = useStudentResults()
  if (isLoading) return <Skeleton lines={6} />
  const rows = data ?? []
  const last = [...rows].reverse().slice(-12)

  return (
    <div>
      <PageHead title={t('Natijalarim')} sub={t("Barcha topshirgan test va masalalaringiz.")} />
      {!rows.length && <EmptyState title={t("Hali natija yo'q")} hint={t("Darsni ochib, test va masalalarni yeching.")} />}
      {last.length > 1 && (
        <section className="panel">
          <h3 className="panel__title">{t("So'nggi natijalar, %")}</h3>
          <ColumnChart ariaLabel={t("So'nggi natijalar, %")} max={100} format={(v) => `${Math.round(v)}`}
            data={last.map((r) => ({ label: fmtDate(r.submitted_at).slice(0, 5), value: r.percent, note: r.assignment_title || r.lesson_title }))} />
        </section>
      )}
      {rows.length > 0 && (
        <section className="panel">
          <div className="tablewrap">
            <table className="dtable">
              <thead>
                <tr><th>{t('Sana')}</th><th>{t('Mavzu')}</th><th>{t('Turi')}</th><th>{t('Vaqt')}</th><th>{t('Natija')}</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{fmtDateTime(r.submitted_at)}</td>
                    <td><Link to={`/s/results/${r.id}`}>{r.assignment_title || r.lesson_title || '—'}</Link></td>
                    <td>{t(ATTEMPT_KIND_LABEL[r.kind])}</td>
                    <td>{fmtDuration(r.duration_sec)}</td>
                    <td><PercentPill value={r.percent} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}

export function StudentResultDetail() {
  const { t } = useTranslation()
  const { id } = useParams()
  const { data, isLoading } = useQuery({
    queryKey: ['student', 'attempt', id],
    queryFn: async () => (await api.get<AttemptResult>(`/student/attempts/${id}/`)).data,
  })
  if (isLoading) return <Skeleton lines={6} />
  if (!data || !data.items) return <p className="prose">{t('Natija topilmadi.')}</p>
  return (
    <div>
      <Link to="/s/results" className="backlink">← {t('Natijalarim')}</Link>
      <PageHead title={data.assignment_title || data.lesson_title || t('Natija')} sub={fmtDateTime(data.submitted_at)} />
      <section className="panel"><AttemptReview result={data} /></section>
    </div>
  )
}
