import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'

import { useConfirm } from '@/components/ConfirmProvider'
import { EmptyState } from '@/components/EmptyState'
import { Modal } from '@/components/Modal'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import {
  EMPTY_QUESTION,
  useAssignments,
  useInvalidateLearning,
  useLessonOptions,
  useTeacherClasses,
  type Assignment,
  type AssignmentResults,
  type Question,
} from '@/features/learning/api'
import { cleanQuestion, QuestionEditor } from '@/features/learning/QuestionEditor'
import { downloadCsv } from '@/features/portal/csv'
import { AttemptReview, type AttemptResult } from '@/features/portal/quiz'
import { errText, fmtDateTime, fmtDuration, Meter, PageHead, PercentPill, StatusPill } from '@/features/portal/ui'
import { IC } from '@/icons'
import { api } from '@/lib/api/client'

const toLocalInput = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16)
}

function AssignmentEditor({ initial, onClose }: { initial: Assignment | null; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const invalidate = useInvalidateLearning()
  const { data: classes } = useTeacherClasses()
  const [classIds, setClassIds] = useState<number[]>(initial ? [initial.journal_class] : [])
  const firstGrade = classes?.find((c) => classIds.includes(c.id))?.grade ?? null
  const [grade, setGrade] = useState<number | null>(null)
  const effGrade = grade ?? firstGrade
  const { data: lessons } = useLessonOptions(effGrade)
  const [lesson, setLesson] = useState<number | ''>(initial?.lesson ?? '')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [instructions, setInstructions] = useState(initial?.instructions ?? '')
  const [due, setDue] = useState(toLocalInput(initial?.due_at ?? null))
  const [maxAttempts, setMaxAttempts] = useState(initial?.max_attempts ?? 1)
  const [showAnswers, setShowAnswers] = useState<Assignment['show_answers']>(initial?.show_answers ?? 'after_submit')
  const [includeLesson, setIncludeLesson] = useState(initial?.include_lesson_questions ?? true)
  const [questions, setQuestions] = useState<Question[]>(initial?.custom_questions ?? [])
  const [busy, setBusy] = useState(false)

  const { data: material } = useQuery({
    queryKey: ['learning', 'material', lesson],
    enabled: !!lesson,
    queryFn: async () => (await api.get<{ question_counts?: Record<string, number> }>(`/learning/materials/${lesson}/`)).data,
  })
  const lessonQ = material?.question_counts?.student ?? 0

  const save = async () => {
    if (!classIds.length) return toast(t('Sinfni tanlang'), 'error')
    const body = {
      lesson: lesson || null,
      title: title.trim() || lessons?.find((l) => l.id === lesson)?.title || '',
      instructions,
      due_at: due ? new Date(due).toISOString() : null,
      max_attempts: maxAttempts,
      show_answers: showAnswers,
      include_lesson_questions: includeLesson,
      custom_questions: questions.map(cleanQuestion),
    }
    if (!body.title) return toast(t('Vazifa nomini kiriting'), 'error')
    setBusy(true)
    try {
      if (initial) {
        await api.patch(`/learning/assignments/${initial.id}/`, body)
      } else {
        for (const id of classIds) await api.post('/learning/assignments/', { ...body, journal_class: id })
      }
      invalidate()
      toast(initial ? t('Saqlandi') : t("Vazifa o'quvchilarga yuborildi"))
      onClose()
    } catch (err) {
      toast(t(errText(err)), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={initial ? t('Vazifani tahrirlash') : t('Yangi vazifa (darsni topshirish)')} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>{t('Bekor qilish')}</button><button className="btn btn--primary" disabled={busy} onClick={save}>{busy ? t('Saqlanmoqda…') : initial ? t('Saqlash') : t('Yuborish')}</button></>}>
      <div className="field">
        <span className="field__label">{t('Sinf(lar)')}</span>
        <div className="chips">
          {classes?.map((c) => {
            const on = classIds.includes(c.id)
            return (
              <button key={c.id} type="button" disabled={!!initial} className={`chip ${on ? 'is-on' : ''}`}
                onClick={() => setClassIds(on ? classIds.filter((x) => x !== c.id) : [...classIds, c.id])}>
                {c.name} <span className="chip__n">{c.account_count}</span>
              </button>
            )
          })}
        </div>
      </div>
      <div className="row row--2">
        <label className="field">
          <span className="field__label">{t('Sinf darajasi')}</span>
          <select className="input" value={effGrade ?? ''} onChange={(e) => { setGrade(e.target.value ? Number(e.target.value) : null); setLesson('') }}>
            <option value="">{t('Hammasi')}</option>
            {[7, 8, 9].map((g) => <option key={g} value={g}>{g}-{t('sinf')}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field__label">{t('Dars')}</span>
          <select className="input" value={lesson} onChange={(e) => setLesson(e.target.value ? Number(e.target.value) : '')}>
            <option value="">{t('— darssiz (faqat o\'z savollarim) —')}</option>
            {lessons?.map((l) => <option key={l.id} value={l.id}>{l.hafta}-{t('hafta')}: {l.title}</option>)}
          </select>
        </label>
      </div>
      {lesson !== '' && (
        <label className="check">
          <input type="checkbox" checked={includeLesson} onChange={(e) => setIncludeLesson(e.target.checked)} />
          <span>{t('Dars savollarini qo\'shish')} ({lessonQ} {t('ta')})</span>
        </label>
      )}
      <label className="field">
        <span className="field__label">{t('Nomi')}</span>
        <input className="input" maxLength={255} value={title} placeholder={lessons?.find((l) => l.id === lesson)?.title ?? ''} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="field">
        <span className="field__label">{t("Ko'rsatma (ixtiyoriy)")}</span>
        <textarea className="input" rows={2} maxLength={5000} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
      </label>
      <div className="row row--3">
        <label className="field">
          <span className="field__label">{t('Muddat')}</span>
          <input className="input" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">{t('Urinishlar soni')}</span>
          <input className="input" type="number" min={1} max={10} value={maxAttempts} onChange={(e) => setMaxAttempts(Math.max(1, Math.min(10, Number(e.target.value) || 1)))} />
        </label>
        <label className="field">
          <span className="field__label">{t("To'g'ri javoblar")}</span>
          <select className="input" value={showAnswers} onChange={(e) => setShowAnswers(e.target.value as Assignment['show_answers'])}>
            <option value="after_submit">{t('Topshirgach ko\'rsatilsin')}</option>
            <option value="after_due">{t('Muddat tugagach')}</option>
            <option value="never">{t("Ko'rsatilmasin")}</option>
          </select>
        </label>
      </div>

      <h4 className="subhead">{t("O'z savollaringiz")} ({questions.length})</h4>
      {questions.map((q, i) => (
        <QuestionEditor key={i} index={i} value={q}
          onChange={(nq) => setQuestions(questions.map((x, j) => (j === i ? nq : x)))}
          onRemove={() => setQuestions(questions.filter((_, j) => j !== i))} />
      ))}
      <button type="button" className="btn btn--sm" onClick={() => setQuestions([...questions, { ...EMPTY_QUESTION, options: ['', '', '', ''] }])}>
        + {t("Savol qo'shish")}
      </button>
    </Modal>
  )
}

export function AssignmentsPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const invalidate = useInvalidateLearning()
  const { data: classes } = useTeacherClasses()
  const [classFilter, setClassFilter] = useState<number | ''>('')
  const { data, isLoading } = useAssignments(classFilter ? { class: classFilter } : {})
  const [editing, setEditing] = useState<Assignment | null | 'new'>(null)

  const remove = async (a: Assignment) => {
    if (!(await confirm({ title: t("Vazifani o'chirish"), text: `«${a.title}» — ${t("barcha natijalari ham o'chadi.")}`, danger: true }))) return
    try {
      await api.delete(`/learning/assignments/${a.id}/`)
      invalidate()
    } catch (err) {
      toast(t(errText(err)), 'error')
    }
  }

  return (
    <div>
      <PageHead title={t('Vazifalar')} sub={t("Darsni sinfga topshiring: video, test va masalalarni muddat bilan biriktiring, natijalarni kuzating.")}
        actions={<>
          <select className="input" value={classFilter} onChange={(e) => setClassFilter(e.target.value ? Number(e.target.value) : '')} aria-label={t('Sinf')}>
            <option value="">{t('Barcha sinflar')}</option>
            {classes?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button className="btn btn--primary" onClick={() => setEditing('new')}>+ {t('Yangi vazifa')}</button>
        </>} />
      {isLoading && <Skeleton lines={5} />}
      {!isLoading && !data?.length && (
        <EmptyState title={t("Hali vazifa yo'q")} hint={t("«Yangi vazifa» tugmasi bilan darsni sinfingizga topshiring.")} />
      )}
      <div className="hwlist">
        {data?.map((a) => {
          const st = a.stats
          const pct = st && st.students ? (100 * st.submitted) / st.students : 0
          return (
            <article key={a.id} className="hwcard hwcard--static">
              <span className="hwcard__top">
                <span className="pill pill--info">{a.class_name}</span>
                {a.due_at && <span className={`pill ${new Date(a.due_at) < new Date() ? 'pill--muted' : 'pill--mid'}`}>{fmtDateTime(a.due_at)}</span>}
              </span>
              <Link to={`/assignments/${a.id}`} className="hwcard__title">{a.title}</Link>
              {a.lesson_title && <span className="hwcard__sub">{a.lesson_title} · {a.question_count} {t('savol')}</span>}
              {st && (
                <span className="hwcard__prog">
                  <Meter value={pct} label={t('Topshirganlar')} />
                  <span>{st.submitted}/{st.students} {t('topshirdi')}{st.avg_percent != null && ` · ${t("o'rtacha")} ${Math.round(st.avg_percent)}%`}</span>
                </span>
              )}
              <span className="hwcard__acts">
                <Link className="btn btn--sm" to={`/assignments/${a.id}`}>{t('Natijalar')}</Link>
                <button className="btn btn--sm btn--ghost" onClick={() => setEditing(a)}>{IC.edit}</button>
                <button className="btn btn--sm btn--ghost" onClick={() => remove(a)} aria-label={t("O'chirish")}>{IC.trash}</button>
              </span>
            </article>
          )
        })}
      </div>
      {editing && <AssignmentEditor initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

export function AttemptModal({ attemptId, onClose }: { attemptId: number; onClose: () => void }) {
  const { t } = useTranslation()
  const { data, isLoading } = useQuery({
    queryKey: ['learning', 'attempt', attemptId],
    queryFn: async () => (await api.get<AttemptResult>(`/learning/attempts/${attemptId}/`)).data,
  })
  return (
    <Modal title={data ? `${data.user_name} — ${data.assignment_title || data.lesson_title}` : t('Natija')} onClose={onClose}>
      {isLoading || !data ? <Skeleton lines={5} /> : <AttemptReview result={data} />}
    </Modal>
  )
}

const STATE_LABEL: Record<string, { label: string; tone: 'ok' | 'mid' | 'bad' | 'info' }> = {
  submitted: { label: 'Topshirdi', tone: 'ok' },
  in_progress: { label: 'Boshlagan', tone: 'mid' },
  overdue: { label: "Topshirmadi (muddat o'tdi)", tone: 'bad' },
  todo: { label: 'Topshirmagan', tone: 'info' },
}

export function AssignmentResultsPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const [open, setOpen] = useState<number | null>(null)
  const { data, isLoading } = useQuery({
    queryKey: ['learning', 'assignment-results', id],
    queryFn: async () => (await api.get<AssignmentResults>(`/learning/assignments/${id}/results/`)).data,
  })
  const summary = useMemo(() => {
    const rows = data?.rows ?? []
    const done = rows.filter((r) => r.state === 'submitted')
    const avg = done.length ? done.reduce((s, r) => s + (r.best_percent ?? 0), 0) / done.length : null
    return { total: rows.length, done: done.length, avg }
  }, [data])

  if (isLoading) return <Skeleton lines={6} />
  if (!data) return <p className="prose">{t('Topilmadi.')}</p>
  const a = data.assignment

  const exportCsv = () => downloadCsv(`natijalar-${a.class_name}-${a.title}`,
    [t('Ism'), t('Holat'), t('Natija %'), t('Urinishlar'), t('Topshirilgan'), t('Vaqt')],
    data.rows.map((r) => [r.name, t(STATE_LABEL[r.state].label), r.best_percent ?? '', r.attempts, fmtDateTime(r.submitted_at), fmtDuration(r.duration_sec)]))

  return (
    <div>
      <Link to="/assignments" className="backlink">← {t('Vazifalar')}</Link>
      <PageHead title={a.title} sub={`${a.class_name}${a.lesson_title ? ` · ${a.lesson_title}` : ''}${a.due_at ? ` · ${t('muddat')} ${fmtDateTime(a.due_at)}` : ''}`}
        actions={<button className="btn" onClick={exportCsv}>{IC.download} CSV</button>} />
      <div className="stiles">
        <div className="stile"><p className="stile__label">{t('Topshirdi')}</p><p className="stile__value">{summary.done}/{summary.total}</p></div>
        <div className="stile"><p className="stile__label">{t("O'rtacha natija")}</p><p className="stile__value">{summary.avg != null ? `${Math.round(summary.avg)}%` : '—'}</p></div>
        <div className="stile"><p className="stile__label">{t('Topshirmaganlar')}</p><p className="stile__value">{summary.total - summary.done}</p></div>
      </div>
      <section className="panel">
        <div className="tablewrap">
          <table className="dtable">
            <thead><tr><th>{t('Ism')}</th><th>{t('Holat')}</th><th>{t('Natija')}</th><th>{t('Urinish')}</th><th>{t('Topshirilgan')}</th><th>{t('Vaqt')}</th></tr></thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.user}>
                  <td>{r.best_attempt ? <button className="linklike" onClick={() => setOpen(r.best_attempt)}>{r.name}</button> : r.name}</td>
                  <td><StatusPill tone={STATE_LABEL[r.state].tone}>{t(STATE_LABEL[r.state].label)}</StatusPill>{r.is_late && <> <StatusPill tone="mid">{t('kechikib')}</StatusPill></>}</td>
                  <td><PercentPill value={r.best_percent} /></td>
                  <td>{r.attempts}</td>
                  <td>{fmtDateTime(r.submitted_at)}</td>
                  <td>{fmtDuration(r.duration_sec)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {data.question_stats.length > 0 && (
        <section className="panel">
          <h3 className="panel__title">{t('Savollar tahlili')} <span className="muted">· {t("eng qiyinlari yuqorida")}</span></h3>
          <ul className="qstats">
            {data.question_stats.map((q, i) => (
              <li key={i}>
                <span className="qstats__txt">{q.text}</span>
                <span className="qstats__bar"><Meter value={q.percent} label={q.text} /></span>
                <span className="qstats__pct">{Math.round(q.percent)}% <small>({q.ok}/{q.n})</small></span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {open && <AttemptModal attemptId={open} onClose={() => setOpen(null)} />}
    </div>
  )
}
