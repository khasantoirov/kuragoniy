import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useConfirm } from '@/components/ConfirmProvider'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { useUIStore } from '@/store/uiStore'

import { useDeleteClass, useGrid } from './api'
import { ClassModal } from './ClassModal'
import { EditStudentsModal } from './EditStudentsModal'
import { quarterLabel } from './labels'
import { computeStats } from './stats'
import type { JournalClass } from './types'

export function ClassSummary({ cls }: { cls: JournalClass }) {
  const { t } = useTranslation()
  const { lang } = useUIStore()
  const { data: grid, isLoading } = useGrid(cls.id)
  const deleteClass = useDeleteClass()
  const toast = useToast()
  const confirm = useConfirm()

  const [editingStudents, setEditingStudents] = useState(false)
  const [editingClass, setEditingClass] = useState(false)

  if (isLoading || !grid) return <Skeleton lines={4} />

  if (!grid.students.length) {
    return (
      <div className="empty">
        <div className="empty__rule" />
        <h3 className="empty__title">{cls.name} — {t("o'quvchi yo'q")}</h3>
        <p className="empty__hint">{t("O'quvchilarni qo'shing, keyin statistika shakllanadi.")}</p>
        <button className="btn btn--primary" onClick={() => setEditingStudents(true)}>{t("O'quvchi qo'shish")}</button>{' '}
        <button className="btn" onClick={() => setEditingClass(true)}>{t('Sinfni tahrirlash')}</button>{' '}
        <button className="btn btn--ghost" onClick={onRemoveClass}>{t("Sinfni o'chirish")}</button>
        {editingStudents && <EditStudentsModal cls={cls} onClose={() => setEditingStudents(false)} />}
        {editingClass && <ClassModal cls={cls} onClose={() => setEditingClass(false)} />}
      </div>
    )
  }

  async function onRemoveClass() {
    if (!(await confirm({ title: t("Sinfni o'chirish"), text: `"${cls.name}" ${t("va undagi barcha yozuvlar o'chiriladi.")}`, danger: true }))) return
    await deleteClass.mutateAsync(cls.id)
    toast(t("Sinf o'chirildi"))
  }

  const rows = [1, 2, 3, 4].map((q) => {
    const days = grid.days.filter((d) => d.chorak === q)
    const s = computeStats(grid, days)
    return { q, days: days.length, avg: s.classAvg, pct: s.pct }
  })
  const tot = computeStats(grid, grid.days)

  return (
    <div>
      <div className="jhead">
        <div className="jsum">
          <div className="jsum__b"><span>{t("Sinf o'rtachasi")}</span><b>{tot.classAvg ? tot.classAvg.toFixed(2) : '—'}</b></div>
          <div className="jsum__b"><span>{t("O'zlashtirish")}</span><b>{tot.pct !== null ? tot.pct + '%' : '—'}</b></div>
          <div className="jsum__b"><span>{t("O'quvchi")}</span><b>{grid.students.length}</b></div>
          <div className="jsum__b"><span>{t('Darslar soni')}</span><b>{grid.days.length}</b></div>
        </div>
        <div className="jhead__acts">
          <button className="btn btn--sm btn--ghost" onClick={onRemoveClass}>{t("Sinfni o'chirish")}</button>
        </div>
      </div>
      <div className="table-wrap">
        <table className="table table--quarters">
          <thead>
            <tr>
              <th>{t('Chorak')}</th>
              {rows.map((r) => (
                <th key={r.q} className="table__q">{quarterLabel(r.q, lang)}</th>
              ))}
              <th className="table__q"><b>{t('Umumiy')}</b></th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{t('Darslar soni')}</td>
              {rows.map((r) => (<td key={r.q} className="table__q">{r.days}</td>))}
              <td className="table__q"><b>{grid.days.length}</b></td>
            </tr>
            <tr>
              <td>{t("O'rtacha")}</td>
              {rows.map((r) => (<td key={r.q} className="table__q">{r.avg ? r.avg.toFixed(2) : '—'}</td>))}
              <td className="table__q"><b>{tot.classAvg ? tot.classAvg.toFixed(2) : '—'}</b></td>
            </tr>
            <tr>
              <td>{t("O'zlashtirish")}</td>
              {rows.map((r) => (<td key={r.q} className="table__q">{r.pct !== null ? r.pct + '%' : '—'}</td>))}
              <td className="table__q"><b>{tot.pct !== null ? tot.pct + '%' : '—'}</b></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
