import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { useConfirm } from '@/components/ConfirmProvider'
import { EmptyState } from '@/components/EmptyState'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import type { Question } from '@/features/learning/api'
import { QuestionEditor } from '@/features/learning/QuestionEditor'
import { errText, PageHead } from '@/features/portal/ui'
import { IC } from '@/icons'
import { api } from '@/lib/api/client'

import {
  AUDIENCES, blankQuestion, useCourseEditor, useInvalidateTraining, useInvalidateTrainingViews,
  type Audience, type EditorCourse, type EditorLesson, type EditorModule,
} from './api'
import './training.css'

function move<T>(list: T[], i: number, d: -1 | 1): T[] {
  const j = i + d
  if (j < 0 || j >= list.length) return list
  const out = [...list]
  ;[out[i], out[j]] = [out[j], out[i]]
  return out
}

function CourseForm({ course }: { course: EditorCourse }) {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const invalidate = useInvalidateTrainingViews()
  const invalidateAll = useInvalidateTraining()
  const [base, setBase] = useState({
    title: course.title, summary: course.summary, hours: course.hours, audience: course.audience,
    pass_percent: course.pass_percent, is_published: course.is_published,
  })
  const [f, setF] = useState(base)
  const [busy, setBusy] = useState(false)
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }))
  const dirty = JSON.stringify(f) !== JSON.stringify(base)

  const save = async () => {
    setBusy(true)
    try {
      await api.patch(`/training/courses/${course.id}/`, f)
      setBase(f)
      invalidate()
      toast(t('Saqlandi'))
    } catch (err) {
      toast(t(errText(err)), 'error')
    } finally {
      setBusy(false)
    }
  }
  const remove = async () => {
    if (!(await confirm({
      title: t("Kursni o'chirish"), danger: true,
      text: t("Kurs, uning modullari va o'qituvchilarning shu kursdagi natijalari o'chadi. Berilgan sertifikatlar saqlanib qoladi."),
    }))) return
    try {
      await api.delete(`/training/courses/${course.id}/`)
      invalidateAll()
      navigate('/training')
    } catch (err) {
      toast(t(errText(err)), 'error')
    }
  }

  return (
    <section className="panel">
      <h3 className="panel__title">{t('Kurs haqida')}</h3>
      <div className="tform">
        <label className="field tform__wide">
          <span className="field__label">{t('Kurs nomi')}</span>
          <input className="input" maxLength={200} value={f.title} onChange={(e) => set({ title: e.target.value })} />
        </label>
        <label className="field tform__wide">
          <span className="field__label">{t('Qisqacha tavsif')}</span>
          <textarea className="input" rows={3} maxLength={2000} value={f.summary} onChange={(e) => set({ summary: e.target.value })} />
        </label>
        <label className="field">
          <span className="field__label">{t('Kimlar uchun')}</span>
          <select className="input" value={f.audience} onChange={(e) => set({ audience: e.target.value as Audience })}>
            {AUDIENCES.map((a) => <option key={a.value} value={a.value}>{t(a.label)}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field__label">{t('Hajmi (soat, sertifikatga yoziladi)')}</span>
          <input className="input" type="number" min={0} max={1000} value={f.hours} onChange={(e) => set({ hours: Math.max(0, Number(e.target.value) || 0) })} />
        </label>
        <label className="field">
          <span className="field__label">{t("Testdan o'tish chegarasi, %")}</span>
          <input className="input" type="number" min={1} max={100} value={f.pass_percent} onChange={(e) => set({ pass_percent: Math.min(100, Math.max(1, Number(e.target.value) || 70)) })} />
        </label>
        <label className="tswitch tform__wide">
          <input type="checkbox" checked={f.is_published} onChange={(e) => set({ is_published: e.target.checked })} />
          <span>
            <b>{t("E'lon qilingan")}</b>
            <small>{t("Yoqilsa, kurs mos o'qituvchilarga ko'rinadi va uni biriktirish mumkin.")}</small>
          </span>
        </label>
      </div>
      <div className="tform__acts">
        <button className="btn btn--ghost" onClick={remove}>{IC.trash} {t("Kursni o'chirish")}</button>
        <button className="btn btn--primary" disabled={busy || !dirty || !f.title.trim()} onClick={save}>{t('Saqlash')}</button>
      </div>
    </section>
  )
}

function LessonEditor({ value, index, onChange, onRemove, onMove }: {
  value: EditorLesson; index: number
  onChange: (l: EditorLesson) => void; onRemove: () => void; onMove: (d: -1 | 1) => void
}) {
  const { t } = useTranslation()
  const set = (patch: Partial<EditorLesson>) => onChange({ ...value, ...patch })
  return (
    <div className="tledit">
      <div className="tledit__head">
        <span className="qedit__n">{index + 1}</span>
        <input className="input" placeholder={t('Dars nomi')} maxLength={200} value={value.title} onChange={(e) => set({ title: e.target.value })} />
        <button type="button" className="icon-btn" aria-label={t('Yuqoriga')} onClick={() => onMove(-1)}>{IC.arrowUp}</button>
        <button type="button" className="icon-btn icon-btn--down" aria-label={t('Pastga')} onClick={() => onMove(1)}>{IC.arrowUp}</button>
        <button type="button" className="icon-btn" aria-label={t("O'chirish")} onClick={onRemove}>{IC.trash}</button>
      </div>
      <textarea className="input" rows={6} maxLength={50000} placeholder={t("Dars matni (xatboshilar orasida bo'sh qator qoldiring)")}
        value={value.body} onChange={(e) => set({ body: e.target.value })} />
      <input className="input" placeholder={t('Video havolasi (YouTube, Google Drive…) — ixtiyoriy')} value={value.video_url}
        onChange={(e) => set({ video_url: e.target.value })} />
      {value.links.map((x, i) => (
        <div className="tledit__link" key={i}>
          <input className="input input--sm" placeholder={t('Havola nomi')} value={x.title}
            onChange={(e) => set({ links: value.links.map((y, k) => (k === i ? { ...y, title: e.target.value } : y)) })} />
          <input className="input input--sm" placeholder="https://…" value={x.url}
            onChange={(e) => set({ links: value.links.map((y, k) => (k === i ? { ...y, url: e.target.value } : y)) })} />
          <button type="button" className="icon-btn" aria-label={t("O'chirish")} onClick={() => set({ links: value.links.filter((_, k) => k !== i) })}>{IC.close}</button>
        </div>
      ))}
      {value.links.length < 10 && (
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => set({ links: [...value.links, { title: '', url: '' }] })}>+ {t("Qo'shimcha havola")}</button>
      )}
    </div>
  )
}

