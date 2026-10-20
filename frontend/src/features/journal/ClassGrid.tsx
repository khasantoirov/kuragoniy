import { isAxiosError } from 'axios'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { useConfirm } from '@/components/ConfirmProvider'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { fmtDateTime } from '@/features/portal/ui'
import { IC } from '@/icons'
import { record } from '@/lib/history'
import { tablePdf } from '@/lib/pdf'

import { AddDayModal } from './AddDayModal'
import { useBulkMarks, useDecideGrant, useDeleteClass, useDropDay, useGrid, useSetFinal } from './api'
import { ATT, attOf, fmtD } from './attendance'
import { ClassModal } from './ClassModal'
import { EditRequestModal } from './EditRequestModal'
import { GradeCell, GradeChip } from './GradeCell'
import { GRADES } from './grades'
import { GrantDayModal } from './GrantDayModal'
import { EditStudentsModal } from './EditStudentsModal'
import { canEditDay, grantFor, isPending, localToday } from './lock'
import { computeStats } from './stats'
import type { JournalClass } from './types'

/** The server's reason (e.g. "this day is closed") when it gives one. */
const errDetail = (err: unknown) => (isAxiosError<{ detail?: string }>(err) ? err.response?.data?.detail : undefined)

/** One class's journal for a quarter — the overview. Attendance and marks
 * are entered on a lesson's own page (DayPage), opened from a date or any
 * cell; here only the quarter grade is edited. With `teacherId` an
 * administrator is looking at that teacher's journal: everything is
 * read-only, and the lock on a closed day opens it for the teacher. */
