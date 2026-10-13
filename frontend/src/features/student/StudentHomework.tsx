import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { EmptyState } from '@/components/EmptyState'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { AttemptReview, QuizRunner, type AttemptPayload, type AttemptResult } from '@/features/portal/quiz'
import { errText, fmtDateTime, PageHead, PercentPill, Segmented, StatusPill } from '@/features/portal/ui'
import { api } from '@/lib/api/client'

import { useStudentAssignments, type StudentAssignment } from './api'

const STATE: Record<StudentAssignment['state'], { label: string; tone: 'ok' | 'mid' | 'bad' | 'info' }> = {
  todo: { label: 'Bajarilmagan', tone: 'info' },
  in_progress: { label: 'Boshlangan', tone: 'mid' },
  submitted: { label: 'Topshirilgan', tone: 'ok' },
  overdue: { label: "Muddati o'tgan", tone: 'bad' },
}

export function StudentHomework() {
  const { t } = useTranslation()
  const { data, isLoading } = useStudentAssignments()
  const [filter, setFilter] = useState<'open' | 'done' | 'all'>('open')

  if (isLoading) return <Skeleton lines={6} />
  const all = data ?? []
  const rows = all.filter((a) => (filter === 'all' ? true : filter === 'done' ? a.state === 'submitted' : a.state !== 'submitted'))

  return (
    <div>
      <PageHead title={t('Uyga vazifa')} sub={t("O'qituvchingiz bergan topshiriqlar. Natijangizni o'qituvchingiz va maktab ma'muriyati ko'radi.")}
        actions={<Segmented value={filter} onChange={setFilter} options={[
          { value: 'open', label: t('Bajarilmagan') }, { value: 'done', label: t('Topshirilgan') }, { value: 'all', label: t('Hammasi') },
        ]} />} />
      {!rows.length && <EmptyState title={filter === 'open' ? t("Bajarilmagan vazifa yo'q") : t("Vazifa yo'q")} />}
      <div className="hwlist">
        {rows.map((a) => (
          <Link key={a.id} to={`/s/homework/${a.id}`} className="hwcard">
            <span className="hwcard__top">
              <StatusPill tone={STATE[a.state].tone}>{t(STATE[a.state].label)}</StatusPill>
              {a.best_percent != null && <PercentPill value={a.best_percent} />}
            </span>
            <span className="hwcard__title">{a.title}</span>
            {a.lesson_title && <span className="hwcard__sub">{a.lesson_title}</span>}
            <span className="hwcard__foot">
              <span>{a.due_at ? `${t('Muddat')}: ${fmtDateTime(a.due_at)}` : t('Muddatsiz')}</span>
              <span>{a.teacher_name}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}

export function StudentHomeworkRun() {
  const { t } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const qc = useQueryClient()
  const { data, isLoading } = useStudentAssignments()
  const [attempt, setAttempt] = useState<AttemptPayload | null>(null)
  const [result, setResult] = useState<AttemptResult | null>(null)
  const [busy, setBusy] = useState(false)

  if (isLoading) return <Skeleton lines={6} />
  const a = (data ?? []).find((x) => x.id === Number(id))
  if (!a) return <p className="prose">{t('Vazifa topilmadi.')}</p>

  const start = async () => {
    setBusy(true)
    try {
      const res = await api.post<AttemptPayload>(`/student/assignments/${a.id}/start/`)
      setAttempt(res.data)
    } catch (err) {
      toast(t(errText(err)), 'error')
    } finally {
      setBusy(false)
    }
  }

  const left = a.max_attempts - a.attempts_used

  return (
    <div>
      <Link to="/s/homework" className="backlink">← {t('Barcha vazifalar')}</Link>
      <PageHead title={a.title} sub={[a.lesson_title, a.teacher_name].filter(Boolean).join(' · ')} />
      {result ? (
        <section className="panel">
          <AttemptReview result={result} onClose={() => navigate('/s/homework')} />
        </section>
      ) : attempt ? (
        <section className="panel">
          <QuizRunner payload={attempt} submitUrl={`/student/attempts/${attempt.id}/submit/`}
            onDone={(r) => { setResult(r); setAttempt(null); qc.invalidateQueries({ queryKey: ['student'] }) }} />
        </section>
      ) : (
        <section className="panel">
          {a.instructions && <p className="prose" style={{ whiteSpace: 'pre-wrap' }}>{a.instructions}</p>}
          <ul className="kv">
            <li><span>{t('Muddat')}</span><b>{a.due_at ? fmtDateTime(a.due_at) : t('Muddatsiz')}</b></li>
            <li><span>{t('Urinishlar')}</span><b>{a.attempts_used}/{a.max_attempts}</b></li>
            {a.best_percent != null && <li><span>{t('Eng yaxshi natija')}</span><b><PercentPill value={a.best_percent} /></b></li>}
          </ul>
          {a.lesson && (
            <p className="prose prose--note">
              {t('Avval darsni takrorlab oling')}: <Link to={`/s/lessons/${a.lesson}`}>{a.lesson_title}</Link>
            </p>
          )}
          <div className="panel__acts">
            {(left > 0 || a.state === 'in_progress') && (
              <button className="btn btn--primary" onClick={start} disabled={busy}>
                {a.state === 'in_progress' ? t('Davom ettirish') : a.attempts_used ? t('Qayta topshirish') : t('Boshlash')}
              </button>
            )}
            {a.last_attempt && <Link className="btn" to={`/s/results/${a.last_attempt}`}>{t("Natijani ko'rish")}</Link>}
          </div>
          {a.is_overdue && a.state !== 'submitted' && <p className="form__note">{t("Muddat o'tgan — topshirsangiz, kechikkan deb belgilanadi.")}</p>}
        </section>
      )}
    </div>
  )
}
