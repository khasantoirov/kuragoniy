import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'

import { useConfirm } from '@/components/ConfirmProvider'
import { EmptyState } from '@/components/EmptyState'
import { Modal } from '@/components/Modal'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { useTeachersList } from '@/features/learning/api'
import { AttemptReview, QuizRunner, type AttemptPayload, type AttemptResult } from '@/features/portal/quiz'
import { errText, fmtDate, Meter, PageHead, PercentPill, Segmented, StatusPill } from '@/features/portal/ui'
import { VideoEmbed } from '@/features/portal/VideoEmbed'
import { useSchools } from '@/features/schools/api'
import { IC } from '@/icons'
import { api } from '@/lib/api/client'
import { isAdmin, isOversight, useAuth } from '@/lib/auth/AuthContext'

import { useCourse, useCourseProgress, type Certificate, type CourseDetail, type LessonView, type ModuleView } from './api'
import { CertificateModal } from './CertificateView'
import './training.css'

type TrainingResult = AttemptResult & { certificate?: Certificate | null }

function Paragraphs({ text }: { text: string }) {
  const parts = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  return <div className="prose">{parts.map((p, i) => <p key={i}>{p}</p>)}</div>
}

function AssignModal({ course, onClose }: { course: CourseDetail; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const qc = useQueryClient()
  const schools = useSchools()
  const teachers = useTeachersList()
  const [school, setSchool] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [due, setDue] = useState('')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const list = (teachers.data ?? []).filter((x) => x.name.toLowerCase().includes(q.trim().toLowerCase()))
  const toggle = (id: string) => setPicked((s) => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    return n
  })
  const send = async () => {
    setBusy(true)
    try {
      const res = await api.post<{ assigned: number; updated: number }>(`/training/courses/${course.id}/assign/`, {
        school: school || null, teachers: [...picked], due_on: due || null,
      })
      qc.invalidateQueries({ queryKey: ['training'] })
      toast(`${t('Biriktirildi')}: ${res.data.assigned}${res.data.updated ? ` · ${t('yangilandi')}: ${res.data.updated}` : ''}`)
      onClose()
    } catch (err) {
      toast(t(errText(err)), 'error')
      setBusy(false)
    }
  }
  return (
    <Modal title={`${t('Kursni biriktirish')}: ${course.title}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>{t('Bekor qilish')}</button>
        <button className="btn btn--primary" disabled={busy || (!school && !picked.size)} onClick={send}>{t('Biriktirish')}</button></>}>
      <label className="field">
        <span className="field__label">{t("Maktabning barcha o'qituvchilari")}</span>
        <select className="input" value={school} onChange={(e) => setSchool(e.target.value)}>
          <option value="">—</option>
          {schools.data?.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.teachers_count})</option>)}
        </select>
      </label>
      <div className="field">
        <span className="field__label">{t("Yoki alohida o'qituvchilar")}{picked.size ? ` · ${picked.size}` : ''}</span>
        <input className="input input--sm" placeholder={t('Qidirish')} value={q} onChange={(e) => setQ(e.target.value)} />
        <ul className="tpick">
          {list.map((x) => (
            <li key={x.id}>
              <label><input type="checkbox" checked={picked.has(x.id)} onChange={() => toggle(x.id)} /> {x.name}</label>
            </li>
          ))}
        </ul>
      </div>
      <label className="field">
        <span className="field__label">{t('Muddat (ixtiyoriy)')}</span>
        <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
      </label>
      <p className="form__note">{t("O'qituvchilarga bildirishnoma boradi; muddatdan 3 kun, 1 kun oldin va oxirgi kuni eslatiladi.")}</p>
    </Modal>
  )
}

function PeopleTab({ course }: { course: CourseDetail }) {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const { user } = useAuth()
  const { data, isLoading } = useCourseProgress(course.id)
  const [cert, setCert] = useState<number | null>(null)
  const unassign = async (id: string, name: string) => {
    if (!(await confirm({ title: t('Kursdan chiqarish'), text: name }))) return
    try {
      await api.post(`/training/courses/${course.id}/unassign/`, { user: id })
      qc.invalidateQueries({ queryKey: ['training'] })
    } catch (err) {
      toast(t(errText(err)), 'error')
    }
  }
  if (isLoading) return <Skeleton lines={5} />
  if (!data?.length) return <EmptyState title={t("Bu kursda hali o'qituvchi yo'q")} hint={t("«Biriktirish» bilan maktab yoki o'qituvchilarni qo'shing.")} />
  return (
    <section className="panel">
      <div className="tablewrap">
        <table className="dtable">
          <thead>
            <tr><th>{t("O'qituvchi")}</th><th>{t('Jarayon')}</th><th>{t('Modullar')}</th><th>{t('Muddat')}</th><th>{t('Sertifikat')}</th><th /></tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.user}>
                <td>{r.name}{r.assigned ? '' : <small className="muted"> · {t("o'zi boshlagan")}</small>}</td>
                <td><div className="tcourse__prog"><Meter value={r.percent} /><span>{r.percent}%</span></div></td>
                <td>{r.modules_passed}/{r.modules_total}</td>
                <td>{r.due_on ? <span className={r.overdue ? 'is-bad' : ''}>{fmtDate(r.due_on)}</span> : '—'}</td>
                <td>{r.certificate ? <button className="linklike" onClick={() => setCert(r.certificate!.id)}>№ {r.certificate.number}</button> : '—'}</td>
                <td>{isAdmin(user) && !r.certificate && (
                  <button className="btn btn--sm btn--ghost" aria-label={t('Kursdan chiqarish')} onClick={() => unassign(r.user, r.name)}>{IC.close}</button>
                )}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {cert != null && <CertificateModal id={cert} onClose={() => setCert(null)} />}
    </section>
  )
}

function ModuleCard({ m, index, onLesson, onTest, busy }: {
  m: ModuleView; index: number; busy: boolean
  onLesson: (l: LessonView) => void; onTest: () => void
}) {
  const { t } = useTranslation()
  const status = m.passed ? <StatusPill tone="ok">✓ {t("O'tildi")}</StatusPill>
    : m.locked ? <StatusPill tone="muted">🔒 {t('Yopiq')}</StatusPill>
      : <StatusPill tone="mid">{t('Jarayonda')}</StatusPill>
  return (
    <section className={`panel tmod ${m.locked ? 'is-locked' : ''} ${m.passed ? 'is-passed' : ''}`}>
      <div className="tmod__head">
        <span className="tmod__n">{index + 1}</span>
        <h3 className="tmod__title">{m.title}</h3>
        {status}
      </div>
      {m.locked && <p className="form__note">{t("Oldingi modul testidan o'tganingizdan keyin ochiladi.")}</p>}
      <ol className="tles">
        {m.lessons.map((l) => (
          <li key={l.id}>
            <button type="button" className={`tles__row ${l.done ? 'is-done' : ''}`} disabled={m.locked} onClick={() => onLesson(l)}>
              <span className="tles__mark">{l.done ? '✓' : ''}</span>
              <span className="tles__title">{l.title}</span>
              {!m.locked && <span className="tles__go">›</span>}
            </button>
          </li>
        ))}
      </ol>
      {m.has_test && (
        <div className="tmod__test">
          <div>
            <b>{t('Modul testi')}</b>
            <small>{m.question_count} {t('ta savol')}{m.attempts ? ` · ${m.attempts} ${t('marta topshirilgan')}` : ''}</small>
          </div>
          {m.best_percent != null && <PercentPill value={m.best_percent} />}
          <button className={`btn btn--sm ${m.test_open && !m.passed ? 'btn--primary' : ''}`} disabled={!m.test_open || busy} onClick={onTest}
            title={!m.lessons_done ? t("Avval modulning barcha darslarini o'qing") : undefined}>
            {m.attempts ? t('Qayta topshirish') : t('Testni boshlash')}
          </button>
        </div>
      )}
      {!m.locked && !m.lessons_done && m.has_test && <p className="form__note">{t("Test modulning barcha darslari o'qilgach ochiladi.")}</p>}
    </section>
  )
}

/** One course: its modules in order, the reading of a lesson, the module
 * test; for the administration also who is on it (and assigning). */
export function CoursePage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const toast = useToast()
  const qc = useQueryClient()
  const { user } = useAuth()
  const admin = isAdmin(user)
  const oversight = isOversight(user)
  const { data: course, isLoading, isError } = useCourse(id)
  const [tab, setTab] = useState<'kurs' | 'people'>('kurs')
  const [reading, setReading] = useState<number | null>(null)
  const [test, setTest] = useState<{ module: ModuleView; attempt: AttemptPayload } | null>(null)
  const [result, setResult] = useState<TrainingResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [showCert, setShowCert] = useState<Certificate | null>(null)

  const flat = useMemo(() => (course?.modules ?? []).flatMap((m) => m.lessons.map((l) => ({ l, m }))), [course])
  const refresh = () => qc.invalidateQueries({ queryKey: ['training'] })

  if (isLoading) return <Skeleton lines={6} />
  if (isError || !course) return <EmptyState title={t('Kurs topilmadi')} action={<Link className="btn" to="/training">{t('Malaka oshirish')}</Link>} />

  const current = reading != null ? flat.find((x) => x.l.id === reading) : undefined
  const learner = course.can_learn && course.is_published

  const markDone = async (lesson: LessonView, then?: () => void) => {
    if (!learner || lesson.done) { then?.(); return }
    setBusy(true)
    try {
      const res = await api.post<{ certificate: Certificate | null }>(`/training/lessons/${lesson.id}/done/`)
      await refresh()
      if (res.data.certificate) setShowCert(res.data.certificate)
      then?.()
    } catch (err) {
      toast(t(errText(err)), 'error')
    } finally {
      setBusy(false)
    }
  }

  const startTest = async (m: ModuleView) => {
    setBusy(true)
    try {
      const res = await api.post<AttemptPayload>(`/training/modules/${m.id}/start/`)
      setResult(null)
      setReading(null)
      setTest({ module: m, attempt: res.data })
    } catch (err) {
      toast(t(errText(err)), 'error')
    } finally {
      setBusy(false)
    }
  }

  const back = <button type="button" className="backlink linklike" onClick={() => { setReading(null); setTest(null); setResult(null) }}>← {course.title}</button>

  if (test || result) {
    return (
      <div>
        {back}
        <PageHead title={`${t('Modul testi')}: ${test?.module.title ?? ''}`} sub={`${t("O'tish chegarasi")}: ${course.pass_percent}%`} />
        <section className="panel">
          {result ? (
            <>
              {result.certificate && (
                <div className="tdone">
                  <b>🎓 {t('Tabriklaymiz! Kurs tugatildi.')}</b>
                  <button className="btn btn--primary btn--sm" onClick={() => setShowCert(result.certificate!)}>{IC.print} {t('Sertifikatni ochish')}</button>
                </div>
              )}
              <AttemptReview result={result} onClose={() => { setResult(null); setTest(null) }}
                passLabel={t("Modul o'tildi")} revealNote={t("To'g'ri javoblar testdan o'tganingizdan keyin ko'rsatiladi.")} />
            </>
          ) : test && (
            <QuizRunner payload={test.attempt} submitUrl={`/training/attempts/${test.attempt.id}/submit/`}
              onDone={(r) => { setResult(r as TrainingResult); refresh() }} />
          )}
        </section>
        {showCert && <CertificateModal cert={showCert} onClose={() => setShowCert(null)} />}
      </div>
    )
  }

  if (current) {
    const { l, m } = current
    const i = flat.findIndex((x) => x.l.id === l.id)
    const next = flat[i + 1]
    const nextOpen = next && next.m.id === m.id
    return (
      <div>
        {back}
        <p className="tread__crumb">{m.title}</p>
        <PageHead title={l.title} actions={l.done ? <StatusPill tone="ok">✓ {t("O'qilgan")}</StatusPill> : undefined} />
        <section className="panel tread">
          {l.body ? <Paragraphs text={l.body} /> : null}
          {l.video_url && <div className="vblock"><VideoEmbed url={l.video_url} title={l.title} /></div>}
          {!!l.links?.length && (
            <ul className="tread__links">
              {l.links.map((x, k) => <li key={k}><a href={x.url} target="_blank" rel="noreferrer noopener">{IC.external} {x.title || x.url}</a></li>)}
            </ul>
          )}
          {!l.body && !l.video_url && !l.links?.length && <p className="muted">{t("Bu darsga hali matn qo'shilmagan.")}</p>}
        </section>
        <div className="tread__nav">
          {learner && !l.done && <button className="btn btn--primary" disabled={busy} onClick={() => markDone(l)}>✓ {t("O'qidim")}</button>}
          {nextOpen ? (
            <button className="btn" disabled={busy} onClick={() => markDone(l, () => { setReading(next.l.id); window.scrollTo(0, 0) })}>{t('Keyingi dars')} ›</button>
          ) : m.has_test && learner ? (
            <button className="btn" disabled={busy} onClick={() => markDone(l, () => setReading(null))}>{t('Modulga qaytish')} ›</button>
          ) : (
            <button className="btn" onClick={() => setReading(null)}>{t('Modulga qaytish')}</button>
          )}
        </div>
        {showCert && <CertificateModal cert={showCert} onClose={() => setShowCert(null)} />}
      </div>
    )
  }

  return (
    <div>
      <Link className="backlink" to="/training">← {t('Malaka oshirish')}</Link>
      <PageHead title={course.title} sub={course.summary || undefined}
        actions={<>
          {oversight && <Segmented value={tab} onChange={setTab} options={[{ value: 'kurs', label: t('Kurs') }, { value: 'people', label: t("O'qituvchilar") }]} />}
          {admin && course.is_published && <button className="btn" onClick={() => setAssigning(true)}>{IC.users} {t('Biriktirish')}</button>}
          {admin && <Link className="btn" to={`/training/${course.id}/edit`}>{IC.edit} {t('Tahrirlash')}</Link>}
        </>} />
      {!course.is_published && <p className="notice">{t("Qoralama: kurs hali e'lon qilinmagan, o'qituvchilar uni ko'rmaydi.")}</p>}

      {tab === 'people' && oversight ? <PeopleTab course={course} /> : (
        <>
          <section className="panel tsum">
            <div className="tsum__prog">
              <Meter value={course.percent} label={t("Kurs bo'yicha")} />
              <b>{course.percent}%</b>
            </div>
            <ul className="tsum__kv">
              <li><span>{t('Modullar')}</span><b>{course.modules_passed}/{course.modules_total}</b></li>
              <li><span>{t('Darslar')}</span><b>{course.lessons_read}/{course.lessons_total}</b></li>
              <li><span>{t("O'tish chegarasi")}</span><b>{course.pass_percent}%</b></li>
              {course.hours > 0 && <li><span>{t('Hajmi')}</span><b>{course.hours} {t('soat')}</b></li>}
              {course.due_on && <li><span>{t('Muddat')}</span><b>{fmtDate(course.due_on)}</b></li>}
            </ul>
            {course.certificate && (
              <div className="tdone">
                <b>🎓 {t('Kurs tugatilgan')} · № {course.certificate.number}</b>
                <button className="btn btn--primary btn--sm" onClick={() => setShowCert(course.certificate)}>{IC.print} {t('Sertifikat')}</button>
              </div>
            )}
          </section>
          {!course.modules.length && <EmptyState title={t("Bu kursda hali modul yo'q")} />}
          {course.modules.map((m, i) => (
            <ModuleCard key={m.id} m={m} index={i} busy={busy} onLesson={(l) => { setReading(l.id); window.scrollTo(0, 0) }} onTest={() => startTest(m)} />
          ))}
        </>
      )}
      {assigning && <AssignModal course={course} onClose={() => setAssigning(false)} />}
      {showCert && <CertificateModal cert={showCert} onClose={() => setShowCert(null)} />}
    </div>
  )
}