function ModuleEditor({ value, index, count, onSaved, onRemoved, onMove }: {
  value: EditorModule; index: number; count: number
  onSaved: (m: EditorModule) => void; onRemoved: () => void; onMove: (d: -1 | 1) => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const [m, setM] = useState(value)
  const [open, setOpen] = useState(!value.lessons.length)
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const set = (patch: Partial<EditorModule>) => { setM((x) => ({ ...x, ...patch })); setDirty(true) }

  const save = async () => {
    setBusy(true)
    try {
      const res = await api.put<EditorModule>(`/training/modules/${m.id}/`, {
        title: m.title, test_size: m.test_size, lessons: m.lessons, questions: m.questions,
      })
      setM(res.data)
      setDirty(false)
      onSaved(res.data)
      toast(t('Modul saqlandi'))
    } catch (err) {
      toast(t(errText(err)), 'error')
    } finally {
      setBusy(false)
    }
  }
  const remove = async () => {
    if (!(await confirm({ title: t("Modulni o'chirish"), text: m.title, danger: true }))) return
    try {
      await api.delete(`/training/modules/${m.id}/`)
      onRemoved()
    } catch (err) {
      toast(t(errText(err)), 'error')
    }
  }

  return (
    <section className={`panel tmedit ${dirty ? 'is-dirty' : ''}`}>
      <div className="tmod__head">
        <span className="tmod__n">{index + 1}</span>
        <input className="input tmedit__title" maxLength={200} value={m.title} onChange={(e) => set({ title: e.target.value })} aria-label={t('Modul nomi')} />
        <small className="muted">{m.lessons.length} {t('dars')} · {m.questions.length} {t('savol')}</small>
        <button type="button" className="icon-btn" disabled={index === 0} aria-label={t('Yuqoriga')} onClick={() => onMove(-1)}>{IC.arrowUp}</button>
        <button type="button" className="icon-btn icon-btn--down" disabled={index === count - 1} aria-label={t('Pastga')} onClick={() => onMove(1)}>{IC.arrowUp}</button>
        <button type="button" className="btn btn--sm" onClick={() => setOpen((o) => !o)}>{open ? t('Yig\'ish') : t('Ochish')}</button>
      </div>
      {open && (
        <>
          <h4 className="tmedit__h">{t('Darslar')}</h4>
          {m.lessons.map((l, i) => (
            <LessonEditor key={l.id ?? `new-${i}`} value={l} index={i}
              onChange={(nl) => set({ lessons: m.lessons.map((x, k) => (k === i ? nl : x)) })}
              onRemove={() => set({ lessons: m.lessons.filter((_, k) => k !== i) })}
              onMove={(d) => set({ lessons: move(m.lessons, i, d) })} />
          ))}
          <button type="button" className="btn btn--sm" onClick={() => set({ lessons: [...m.lessons, { title: '', body: '', video_url: '', links: [] }] })}>+ {t("Dars qo'shish")}</button>

          <h4 className="tmedit__h">{t('Modul testi')}</h4>
          <p className="form__note">{t("Test bo'lmasa, modul darslari o'qilishi bilan o'tilgan hisoblanadi. Har urinishda variantlar va savollar tartibi aralashtiriladi.")}</p>
          {m.questions.map((q, i) => (
            <QuestionEditor key={i} index={i} value={q}
              onChange={(nq: Question) => set({ questions: m.questions.map((x, k) => (k === i ? nq : x)) })}
              onRemove={() => set({ questions: m.questions.filter((_, k) => k !== i) })} />
          ))}
          <div className="tmedit__qbar">
            <button type="button" className="btn btn--sm" onClick={() => set({ questions: [...m.questions, blankQuestion()] })}>+ {t("Savol qo'shish")}</button>
            {m.questions.length > 1 && (
              <label className="tmedit__size">
                <span>{t('Har urinishda savollar soni')}</span>
                <input className="input input--sm" type="number" min={0} max={m.questions.length} value={m.test_size}
                  onChange={(e) => set({ test_size: Math.max(0, Math.min(m.questions.length, Number(e.target.value) || 0)) })} />
                <small className="muted">{t('0 — hammasi')}</small>
              </label>
            )}
          </div>
        </>
      )}
      <div className="tform__acts">
        <button className="btn btn--ghost" onClick={remove}>{IC.trash} {t("Modulni o'chirish")}</button>
        {dirty && <span className="muted">{t("Saqlanmagan o'zgarishlar bor")}</span>}
        <button className="btn btn--primary" disabled={busy || !dirty || !m.title.trim()} onClick={save}>{t('Modulni saqlash')}</button>
      </div>
    </section>
  )
}

/** The administration builds a course: about it, then module by module —
 * lessons (text, video link, further links) and the module's test. */
export function CourseEditor() {
  const { t } = useTranslation()
  const { id } = useParams()
  const toast = useToast()
  const invalidate = useInvalidateTrainingViews()
  const qc = useQueryClient()
  const { data, isLoading, isError } = useCourseEditor(id)
  // next time the editor opens it loads afresh
  useEffect(() => () => qc.removeQueries({ queryKey: ['training', 'editor', id] }), [qc, id])
  // the loaded modules until the page changes them — from then on its own list
  const [local, setModules] = useState<EditorModule[] | null>(null)
  const modules = local ?? data?.modules ?? null

  if (isLoading) return <Skeleton lines={6} />
  if (isError || !data || !modules) return <EmptyState title={t('Kurs topilmadi')} action={<Link className="btn" to="/training">{t('Malaka oshirish')}</Link>} />

  const add = async () => {
    try {
      const res = await api.post<EditorModule>(`/training/courses/${data.id}/modules/`, { title: `${modules.length + 1}-modul` })
      setModules([...modules, res.data])
      invalidate()
    } catch (err) {
      toast(t(errText(err)), 'error')
    }
  }
  const reorder = async (i: number, d: -1 | 1) => {
    const next = move(modules, i, d)
    if (next === modules) return
    setModules(next)
    try {
      await api.post(`/training/courses/${data.id}/order/`, { modules: next.map((m) => m.id) })
      invalidate()
    } catch (err) {
      toast(t(errText(err)), 'error')
      setModules(modules)
    }
  }

  return (
    <div>
      <Link className="backlink" to={`/training/${data.id}`}>← {t("Kursni ko'rish")}</Link>
      <PageHead title={`${t('Kursni tahrirlash')}: ${data.title}`}
        sub={t("Har modul alohida saqlanadi. O'qituvchilar modullarni tartib bilan o'tadi: oldingi modul testidan o'tmaguncha keyingisi yopiq.")} />
      <CourseForm course={data} />
      {modules.map((m, i) => (
        <ModuleEditor key={m.id} value={m} index={i} count={modules.length}
          onSaved={(saved) => { setModules(modules.map((x) => (x.id === saved.id ? saved : x))); invalidate() }}
          onRemoved={() => { setModules(modules.filter((x) => x.id !== m.id)); invalidate() }}
          onMove={(d) => reorder(i, d)} />
      ))}
      <button className="btn btn--primary" onClick={add}>+ {t("Modul qo'shish")}</button>
    </div>
  )
}
