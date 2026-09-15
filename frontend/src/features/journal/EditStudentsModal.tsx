import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { IC } from '@/icons'

import { useAddStudent, useRemoveStudent, useUpdateStudent } from './api'
import type { JournalClass, Student } from './types'

interface Row {
  id: number | null
  name: string
}

// Excel/Sheets paste of a student list, in any of the shapes a gradebook
// tends to come in: a plain single name-per-line column, a "№ | Familiya
// Ism" numbered column, or "Familiya | Ism" as two separate columns (the
// most common export shape) — with or without a leading № column too.
// Cells are tab-separated per line; a leading cell that's pure digits is a
// row number and gets dropped, and whatever name-part cells remain are
// joined with a space, so two columns become one "Familiya Ism" name
// instead of only the last column surviving.
function parsePastedNames(text: string): string[] {
  return text
    .split(/\r\n|\r|\n/)
    .map((line) => {
      let cells = line.split('\t').map((c) => c.trim()).filter(Boolean)
      if (cells.length > 1 && /^\d+$/.test(cells[0])) cells = cells.slice(1)
      return cells.join(' ').trim()
    })
    .filter(Boolean)
}

export function EditStudentsModal({ cls, onClose }: { cls: JournalClass; onClose: () => void }) {
  const { t } = useTranslation()
  const active = [...cls.students.filter((s) => s.active)].sort((a, b) => a.full_name.localeCompare(b.full_name, 'uz'))
  const [rows, setRows] = useState<Row[]>(active.map((s) => ({ id: s.id, name: s.full_name })))
  const add = useAddStudent(cls.id)
  const update = useUpdateStudent(cls.id)
  const remove = useRemoveStudent(cls.id)
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  const setName = (i: number, name: string) => setRows((r) => r.map((row, idx) => (idx === i ? { ...row, name } : row)))
  const removeRow = (i: number) => setRows((r) => r.filter((_, idx) => idx !== i))
  const addRow = () => setRows((r) => [...r, { id: null, name: '' }])

  // Pasting a whole roster copied from Excel/Sheets into any one name
  // field fills that row and inserts the rest right after it, instead of
  // dumping every line into a single input — a single-name paste (no
  // newline) falls through to the browser's own default paste.
  const handlePaste = (i: number) => (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text')
    if (!/\r|\n/.test(text)) return
    e.preventDefault()
    const names = parsePastedNames(text)
    if (!names.length) return
    setRows((r) => {
      const next = [...r]
      next[i] = { ...next[i], name: names[0] }
      next.splice(i + 1, 0, ...names.slice(1).map((name) => ({ id: null, name })))
      return next
    })
  }

  const submit = async () => {
    // Re-sorted alphabetically on every save (matches the old system's
    // behavior) — a rename can move a row to a new place in the list, so
    // the final order is always derived fresh from the current names.
    const kept = rows
      .filter((r) => r.name.trim())
      .map((r) => ({ ...r, name: r.name.trim() }))
      .sort((a, b) => a.name.localeCompare(b.name, 'uz'))
    if (!kept.length) return toast(t("Kamida bitta o'quvchi qoldiring"), 'error')
    setBusy(true)
    try {
      const keptIds = new Set(kept.filter((r) => r.id !== null).map((r) => r.id))
      for (const s of active) {
        if (!keptIds.has(s.id)) await remove.mutateAsync(s.id)
      }
      for (let i = 0; i < kept.length; i++) {
        const row = kept[i]
        if (row.id === null) {
          await add.mutateAsync({ full_name: row.name, order: i })
          continue
        }
        const original = active.find((s) => s.id === row.id)
        const full_name = original && original.full_name !== row.name ? row.name : undefined
        const order = original && original.order !== i ? i : undefined
        if (full_name !== undefined || order !== undefined) await update.mutateAsync({ id: row.id, full_name, order })
      }
      toast(t("O'quvchilar ro'yxati yangilandi"))
      onClose()
    } catch {
      toast(t('Xatolik yuz berdi'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={active.length ? t("O'quvchilar ro'yxati") : t("O'quvchilarni qo'shish")}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>{t('Bekor qilish')}</button>
          <button className="btn btn--primary" onClick={submit} disabled={busy}>{t('Saqlash')}</button>
        </>
      }
    >
      <p className="prose prose--note">
        {t("Ismni tahrirlang yoki o'chiring, pastda yangi o'quvchi qo'shing. Saqlanganda ro'yxat alifbo tartibida shakllanadi.")}
        {' '}{t("Excel'dan nusxalangan ro'yxatni ham istalgan maydonga joylashtirsangiz bo'ladi — har bir qator alohida o'quvchi bo'lib qo'shiladi.")}
      </p>
      <div className="su-list">
        {rows.map((row, i) => (
          <div key={i} className="su-row">
            <input
              className="input"
              value={row.name}
              onChange={(e) => setName(i, e.target.value)}
              onPaste={handlePaste(i)}
              placeholder={t('Ism familiya')}
            />
            <button type="button" className="icon-btn icon-btn--danger" onClick={() => removeRow(i)} title={t("O'chirish")}>
              {IC.trash}
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="btn btn--sm" onClick={addRow}>+ {t("Yana o'quvchi")}</button>
    </Modal>
  )
}

export type { Student }
