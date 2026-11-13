import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { fmtDate } from '@/features/portal/ui'
import { useModules } from '@/lib/modules'

import { useSchoolTraining } from './api'
import { CertificateModal } from './CertificateView'
import './training.css'

/** A school's page: how its teachers are doing on their courses — for the
 * administration and the school's own ma'muriyat. */
export function SchoolTrainingPanel({ schoolId }: { schoolId: number }) {
  const { t } = useTranslation()
  const { on } = useModules()
  const { data } = useSchoolTraining(on('training') ? schoolId : undefined)
  const [cert, setCert] = useState<number | null>(null)
  if (!data || !data.teachers.length) return null
  const anyCourse = data.teachers.some((x) => x.courses.length)
  return (
    <section className="panel">
      <div className="thead">
        <h3 className="panel__title">{t('Malaka oshirish')}</h3>
        <span className="muted">{data.certified}/{data.teachers.length} {t("o'qituvchi sertifikat olgan")}</span>
      </div>
      {!anyCourse ? (
        <p className="prose prose--note">{t("Bu maktab o'qituvchilariga hali kurs biriktirilmagan.")}</p>
      ) : (
        <ul className="tschool">
          {data.teachers.map((x) => (
            <li key={x.id}>
              <b>{x.name}</b>
              <span className="tschool__cs">
                {!x.courses.length && <small className="muted">{t("Kurs yo'q")}</small>}
                {x.courses.map((c) => (
                  c.certificate ? (
                    <button key={c.course} type="button" className="tchip is-done" onClick={() => setCert(c.certificate!.id)}
                      title={`№ ${c.certificate.number}`}>✓ {c.title}</button>
                  ) : (
                    <span key={c.course} className={`tchip ${c.overdue ? 'is-bad' : ''}`}
                      title={c.due_on ? `${t('Muddat')}: ${fmtDate(c.due_on)}` : undefined}>
                      {c.title} · {c.percent}%
                    </span>
                  )
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
      {cert != null && <CertificateModal id={cert} onClose={() => setCert(null)} />}
    </section>
  )
}
