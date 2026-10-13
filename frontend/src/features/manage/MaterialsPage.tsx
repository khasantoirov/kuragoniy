import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useConfirm } from '@/components/ConfirmProvider'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { EMPTY_QUESTION, type LessonMaterial, type Question } from '@/features/learning/api'
import { cleanQuestion, QuestionEditor } from '@/features/learning/QuestionEditor'
import { Formula } from '@/features/portal/formula'
import { errText, PageHead, Segmented, StatusPill } from '@/features/portal/ui'
import { VideoEmbed } from '@/features/portal/VideoEmbed'
import { IC } from '@/icons'
import { api } from '@/lib/api/client'
import type { Paginated } from '@/lib/api/types'
import { isAdmin, useAuth } from '@/lib/auth/AuthContext'

interface MaterialRow {
  lesson: number
  title: string
  grade: number
  chorak: number
  hafta: number
  is_published: boolean
  has_theory: boolean
  has_video: boolean
  formulas: number
  question_counts: Record<string, number>
}

function MaterialEditor({ lessonId, readOnly, onBack }: { lessonId: number; readOnly: boolean; onBack: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['learning', 'material', lessonId],
    queryFn: async () => (await api.get<LessonMaterial>(`/learning/materials/${lessonId}/`)).data,
  })
  const [m, setM] = useState<LessonMaterial | null>(null)
  const [audience, setAudience] = useState<'student' | 'teacher'>('student')
  const questions = useQuery({
    queryKey: ['learning', 'questions', lessonId, audience],
    queryFn: async () => (await api.get<Paginated<Question>>('/learning/questions/', { params: { lesson: lessonId, audience } })).data.results,
  })
  const [drafts, setDrafts] = useState<Record<string, Question>>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => { if (data) setM(data) }, [data])
  useEffect(() => setDrafts({}), [audience])

  if (isLoading || !m) return <Skeleton lines={8} />
  const set = (patch: Partial<LessonMaterial>) => setM({ ...m, ...patch })

  const save = async (publish?: boolean) => {
    setBusy(true)
    try {
      const body = { ...m, is_published: publish ?? m.is_published, formulas: m.formulas.filter((f) => f.expr.trim()), extra_videos: m.extra_videos.filter((v) => v.url.trim()) }
      const res = await api.put<LessonMaterial>(`/learning/materials/${lessonId}/`, body)
      setM({ ...res.data, question_counts: m.question_counts })
      qc.invalidateQueries({ queryKey: ['learning'] })
      toast(t('Saqlandi'))
    } catch (err) {
      toast(t(errText(err)), 'error')
    } finally {
      setBusy(false)
    }
  }

  const saveQuestion = async (key: string, q: Question) => {
    try {
      const body = { ...cleanQuestion(q), lesson: lessonId, audience }
      if (q.id) await api.put(`/learning/questions/${q.id}/`, body)
      else await api.post('/learning/questions/', body)
      setDrafts((d) => { const n = { ...d }; delete n[key]; return n })
      qc.invalidateQueries({ queryKey: ['learning', 'questions', lessonId] })
      toast(t('Savol saqlandi'))
    } catch (err) {
      toast(t(errText(err)), 'error')
    }
  }

  const deleteQuestion = async (q: Question) => {
    if (!q.id || !(await confirm({ title: t("Savolni o'chirish"), text: q.text, danger: true }))) return
    await api.delete(`/learning/questions/${q.id}/`).catch(() => {})
    qc.invalidateQueries({ queryKey: ['learning', 'questions', lessonId] })
  }

  const list: [string, Question][] = [
    ...(questions.data ?? []).map((q) => [`q${q.id}`, drafts[`q${q.id}`] ?? q] as [string, Question]),
    ...Object.entries(drafts).filter(([k]) => k.startsWith('new')),
  ]

  return (
    <div>
      <button type="button" className="backlink linklike" onClick={onBack}>← {t('Darslar ro\'yxati')}</button>
      <PageHead title={m.lesson_title} sub={`${m.grade}-${t('sinf')} · ${t("o'quvchilar uchun material")}`}
        actions={!readOnly && <>
          <StatusPill tone={m.is_published ? 'ok' : 'muted'}>{m.is_published ? t("E'lon qilingan") : t('Qoralama')}</StatusPill>
          <button className="btn" disabled={busy} onClick={() => save()}>{t('Saqlash')}</button>
          <button className="btn btn--primary" disabled={busy} onClick={() => save(!m.is_published)}>
            {m.is_published ? t('Yashirish') : t("Saqlash va o'quvchilarga e'lon qilish")}
          </button>
        </>} />

      <fieldset className="fs" disabled={readOnly}>
        <section className="panel">
          <h3 className="panel__title">1. {t('Qisqa nazariya')}</h3>
          <textarea className="input" rows={8} maxLength={20000} value={m.theory} onChange={(e) => set({ theory: e.target.value })}
            placeholder={t("Asosiy tushunchalar — qisqa va sodda. Bo'sh qator — yangi xatboshi.")} />
        </section>

        <section className="panel">
          <h3 className="panel__title">2. {t('Formulalar')}</h3>
          <p className="form__note">{t("Yozish: x^2 → daraja, v_0 → indeks, * → ko'paytirish, sqrt(…) → ildiz, rho/alpha/Delta → yunon harflari.")}</p>
          {m.formulas.map((f, i) => (
            <div className="frow" key={i}>
              <input className="input mono" placeholder="E_k = m*v^2/2" value={f.expr} maxLength={200}
                onChange={(e) => set({ formulas: m.formulas.map((x, j) => (j === i ? { ...x, expr: e.target.value } : x)) })} />
              <input className="input" placeholder={t('Nomi / izohi')} value={f.desc} maxLength={300}
                onChange={(e) => set({ formulas: m.formulas.map((x, j) => (j === i ? { ...x, desc: e.target.value } : x)) })} />
              <span className="frow__prev">{f.expr && <Formula expr={f.expr} />}</span>
              <button type="button" className="icon-btn" onClick={() => set({ formulas: m.formulas.filter((_, j) => j !== i) })} aria-label={t("O'chirish")}>{IC.close}</button>
            </div>
          ))}
          <button type="button" className="btn btn--sm" onClick={() => set({ formulas: [...m.formulas, { expr: '', desc: '' }] })}>+ {t('Formula')}</button>
        </section>

        <section className="panel">
          <h3 className="panel__title">3. {t('Videodars')}</h3>
          <label className="field">
            <span className="field__label">{t('Asosiy video havolasi (YouTube, Vimeo, Google Drive yoki .mp4)')}</span>
            <input className="input" type="url" maxLength={500} placeholder="https://youtu.be/…" value={m.video_url} onChange={(e) => set({ video_url: e.target.value })} />
          </label>
          {m.video_url && <VideoEmbed url={m.video_url} />}
          <p className="field__label" style={{ marginTop: 12 }}>{t("Qo'shimcha videolar")}</p>
          {m.extra_videos.map((v, i) => (
            <div className="frow" key={i}>
              <input className="input" placeholder={t('Sarlavha')} value={v.title} maxLength={200}
                onChange={(e) => set({ extra_videos: m.extra_videos.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
              <input className="input" type="url" placeholder="https://…" value={v.url} maxLength={500}
                onChange={(e) => set({ extra_videos: m.extra_videos.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} />
              <button type="button" className="icon-btn" onClick={() => set({ extra_videos: m.extra_videos.filter((_, j) => j !== i) })}>{IC.close}</button>
            </div>
          ))}
          {m.extra_videos.length < 10 && <button type="button" className="btn btn--sm" onClick={() => set({ extra_videos: [...m.extra_videos, { title: '', url: '' }] })}>+ {t('Video')}</button>}
        </section>
      </fieldset>

      <section className="panel">
        <div className="thead">
          <h3 className="panel__title">4. {t('Savollar banki')}</h3>
          <Segmented value={audience} onChange={setAudience} options={[
            { value: 'student', label: `${t("O'quvchilar (test/masala)")} · ${m.question_counts?.student ?? 0}` },
            { value: 'teacher', label: `${t("O'qituvchi tayyorgarligi")} · ${m.question_counts?.teacher ?? 0}` },
          ]} />
        </div>
        <p className="form__note">
          {audience === 'student'
            ? t("Videodan keyin o'quvchi shu savollarni yechadi; o'qituvchilar ularni uy vazifasiga ham qo'shadi.")
            : t("O'qituvchi «Darsga tayyorgarlik» tekshiruvida shu savollarni oladi — tajriba bosqichlari va jihozlar bo'yicha savollar avtomatik qo'shiladi.")}
        </p>
        {questions.isLoading && <Skeleton lines={3} />}
        {list.map(([key, q], i) => (
          <div key={key} className="qwrap">
            <fieldset className="fs" disabled={readOnly}>
              <QuestionEditor index={i} value={q} onChange={(nq) => setDrafts((d) => ({ ...d, [key]: nq }))}
                onRemove={readOnly ? undefined : () => (q.id ? deleteQuestion(q) : setDrafts((d) => { const n = { ...d }; delete n[key]; return n }))} />
            </fieldset>
            {drafts[key] && !readOnly && <button className="btn btn--sm btn--primary" onClick={() => saveQuestion(key, drafts[key])}>{t('Savolni saqlash')}</button>}
          </div>
        ))}
        {!readOnly && (
          <button type="button" className="btn btn--sm" onClick={() => setDrafts((d) => ({ ...d, [`new${Date.now()}`]: { ...EMPTY_QUESTION, options: ['', '', '', ''] } }))}>
            + {t("Savol qo'shish")}
          </button>
        )}
      </section>
    </div>
  )
}

export function MaterialsPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [grade, setGrade] = useState(7)
  const [open, setOpen] = useState<number | null>(null)
  const { data, isLoading } = useQuery({
    queryKey: ['learning', 'materials', grade],
    queryFn: async () => (await api.get<MaterialRow[]>('/learning/materials/', { params: { grade } })).data,
  })

  if (open) return <MaterialEditor lessonId={open} readOnly={!isAdmin(user)} onBack={() => setOpen(null)} />

  const ready = data?.filter((r) => r.is_published).length ?? 0
  return (
    <div>
      <PageHead title={t("O'quv materiallari")} sub={`${t("O'quvchilar ko'radigan nazariya, formula, video va savollar.")} ${data ? `${ready}/${data.length} ${t("tayyor")}` : ''}`}
        actions={<Segmented value={grade} onChange={setGrade} options={[7, 8, 9].map((g) => ({ value: g, label: `${g}-${t('sinf')}` }))} />} />
      {isLoading ? <Skeleton lines={8} /> : (
        <section className="panel">
          <div className="tablewrap">
            <table className="dtable">
              <thead><tr><th>{t('Hafta')}</th><th>{t('Dars')}</th><th>{t('Nazariya')}</th><th>{t('Video')}</th><th>{t('Formula')}</th><th>{t('Savollar')}</th><th>{t('Tayyorgarlik')}</th><th>{t('Holat')}</th></tr></thead>
              <tbody>
                {data?.map((r) => (
                  <tr key={r.lesson} className="is-click" onClick={() => setOpen(r.lesson)}>
                    <td>{r.hafta}</td>
                    <td><button className="linklike">{r.title}</button></td>
                    <td>{r.has_theory ? '✓' : '—'}</td>
                    <td>{r.has_video ? '✓' : '—'}</td>
                    <td>{r.formulas || '—'}</td>
                    <td>{r.question_counts.student ?? 0}</td>
                    <td>{r.question_counts.teacher ?? 0}</td>
                    <td><StatusPill tone={r.is_published ? 'ok' : 'muted'}>{r.is_published ? t("E'lon qilingan") : t('Qoralama')}</StatusPill></td>
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
