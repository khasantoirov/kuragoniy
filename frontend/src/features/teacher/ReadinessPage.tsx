import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { useLessonOptions, useReadinessStatus, type LessonOption } from '@/features/learning/api'
import { AttemptReview, QuizRunner, type AttemptPayload, type AttemptResult } from '@/features/portal/quiz'
import { errText, PageHead, PercentPill, Segmented } from '@/features/portal/ui'
import { api } from '@/lib/api/client'
import { GRADES, type Grade } from '@/features/lessons/labels'

/** "Darsga tayyormisiz?" — the platform quizzes the teacher on the
 * lesson's own content (experiment steps, equipment, safety, formulas,
 * goal) before class. Results are visible to the administration. */
export function ReadinessPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const qc = useQueryClient()
  const [grade, setGrade] = useState<Grade>(GRADES[0])
  const { data: lessons, isLoading } = useLessonOptions(grade)
  const { data: status } = useReadinessStatus()
  const [active, setActive] = useState<{ lesson: LessonOption; attempt: AttemptPayload } | null>(null)
  const [result, setResult] = useState<AttemptResult | null>(null)
  const [busy, setBusy] = useState<number | null>(null)

  const start = async (lesson: LessonOption) => {
    setBusy(lesson.id)
    try {
      const res = await api.post<AttemptPayload>(`/learning/readiness/${lesson.id}/start/`)
      setResult(null)
      setActive({ lesson, attempt: res.data })
    } catch (err) {
      toast(t(errText(err)), 'error')
    } finally {
      setBusy(null)
    }
  }

  if (active || result) {
    return (
      <div>
        <button type="button" className="backlink linklike" onClick={() => { setActive(null); setResult(null) }}>← {t('Darslar ro\'yxati')}</button>
        <PageHead title={t('Darsga tayyorgarlik')} sub={active?.lesson.title} />
        <section className="panel">
          {result ? (
            <AttemptReview result={result} onClose={() => { setResult(null); setActive(null) }} />
          ) : active && (
            <QuizRunner payload={active.attempt} submitUrl={`/learning/readiness/attempts/${active.attempt.id}/submit/`}
              onDone={(r) => { setResult(r); qc.invalidateQueries({ queryKey: ['learning'] }) }} />
          )}
        </section>
      </div>
    )
  }

  return (
    <div>
      <PageHead title={t('Darsga tayyorgarlik')}
        sub={t("Darsdan oldin o'zingizni tekshiring: platforma darsning nazariyasi, formulalari va tajribasini o'tkazish bo'yicha savollar tuzadi. 70% va undan yuqori — «tayyor».")}
        actions={<Segmented value={grade} onChange={setGrade} options={GRADES.map((g) => ({ value: g, label: `${g}-${t('sinf')}` }))} />} />
      {isLoading ? <Skeleton lines={6} /> : (
        <section className="panel">
          <ul className="people">
            {lessons?.map((l) => {
              const st = status?.[String(l.id)]
              return (
                <li key={l.id} className="person">
                  <div>
                    <p className="person__name">{l.hafta}-{t('hafta')}: {l.title}</p>
                    <p className="person__mail">{l.chorak}-{t('chorak')}{st ? ` · ${st.attempts} ${t('marta tekshirilgan')}` : ''}</p>
                  </div>
                  <div className="person__acts">
                    {st && <PercentPill value={st.best_percent} />}
                    {st?.passed && <span className="pill pill--ok">✓ {t('Tayyor')}</span>}
                    <button className="btn btn--sm" disabled={busy === l.id} onClick={() => start(l)}>
                      {st ? t('Qayta tekshirish') : t('Tekshirish')}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}
