import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useConfirm } from '@/components/ConfirmProvider'
import { EmptyState } from '@/components/EmptyState'
import { Modal } from '@/components/Modal'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import {
  useInvalidateLearning,
  useLessonOptions,
  useReports,
  useTeacherClasses,
  type LessonReport,
} from '@/features/learning/api'
import { errText, fmtDate, PageHead, PercentPill, Stars, StatusPill } from '@/features/portal/ui'
import { IC } from '@/icons'
import { api } from '@/lib/api/client'

export const REPORT_STATUS: Record<LessonReport['status'], { label: string; tone: 'ok' | 'mid' | 'info' }> = {
  submitted: { label: "Ko'rib chiqilmoqda", tone: 'info' },
  reviewed: { label: 'Baholandi', tone: 'ok' },
  returned: { label: 'Qayta ishlashga qaytarildi', tone: 'mid' },
}

function ReportForm({ initial, onClose }: { initial: LessonReport | null; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const invalidate = useInvalidateLearning()
  const { data: classes } = useTeacherClasses()
  const [classId, setClassId] = useState<number | ''>(initial?.journal_class ?? '')
  const grade = classes?.find((c) => c.id === classId)?.grade ?? null
  const { data: lessons } = useLessonOptions(grade)
  const [lesson, setLesson] = useState<number | ''>(initial?.lesson ?? '')
  const [date, setDate] = useState(initial?.date ?? new Date().toISOString().slice(0, 10))
  const [topic, setTopic] = useState(initial?.topic ?? '')
  const [summary, setSummary] = useState(initial?.summary ?? '')
  const [methods, setMethods] = useState(initial?.methods ?? '')
  const [present, setPresent] = useState(initial?.students_present?.toString() ?? '')
  const [total, setTotal] = useState(initial?.students_total?.toString() ?? '')
  const [links, setLinks] = useState<string[]>(initial?.media_links.length ? initial.media_links : [''])
  const [busy, setBusy] = useState(false)

  const save = async () => {
    const body = {
      journal_class: classId || null,
      lesson: lesson || null,
      date,
      topic: topic.trim() || lessons?.find((l) => l.id === lesson)?.title || '',
      summary,
      methods,
      students_present: present ? Number(present) : null,
      students_total: total ? Number(total) : null,
      media_links: links.map((l) => l.trim()).filter(Boolean),
    }
    setBusy(true)
    try {
      if (initial) await api.patch(`/learning/reports/${initial.id}/`, body)
      else await api.post('/learning/reports/', body)
      invalidate()
      toast(t("Hisobot ma'muriyatga topshirildi"))
      onClose()
    } catch (err) {
      toast(t(errText(err)), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={initial ? t('Hisobotni tahrirlash') : t('Darsni topshirish (hisobot)')} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>{t('Bekor qilish')}</button><button className="btn btn--primary" disabled={busy} onClick={save}>{t('Topshirish')}</button></>}>
      <div className="row row--3">
        <label className="field">
          <span className="field__label">{t('Sana')}</span>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">{t('Sinf')}</span>
          <select className="input" value={classId} onChange={(e) => { setClassId(e.target.value ? Number(e.target.value) : ''); setLesson('') }}>
            <option value="">—</option>
            {classes?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field__label">{t('Dars (rejadan)')}</span>
          <select className="input" value={lesson} onChange={(e) => setLesson(e.target.value ? Number(e.target.value) : '')}>
            <option value="">—</option>
            {lessons?.map((l) => <option key={l.id} value={l.id}>{l.hafta}: {l.title}</option>)}
          </select>
        </label>
      </div>
      <label className="field">
        <span className="field__label">{t('Mavzu')}</span>
        <input className="input" maxLength={255} value={topic} placeholder={lessons?.find((l) => l.id === lesson)?.title ?? ''} onChange={(e) => setTopic(e.target.value)} />
      </label>
      <label className="field">
        <span className="field__label">{t('Dars qanday o\'tdi?')}</span>
        <textarea className="input" rows={4} maxLength={8000} value={summary} onChange={(e) => setSummary(e.target.value)}
          placeholder={t("Qaysi tajribalar o'tkazildi, o'quvchilar nimani o'rgandi, nima yaxshi chiqdi, nima qiyin bo'ldi…")} />
      </label>
      <label className="field">
        <span className="field__label">{t('Qo\'llangan metodlar (ixtiyoriy)')}</span>
        <textarea className="input" rows={2} maxLength={4000} value={methods} onChange={(e) => setMethods(e.target.value)} placeholder={t("Guruhli ish, aqliy hujum, o'yin…")} />
      </label>
      <div className="row row--2">
        <label className="field">
          <span className="field__label">{t('Qatnashdi')}</span>
          <input className="input" type="number" min={0} value={present} onChange={(e) => setPresent(e.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">{t("Sinfdagi jami o'quvchi")}</span>
          <input className="input" type="number" min={0} value={total} onChange={(e) => setTotal(e.target.value)} />
        </label>
      </div>
      <div className="field">
        <span className="field__label">{t('Foto/video havolalari (Google Drive, YouTube…)')}</span>
        {links.map((l, i) => (
          <div className="row row--2" key={i} style={{ marginBottom: 6 }}>
            <input className="input" type="url" placeholder="https://…" value={l} onChange={(e) => setLinks(links.map((x, j) => (j === i ? e.target.value : x)))} />
            <button type="button" className="btn btn--ghost" onClick={() => setLinks(links.filter((_, j) => j !== i))}>{IC.close}</button>
          </div>
        ))}
        {links.length < 10 && <button type="button" className="btn btn--sm btn--ghost" onClick={() => setLinks([...links, ''])}>+ {t('Havola')}</button>}
      </div>
      <p className="form__note">{t("Shu dars bo'yicha «Darsga tayyorgarlik» tekshiruvidan o'tgan bo'lsangiz, natijangiz hisobotga avtomatik qo'shiladi.")}</p>
    </Modal>
  )
}

export function ReportCard({ r, actions }: { r: LessonReport; actions?: React.ReactNode }) {
  const { t } = useTranslation()
  return (
    <article className="rcard">
      <header className="rcard__head">
        <div>
          <p className="rcard__meta">{fmtDate(r.date)} · {r.class_name || '—'} · {r.teacher_name}</p>
          <h4 className="rcard__title">{r.topic}</h4>
        </div>
        <StatusPill tone={REPORT_STATUS[r.status].tone}>{t(REPORT_STATUS[r.status].label)}</StatusPill>
      </header>
      <p className="rcard__sum">{r.summary}</p>
      {r.methods && <p className="rcard__line"><span>{t('Metodlar')}:</span> {r.methods}</p>}
      <p className="rcard__line">
        {r.students_present != null && <><span>{t('Qatnashdi')}:</span> {r.students_present}{r.students_total ? `/${r.students_total}` : ''} · </>}
        <span>{t('Tayyorgarlik')}:</span> {r.readiness_percent != null ? <PercentPill value={r.readiness_percent} /> : t("tekshirilmagan")}
      </p>
      {r.media_links.length > 0 && (
        <p className="rcard__links">
          {r.media_links.map((l, i) => <a key={i} href={l} target="_blank" rel="noopener noreferrer">{IC.external} {t('Havola')} {i + 1}</a>)}
        </p>
      )}
      {r.status !== 'submitted' && (
        <div className="rcard__review">
          {r.rating && <Stars value={r.rating} size={18} />}
          {r.review_comment && <p>«{r.review_comment}»</p>}
          {r.reviewed_by_name && <small>— {r.reviewed_by_name}</small>}
        </div>
      )}
      {actions && <div className="rcard__acts">{actions}</div>}
    </article>
  )
}

export function ReportsPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const invalidate = useInvalidateLearning()
  const { data, isLoading } = useReports({ mine: '1' })
  const [editing, setEditing] = useState<LessonReport | null | 'new'>(null)

  const remove = async (r: LessonReport) => {
    if (!(await confirm({ title: t("Hisobotni o'chirish"), text: r.topic, danger: true }))) return
    try {
      await api.delete(`/learning/reports/${r.id}/`)
      invalidate()
    } catch (err) {
      toast(t(errText(err)), 'error')
    }
  }

  return (
    <div>
      <PageHead title={t('Dars hisobotlari')} sub={t("O'tgan darsingizni ma'muriyatga topshiring — baholangan hisobotlar «eng yaxshi dars» reytingiga kiradi.")}
        actions={<button className="btn btn--primary" onClick={() => setEditing('new')}>+ {t('Darsni topshirish')}</button>} />
      {isLoading && <Skeleton lines={5} />}
      {!isLoading && !data?.length && <EmptyState title={t("Hali hisobot yo'q")} hint={t("Darsdan keyin «Darsni topshirish» tugmasini bosing.")} />}
      <div className="rlist">
        {data?.map((r) => (
          <ReportCard key={r.id} r={r} actions={r.status !== 'reviewed' && (
            <>
              <button className="btn btn--sm" onClick={() => setEditing(r)}>{IC.edit} {r.status === 'returned' ? t('Tuzatib qayta topshirish') : t('Tahrirlash')}</button>
              <button className="btn btn--sm btn--ghost" onClick={() => remove(r)}>{IC.trash}</button>
            </>
          )} />
        ))}
      </div>
      {editing && <ReportForm initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
