import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { AttemptSummary } from '@/features/learning/api'
import { ATTEMPT_KIND_LABEL, fmtDateTime, PercentPill } from '@/features/portal/ui'
import { api } from '@/lib/api/client'
import type { Paginated } from '@/lib/api/types'

import { AttemptModal } from './AssignmentsPage'

/** The live feed of the latest submissions — a click opens the attempt. */
export function RecentAttempts() {
  const { t } = useTranslation()
  const [open, setOpen] = useState<number | null>(null)
  const feed = useQuery({
    queryKey: ['learning', 'attempt-feed'],
    queryFn: async () => (await api.get<Paginated<AttemptSummary>>('/learning/attempts/')).data.results,
  })

  return (
    <>
      <section className="panel">
        <h3 className="panel__title">{t("So'nggi topshirilgan ishlar")}</h3>
        {feed.data?.length ? (
          <div className="tablewrap">
            <table className="dtable">
              <thead><tr><th>{t('Vaqt')}</th><th>{t("O'quvchi")}</th><th>{t('Mavzu')}</th><th>{t('Turi')}</th><th>{t('Natija')}</th></tr></thead>
              <tbody>
                {feed.data.map((a) => (
                  <tr key={a.id}>
                    <td>{fmtDateTime(a.submitted_at)}</td>
                    <td><button className="linklike" onClick={() => setOpen(a.id)}>{a.user_name}</button></td>
                    <td>{a.assignment_title || a.lesson_title}</td>
                    <td>{t(ATTEMPT_KIND_LABEL[a.kind])}</td>
                    <td><PercentPill value={a.percent} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="prose prose--note">{t("Hali topshirilgan ish yo'q.")}</p>}
      </section>
      {open && <AttemptModal attemptId={open} onClose={() => setOpen(null)} />}
    </>
  )
}
