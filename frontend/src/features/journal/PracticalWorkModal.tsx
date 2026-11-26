import { isAxiosError } from 'axios'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useConfirm } from '@/components/ConfirmProvider'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { useYears } from '@/features/schools/api'
import { useUIStore } from '@/store/uiStore'

import { useDeletePractical, useSavePractical } from './api'
import { chorakOf } from './calendar'
import { quarterLabel } from './labels'
import { localToday } from './lock'
import { KIND_LABEL } from './practicals'
import { levelOf, markLabel, type Scale } from './scales'
import type { PracticalWork, Student } from './types'

const parse = (v: string) => (v.trim() === '' ? null : Number(v))

/** The class's teacher: give or grade an amaliy ish — a laboratoriya ishi
 *  or a STEM loyiha — every pupil's mark on the class's scale, its colour
 *  band beside it as it's typed. Enter moves down. It stays out of the
 *  averages and the quarter grade. */
export function PracticalWorkModal({ classId, chorak, scale, students, work, onClose }: {
  classId: number
  chorak: number
  scale: Scale
  students: Student[]
  work: PracticalWork | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const lang = useUIStore((s) => s.lang)
  const toast = useToast()
  const confirm = useConfirm()
  const save = useSavePractical(classId)
  const remove = useDeletePractical(classId)
  const { data: years } = useYears()
  const [kind, setKind] = useState<PracticalWork['kind']>(work?.kind ?? 'lab')
  const [date, setDate] = useState(work?.date ?? localToday())
  const [quarter, setQuarter] = useState(() => work?.chorak ?? (years ? chorakOf(localToday(), years) : chorak))
  const pickDate = (v: string) => {
    setDate(v)
    if (v && years) setQuarter(chorakOf(v, years))
  }
  const [title, setTitle] = useState(work?.title ?? '')
  const [marks, setMarks] = useState<Record<number, string>>(() =>
    Object.fromEntries(students.map((s) => [s.id, work?.marks[s.id] != null ? String(work.marks[s.id]) : ''])))

  const valid = (n: number | null) => n === null || (Number.isInteger(n) && n >= 0 && n <= scale)
  const values = students.map((s) => parse(marks[s.id] ?? ''))
  const bad = values.some((n) => !valid(n))
  const given = values.filter((n): n is number => n !== null && valid(n))

  const submit = async () => {
    if (!date) return toast(t('Sanani tanlang'), 'error')
    if (bad) return toast(`${t('Baho')} 0–${scale}`, 'error')
    const body = {
      kind, date, chorak: quarter, title: title.trim(),
      marks: students.map((s, i) => ({ student_id: s.id, mark: values[i] })),
    }
    try {
      await save.mutateAsync(work ? { id: work.id, ...body } : { journal_class: classId, ...body })
      toast(t('Amaliy ish saqlandi'))
      onClose()
    } catch (err) {
      const data = isAxiosError<{ detail?: string; marks?: string[] }>(err) ? err.response?.data : undefined
      toast(t(data?.detail ?? data?.marks?.[0] ?? 'Xatolik yuz berdi'), 'error')
    }
  }

  const onDelete = async () => {
    if (!work) return
    if (!(await confirm({ title: t("Amaliy ishni o'chirish"), text: t("Bu amaliy ish va uning barcha baholari o'chiriladi."), danger: true }))) return
    try {
      await remove.mutateAsync(work.id)
      toast(t("Amaliy ish o'chirildi"))
      onClose()
    } catch {
      toast(t('Xatolik yuz berdi'), 'error')
    }
  }

  const next = (i: number) => {
    const el = document.querySelector<HTMLInputElement>(`[data-prac="${i + 1}"]`)
    if (el) { el.focus(); el.select() } else void submit()
  }

  return (
    <Modal
      title={work ? t(KIND_LABEL[work.kind]) : t("Amaliy ish qo'shish")}
      onClose={onClose}
      footer={
        <>
          {work && <button className="btn btn--ghost ctl__del" onClick={onDelete} disabled={remove.isPending}>{t("O'chirish")}</button>}
          <button className="btn" onClick={onClose}>{t('Bekor qilish')}</button>
          <button className="btn btn--primary" onClick={submit} disabled={save.isPending || bad}>{t('Saqlash')}</button>
        </>
      }
    >
      <div className="seg prac__kind" role="radiogroup" aria-label={t('Turi')}>
        {(['lab', 'stem'] as const).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} className={`seg__b ${kind === k ? 'is-on' : ''}`}
            onClick={() => setKind(k)}>{t(KIND_LABEL[k])}</button>
        ))}
      </div>
      <div className="ctl__meta">
        <label className="field">
          <span className="field__label">{t('Sana')}</span>
          <input className="input" type="date" value={date} onChange={(e) => pickDate(e.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">{t('Chorak')}</span>
          <select className="input" value={quarter} onChange={(e) => setQuarter(Number(e.target.value))}>
            {[1, 2, 3, 4].map((q) => <option key={q} value={q}>{quarterLabel(q, lang)}</option>)}
          </select>
        </label>
        <label className="field ctl__title">
          <span className="field__label">{t('Mavzu')} <span className="field__opt">({t('ixtiyoriy')})</span></span>
          <input className="input" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)}
            placeholder={kind === 'lab' ? t('Masalan: Ishqalanish koeffitsiyentini aniqlash') : t('Masalan: Aqlli svetofor')} />
        </label>
      </div>
      <p className="prose prose--note prac__note">{t("Amaliy ish bahosi o'rtacha ballga va chorak bahosiga ta'sir qilmaydi — jurnalda alohida ko'rsatiladi.")}</p>

      <ol className="ctl__list">
        {students.map((s, i) => {
          const n = values[i]
          const ok = valid(n)
          return (
            <li key={s.id} className="ctl__row">
              <span className="ctl__no">{i + 1}</span>
              <span className="ctl__nm">{s.full_name}</span>
              <input
                className={`input ctl__in ${!ok ? 'is-bad' : n !== null ? `gchip--${levelOf(n, scale)}` : ''}`}
                type="number"
                inputMode="numeric"
                min={0}
                max={scale}
                data-prac={i}
                autoFocus={i === 0}
                value={marks[s.id] ?? ''}
                aria-label={`${s.full_name} — ${t('baho')}`}
                onChange={(e) => setMarks((m) => ({ ...m, [s.id]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); next(i) } }}
              />
              <span className={`gchip ${n !== null && ok ? `gchip--${levelOf(n, scale)}` : 'gchip--none'} ctl__lvl`}>
                {n !== null && ok ? t(markLabel(n, scale)) : ok ? '—' : `0–${scale}`}
              </span>
            </li>
          )
        })}
      </ol>
      <p className="ctl__sum">{t('Baholandi')}: <b>{given.length}</b> / {students.length}</p>
    </Modal>
  )
}