export function ClassGrid({ cls, chorak, teacherId }: { cls: JournalClass; chorak: number; teacherId?: string }) {
  const { t } = useTranslation()
  const { data: grid, isLoading } = useGrid(cls.id, teacherId)
  const bulkMarks = useBulkMarks(cls.id)
  const dropDay = useDropDay(cls.id)
  const setFinal = useSetFinal(cls.id)
  const deleteClass = useDeleteClass()
  const toast = useToast()
  const confirm = useConfirm()
  const navigate = useNavigate()

  const [addingDay, setAddingDay] = useState(false)
  const [editingClass, setEditingClass] = useState(false)
  const [editingStudents, setEditingStudents] = useState(false)
  const [asking, setAsking] = useState<string | null>(null)
  const [granting, setGranting] = useState<string | null>(null)
  const decide = useDecideGrant()

  if (isLoading || !grid) return <Skeleton lines={4} />

  const lock = grid.lock
  const owner = !lock || lock.owner

  const students = grid.students
  const days = grid.days.filter((d) => d.chorak === chorak).sort((a, b) => a.date.localeCompare(b.date))
  const stats = computeStats(grid, days)
  const finals = grid.finals[String(chorak)] ?? {}

  if (!students.length && !owner) {
    return <p className="prose prose--note">{cls.name} — {t("o'quvchi yo'q")}</p>
  }
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

  const openDay = (date: string) =>
    navigate(`/journal/${cls.id}/day/${date}?q=${chorak}${teacherId ? `&teacher=${encodeURIComponent(teacherId)}` : ''}`)

  const onFinalChange = async (studentId: number, after: number | null) => {
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
    try {
      await dropDay.mutateAsync(date)
    } catch (err) {
      return toast(t(errDetail(err) ?? 'Xatolik yuz berdi'), 'error')
    }
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

  /** Clicking a closed day: an administrator opens it (for the teacher,
   * or for themselves in their own journal); a teacher asks for it. */
  const onLocked = (date: string) => {
    if (!lock) return
    if (lock.can_grant) setGranting(date)
    else if (!lock.owner) return
    else if (isPending(lock, date)) toast(t("So'rov yuborilgan — administrator javobini kuting."))
    else setAsking(date)
  }
  const onRevoke = async (grantId: number) => {
    if (!(await confirm({ title: t('Ruxsatni bekor qilish'), text: t("Bu kun yana yopiladi."), danger: true }))) return
    try {
      await decide.mutateAsync({ id: grantId, action: 'revoke' })
      toast(t('Ruxsat bekor qilindi'))
    } catch (err) {
      toast(t(errDetail(err) ?? 'Xatolik yuz berdi'), 'error')
    }
  }
  const lockedShown = !!lock && days.some((d) => d.date !== lock.today && !grantFor(lock, d.date))
  const lockNote = !lock ? '' : !lock.owner
    ? t("Bu jurnal faqat ko'rish uchun. Yopilgan kun yonidagi qulfni bossangiz, o'sha kunni o'qituvchiga tahrirlash uchun ochib berasiz.")
    : lock.can_grant
      ? t("O'tgan kunlar yopilgan: baho va davomat faqat dars kunining o'zida kiritiladi. Kerak bo'lsa, sana yonidagi qulfni bosib kunni o'zingizga ochishingiz mumkin.")
      : t("O'tgan kunlar yopilgan: baho va davomat faqat dars kunining o'zida kiritiladi. O'zgartirish kerak bo'lsa, sana yonidagi qulfni bosib administratordan ruxsat so'rang.")

  const exportPdf = () => {
    const head = ['№', t("To'liq ism"), ...days.map((d) => fmtD(d.date)), t("O'rtacha"), t('Chorak')]
    const rows = students.map((s, i) => [
      i + 1, s.full_name,
      ...days.map((d) => d.marks[s.id] ?? (d.attendance[s.id] ? attOf(d.attendance[s.id]).ic : '')),
      stats.perStudent[i].avg != null ? stats.perStudent[i].avg.toFixed(2) : '',
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
          {owner && <button className="btn btn--sm btn--primary" onClick={() => openDay(lock?.today ?? localToday())}>{IC.calendar} {t('Bugungi dars')}</button>}
          {owner && <button className="btn btn--sm" onClick={() => setAddingDay(true)}>+ {t('Dars kuni')}</button>}
          {owner && <button className="btn btn--sm" onClick={() => setEditingStudents(true)}>{t("O'quvchilar ro'yxati")}</button>}
          <button className="btn btn--sm" onClick={exportPdf}>{IC.download} {t('Yuklab olish')}</button>
          {owner && <button className="btn btn--sm" onClick={() => setEditingClass(true)}>{t('Sinfni tahrirlash')}</button>}
          {owner && <button className="btn btn--sm btn--ghost" onClick={onRemoveClass}>{t("Sinfni o'chirish")}</button>}
        </div>
      </div>

      <p className="prose prose--note">{t("Sana yoki katakni bosing — dars sahifasi ochiladi: davomat va baho o'sha yerda kiritiladi.")}</p>
      <p className="jlegend">
        {GRADES.filter((g) => g.v !== 0).map((g) => (
          <span key={g.v}><span className={`gchip gchip--${g.v}`}>{g.v === 1 ? '1/0' : g.v}</span> {t(g.label)}</span>
        ))}
        {ATT.filter((a) => a.k).map((a) => (
          <span key={a.k}><span className={`at ${a.cls}`}>{a.ic}</span> {t(a.label)}</span>
        ))}
      </p>

      {(lockedShown || !owner) && lock && (
        <p className="jlock__why">
          {IC.lock}
          <span>
            {lockNote}
            {lock.pending.length > 0 && <b> {lock.pending.length} {t("ta so'rov ko'rib chiqilmoqda.")}</b>}
          </span>
        </p>
      )}

      <div className="table-wrap">
        <table className="jt">
          <thead>
            <tr>
              <th className="jt__no">№</th>
              <th className="jt__nm">{t("To'liq ism")}</th>
              {days.map((d) => {
                const open = canEditDay(lock, d.date)
                // Closed for the journal's teacher: not today and not opened.
                const closed = !!lock && d.date !== lock.today && !grantFor(lock, d.date)
                const grant = lock && d.date !== lock.today ? grantFor(lock, d.date) : undefined
                const lockTitle = lock?.can_grant
                  ? t('Yopilgan — bosib ochib bering')
                  : isPending(lock, d.date) ? t("So'rov yuborilgan") : t("Yopilgan — ruxsat so'rash")
                const onHead = () => openDay(d.date)
                return (
                  <th key={d.id} className={`jt__d ${closed ? 'is-locked' : ''}`}>
                    <span className="jt__dt" onClick={onHead} title={d.topic || t('Dars sahifasini ochish')}>
                      {fmtD(d.date)}
                    </span>
                    {open ? (
                      <button className="jt__dx" onClick={() => onDropDay(d.date)} title={t("Kunni o'chirish")}>{IC.close}</button>
                    ) : closed && (lock?.owner || lock?.can_grant) ? (
                      <button className={`jt__lk ${isPending(lock, d.date) ? 'is-pending' : ''}`} onClick={() => onLocked(d.date)} title={lockTitle}>
                        {IC.lock}
                      </button>
                    ) : null}
                    {grant && (lock?.can_grant ? (
                      <button className="jt__open" onClick={() => onRevoke(grant.id)}
                        title={`${t('Ruxsat berilgan')}: ${fmtDateTime(grant.expires_at)} ${t('gacha')} — ${t('bosib bekor qiling')}`}>{IC.unlock}</button>
                    ) : (
                      <span className="jt__open" title={`${t('Ruxsat berilgan')}: ${fmtDateTime(grant.expires_at)} ${t('gacha')}`}>{IC.unlock}</span>
                    ))}
                    {d.topic && <span className="jt__topic" onClick={onHead} title={d.topic}>{d.topic}</span>}
                  </th>
                )
              })}
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
                  const st = d.attendance[s.id]
                  const a = st ? attOf(st) : null
                  const closed = !!lock && d.date !== lock.today && !grantFor(lock, d.date)
                  return (
                    <td key={d.id} className={`jt__c is-link ${closed ? 'is-locked' : ''}`} onClick={() => openDay(d.date)}>
                      <div className="jt__c-in">
                        {a && <span className={`at ${a.cls}`} title={t(a.label)}>{a.ic}</span>}
                        <GradeChip v={d.marks[s.id]} />
                      </div>
                    </td>
                  )
                })}
                <td className="jt__avg">{stats.perStudent[i].avg != null ? stats.perStudent[i].avg.toFixed(2) : '—'}</td>
                <td className="jt__fin">
                  <GradeCell value={finals[s.id]} disabled={!owner} onChange={(v) => onFinalChange(s.id, v)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {addingDay && <AddDayModal classId={cls.id} chorak={chorak} lock={lock} onClose={() => setAddingDay(false)} onCreated={openDay} />}
      {asking && <EditRequestModal classId={cls.id} date={asking} onClose={() => setAsking(null)} />}
      {granting && lock && (
        <GrantDayModal lock={lock} classId={cls.id} classLabel={cls.school ? `${cls.school} | ${cls.name}` : cls.name}
          date={granting} onClose={() => setGranting(null)} />
      )}
      {editingClass && <ClassModal cls={cls} onClose={() => setEditingClass(false)} />}
      {editingStudents && <EditStudentsModal cls={cls} onClose={() => setEditingStudents(false)} />}
    </div>
  )
}
