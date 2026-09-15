import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useConfirm } from '@/components/ConfirmProvider'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { IC } from '@/icons'
import { record } from '@/lib/history'
import { tablePdf } from '@/lib/pdf'

import { AddDayModal } from './AddDayModal'
import { useBulkMarks, useDeleteClass, useDropDay, useGrid, useSetFinal } from './api'
import { ATT, attOf, fmtD, isAbsent, nextAtt } from './attendance'
import { ClassModal } from './ClassModal'
import { EditStudentsModal } from './EditStudentsModal'
import { EditTopicModal } from './EditTopicModal'
import { computeStats } from './stats'
import type { AttendanceStatus, JournalClass } from './types'

export function ClassGrid({ cls, chorak }: { cls: JournalClass; chorak: number }) {
  const { t } = useTranslation()
  const { data: grid, isLoading } = useGrid(cls.id)
  const bulkMarks = useBulkMarks(cls.id)
  const dropDay = useDropDay(cls.id)
  const setFinal = useSetFinal(cls.id)
  const deleteClass = useDeleteClass()
  const toast = useToast()
  const confirm = useConfirm()

  const [addingDay, setAddingDay] = useState(false)
  const [editingTopic, setEditingTopic] = useState<string | null>(null)
  const [editingClass, setEditingClass] = useState(false)
  const [editingStudents, setEditingStudents] = useState(false)

  if (isLoading || !grid) return <Skeleton lines={4} />

  const students = grid.students
  const days = grid.days.filter((d) => d.chorak === chorak).sort((a, b) => a.date.localeCompare(b.date))
  const stats = computeStats(grid, days)
  const finals = grid.finals[String(chorak)] ?? {}

  if (!students.length) {
    return (
      <div className="empty">
        <div className="empty__rule" />
        <h3 className="empty__title">{cls.name} — {t("o'quvchi yo'q")}</h3>
        <p className="empty__hint">{t("O'quvchilarni qo'shing, keyin baho va davomat kiritasiz.")}</p>
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

  const onMarkChange = async (studentId: number, dayDate: string, dayTopic: string, value: string) => {
    const v = value.replace(/[^1-5]/g, '').slice(0, 1)
    const after = v ? Number(v) : null
    const day = days.find((d) => d.date === dayDate)
    const before = day?.marks[studentId] ?? null
    const write = (mark: number | null) =>
      bulkMarks.mutateAsync({ date: dayDate, chorak, topic: dayTopic, marks: [{ student_id: studentId, mark }], attendance: [] })
    try {
      await write(after)
      if (before !== after) {
        record(t('Baho'), async () => { await write(before) }, async () => { await write(after) })
      }
    } catch {
      toast(t('Saqlashda xatolik'), 'error')
    }
  }

  const onAttendanceClick = async (studentId: number, dayDate: string, dayTopic: string, current: string | undefined) => {
    const next = nextAtt(current)
    const day = days.find((d) => d.date === dayDate)
    const markBefore = day?.marks[studentId] ?? null
    const write = (status: string | undefined, mark: number | null) =>
      bulkMarks.mutateAsync({
        date: dayDate, chorak, topic: dayTopic,
        marks: isAbsent(status || '') ? [{ student_id: studentId, mark: null }] : [{ student_id: studentId, mark }],
        attendance: [{ student_id: studentId, status: status ? (status as AttendanceStatus) : null }],
      })
    try {
      await write(next, isAbsent(next || '') ? null : markBefore)
      record(
        t('Davomat'),
        async () => { await write(current, markBefore) },
        async () => { await write(next, isAbsent(next || '') ? null : markBefore) },
      )
    } catch {
      toast(t('Saqlashda xatolik'), 'error')
    }
  }

  const onFinalChange = async (studentId: number, value: string) => {
    const v = value.replace(/[^1-5]/g, '').slice(0, 1)
    const after = v ? Number(v) : null
    const before = finals[studentId] ?? null
    const write = (mark: number | null) => setFinal.mutateAsync({ student_id: studentId, chorak, mark })
    try {
      await write(after)
      if (before !== after) {
        record(t('Chorak bahosi'), async () => { await write(before) }, async () => { await write(after) })
      }
    } catch {
      toast(t('Saqlashda xatolik'), 'error')
    }
  }

  const onDropDay = async (date: string) => {
    if (!(await confirm({ title: t("Kunni o'chirish"), text: `${fmtD(date)} — ${t("shu kundagi baho va davomat o'chiriladi.")}`, danger: true }))) return
    const day = days.find((d) => d.date === date)
    await dropDay.mutateAsync(date)
    toast(t("Kun o'chirildi"))
    if (day) {
      const restore = () =>
        bulkMarks.mutateAsync({
          date: day.date, chorak: day.chorak, topic: day.topic,
          marks: Object.entries(day.marks).map(([sid, mark]) => ({ student_id: Number(sid), mark })),
          attendance: Object.entries(day.attendance).map(([sid, status]) => ({ student_id: Number(sid), status })),
        })
      record(
        t("Kun o'chirildi"),
        async () => { await restore() },
        async () => { await dropDay.mutateAsync(date) },
      )
    }
  }

  const exportPdf = () => {
    const head = ['№', t("To'liq ism"), ...days.map((d) => fmtD(d.date)), t("O'rtacha"), t('Chorak')]
    const rows = students.map((s, i) => [
      i + 1, s.full_name,
      ...days.map((d) => d.marks[s.id] ?? (d.attendance[s.id] ? attOf(d.attendance[s.id]).ic : '')),
      stats.perStudent[i].avg ? stats.perStudent[i].avg.toFixed(2) : '',
      finals[s.id] ?? '',
    ])
    tablePdf(`${t('Jurnal')} — ${cls.name}`, head, rows, { orientation: 'landscape' })
  }

  return (
    <div>
      <div className="jhead">
        <div className="jsum">
          <div className="jsum__b"><span>{t("Sinf o'rtachasi")}</span><b>{stats.classAvg ? stats.classAvg.toFixed(2) : '—'}</b></div>
          <div className="jsum__b"><span>{t("O'zlashtirish")}</span><b>{stats.pct !== null ? stats.pct + '%' : '—'}</b></div>
          <div className="jsum__b"><span>{t("O'quvchi")}</span><b>{students.length}</b></div>
          <div className="jsum__b"><span>{t('Darslar soni')}</span><b>{days.length}</b></div>
        </div>
        <div className="jhead__acts">
          <button className="btn btn--sm btn--primary" onClick={() => setAddingDay(true)}>+ {t('Dars kuni')}</button>
          <button className="btn btn--sm" onClick={() => setEditingStudents(true)}>{t("O'quvchilar ro'yxati")}</button>
          <button className="btn btn--sm" onClick={exportPdf}>{IC.download} {t('Yuklab olish')}</button>
          <button className="btn btn--sm" onClick={() => setEditingClass(true)}>{t('Sinfni tahrirlash')}</button>
          <button className="btn btn--sm btn--ghost" onClick={onRemoveClass}>{t("Sinfni o'chirish")}</button>
        </div>
      </div>

      <p className="prose prose--note">
        {t('Avval belgini bosib davomatni belgilang, so\'ng darsda bo\'lgan o\'quvchiga baho qo\'ying (davomat "Sababli"/"Sababsiz" bo\'lsa, baho maydoni bloklanadi):')}{' '}
        {ATT.map((a) => (
          <span key={a.k}>
            <span className={`at ${a.cls}`}>{a.ic}</span> {t(a.label)}{' '}
          </span>
        ))}
      </p>

      <div className="table-wrap">
        <table className="jt">
          <thead>
            <tr>
              <th className="jt__no">№</th>
              <th className="jt__nm">{t("To'liq ism")}</th>
              {days.map((d) => (
                <th key={d.id} className="jt__d">
                  <span className="jt__dt" onClick={() => setEditingTopic(d.date)} title={d.topic || t('Mavzu kiritish')}>
                    {fmtD(d.date)}
                  </span>
                  <button className="jt__dx" onClick={() => onDropDay(d.date)} title={t("Kunni o'chirish")}>{IC.close}</button>
                  {d.topic && <span className="jt__topic" onClick={() => setEditingTopic(d.date)} title={d.topic}>{d.topic}</span>}
                </th>
              ))}
              <th className="jt__avg">{t("O'rtacha")}</th>
              <th className="jt__fin">{t('Chorak')}</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s, i) => (
              <tr key={s.id}>
                <td className="jt__no">{i + 1}</td>
                <td className="jt__nm">{s.full_name}</td>
                {days.map((d) => {
                  const a = attOf(d.attendance[s.id])
                  const absent = isAbsent(a.k)
                  return (
                    <td key={d.id} className="jt__c">
                      <div className="jt__c-in">
                        <button className={`at ${a.cls}`} title={t(a.label)} onClick={() => onAttendanceClick(s.id, d.date, d.topic, d.attendance[s.id])}>
                          {a.ic}
                        </button>
                        <input
                          className="mk"
                          inputMode="numeric"
                          maxLength={1}
                          defaultValue={absent ? '' : (d.marks[s.id] ?? '')}
                          disabled={absent}
                          onBlur={(e) => onMarkChange(s.id, d.date, d.topic, e.target.value)}
                        />
                      </div>
                    </td>
                  )
                })}
                <td className="jt__avg">{stats.perStudent[i].avg ? stats.perStudent[i].avg.toFixed(2) : '—'}</td>
                <td className="jt__fin">
                  <input
                    className="mk mk--fin"
                    inputMode="numeric"
                    maxLength={1}
                    defaultValue={finals[s.id] ?? ''}
                    onBlur={(e) => onFinalChange(s.id, e.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {addingDay && <AddDayModal classId={cls.id} chorak={chorak} onClose={() => setAddingDay(false)} />}
      {editingTopic && (
        <EditTopicModal
          classId={cls.id}
          day={days.find((d) => d.date === editingTopic)!}
          onClose={() => setEditingTopic(null)}
        />
      )}
      {editingClass && <ClassModal cls={cls} onClose={() => setEditingClass(false)} />}
      {editingStudents && <EditStudentsModal cls={cls} onClose={() => setEditingStudents(false)} />}
    </div>
  )
}
