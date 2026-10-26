import { isAxiosError } from 'axios'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useConfirm } from '@/components/ConfirmProvider'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { useUIStore } from '@/store/uiStore'

import { useDeleteControl, useSaveControl } from './api'
import { quarterLabel } from './labels'
import { localToday } from './lock'
import { levelOf, markLabel } from './scales'
import type { ControlWork, Student } from './types'

const parse = (v: string) => (v.trim() === '' ? null : Number(v))
const valid = (n: number | null) => n === null || (Number.isInteger(n) && n >= 0 && n <= 100)

/** Ma'muriyat: give or correct a nazorat ishi — every pupil's result out
 * of 100, its colour band beside it as it's typed. Enter moves down. */
export function ControlWorkModal({ classId, chorak, students, work, onClose }: {
  classId: number
  chorak: number
  students: Student[]
  work: ControlWork | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const lang = useUIStore((s) => s.lang)
  const toast = useToast()
  const confirm = useConfirm()
  const save = useSaveControl(classId)
  const remove = useDeleteControl(classId)
  const [date, setDate] = useState(work?.date ?? localToday())
  const [quarter, setQuarter] = useState(work?.chorak ?? chorak)
  const [title, setTitle] = useState(work?.title ?? '')
  const [marks, setMarks] = useState<Record<number, string>>(() =>
    Object.fromEntries(students.map((s) => [s.id, work?.marks[s.id] != null ? String(work.marks[s.id]) : ''])))

  const values = students.map((s) => parse(marks[s.id] ?? ''))
  const bad = values.some((n) => !valid(n))
  const given = values.filter((n): n is number => n !== null && valid(n))
  const avg = given.length ? Math.round(given.reduce((a, b) => a + b, 0) / given.length) : null

  const submit = async () => {
    if (!date) return toast(t('Sanani tanlang'), 'error')
    if (bad) return toast(t("Ball 0 dan 100 gacha bo'ladi"), 'error')
    const body = {
      date, chorak: quarter, title: title.trim(),
      marks: students.map((s, i) => ({ student_id: s.id, mark: values[i] })),
    }
    try {
      await save.mutateAsync(work ? { id: work.id, ...body } : { journal_class: classId, ...body })
      toast(t('Nazorat ishi saqlandi'))
      onClose()
    } catch (err) {
      const detail = isAxiosError<{ detail?: string }>(err) ? err.response?.data?.detail : undefined
      toast(t(detail ?? 'Xatolik yuz berdi'), 'error')
    }
  }

  const onDelete = async () => {
    if (!work) return
    if (!(await confirm({ title: t("Nazorat ishini o'chirish"), text: t("Bu nazorat ishi va uning barcha ballari o'chiriladi."), danger: true }))) return
    try {
      await remove.mutateAsync(work.id)
      toast(t("Nazorat ishi o'chirildi"))
      onClose()
    } catch {
      toast(t('Xatolik yuz berdi'), 'error')
    }
  }

  const next = (i: number) => {
    const el = document.querySelector<HTMLInputElement>(`[data-ctl="${i + 1}"]`)
    if (el) { el.focus(); el.select() } else void submit()
  }

  return (
    <Modal
      title={work ? t('Nazorat ishi') : t("Nazorat ishi qo'shish")}
      onClose={onClose}
      footer={
        <>
          {work && <button className="btn btn--ghost ctl__del" onClick={onDelete} disabled={remove.isPending}>{t("O'chirish")}</button>}
          <button className="btn" onClick={onClose}>{t('Bekor qilish')}</button>
          <button className="btn btn--primary" onClick={submit} disabled={save.isPending || bad}>{t('Saqlash')}</button>
        </>
      }
    >
      <div className="ctl__meta">
        <label className="field">
          <span className="field__label">{t('Sana')}</span>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">{t('Chorak')}</span>
          <select className="input" value={quarter} onChange={(e) => setQuarter(Number(e.target.value))}>
            {[1, 2, 3, 4].map((q) => <option key={q} value={q}>{quarterLabel(q, lang)}</option>)}
          </select>
        </label>
        <label className="field ctl__title">
          <span className="field__label">{t('Mavzu')} <span className="field__opt">({t('ixtiyoriy')})</span></span>
          <input className="input" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder={t('Masalan: Mexanika')} />
        </label>
      </div>

      <ol className="ctl__list">
        {students.map((s, i) => {
          const n = values[i]
          const ok = valid(n)
          return (
            <li key={s.id} className="ctl__row">
              <span className="ctl__no">{i + 1}</span>
              <span className="ctl__nm">{s.full_name}</span>
              <input
                className={`input ctl__in ${!ok ? 'is-bad' : n !== null ? `gchip--${levelOf(n, 100)}` : ''}`}
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                data-ctl={i}
                autoFocus={i === 0}
                value={marks[s.id] ?? ''}
                aria-label={`${s.full_name} — ${t('ball')}`}
                onChange={(e) => setMarks((m) => ({ ...m, [s.id]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); next(i) } }}
              />
              <span className={`gchip ${n !== null && ok ? `gchip--${levelOf(n, 100)}` : 'gchip--none'} ctl__lvl`}>
                {n !== null && ok ? t(markLabel(n, 100)) : ok ? '—' : '0–100'}
              </span>
            </li>
          )
        })}
      </ol>
      <p className="ctl__sum">
        {t('Kiritildi')}: <b>{given.length}</b> / {students.length}
        {avg !== null && <> · {t("O'rtacha ball")}: <b>{avg}</b></>}
      </p>
    </Modal>
  )
}
