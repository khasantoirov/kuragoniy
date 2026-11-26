import { isAxiosError } from 'axios'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { useConfirm } from '@/components/ConfirmProvider'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { fmtDateTime } from '@/features/portal/ui'
import { GuideLink } from '@/features/guide/GuideLink'
import { IC } from '@/icons'
import { record } from '@/lib/history'
import { tablePdf } from '@/lib/pdf'

import { AddDayModal } from './AddDayModal'
import { useBulkMarks, useDecideGrant, useDeleteClass, useDropDay, useGrid, useSetFinal, useUpdateClass } from './api'
import { attOf, fmtD } from './attendance'
import { ClassModal } from './ClassModal'
import { ControlWorkModal } from './ControlWorkModal'
import { EditRequestModal } from './EditRequestModal'
import { AvgChip, GradeCell, GradeChip } from './GradeCell'
import { GrantDayModal } from './GrantDayModal'
import { EditStudentsModal } from './EditStudentsModal'
import { activityOf, attendancePct, KIND_LABEL, numbered } from './practicals'
import { PracticalWorkModal } from './PracticalWorkModal'
import { canEditDay, grantFor, isPending, localToday } from './lock'
import { asScale, fmtAvg, SCALES, type Scale } from './scales'
import { computeStats, controlAvg, meanOf } from './stats'
import type { ControlWork, JournalClass, PracticalWork } from './types'

/** The server's reason (e.g. "this day is closed") when it gives one. */
const errDetail = (err: unknown) => (isAxiosError<{ detail?: string }>(err) ? err.response?.data?.detail : undefined)

/** One class's journal for a quarter — the overview. Attendance and marks
 * are entered on a lesson's own page (DayPage), opened from a date or any
 * cell; here only the quarter grade is edited. With `teacherId` an
 * administrator is looking at that teacher's journal: everything is
 * read-only, and the lock on a closed day opens it for the teacher.
 * Nazorat ishi columns (0-100) are graded by administrators only; amaliy
 * ish columns (laboratoriya "L-1", STEM "STEM-1") by the class's teacher,
 * on its scale, outside every average. Davomat % and the Faollik holati
 * close each row (owner's mock-ups, 2026-11-26). */
export function ClassGrid({ cls, chorak, teacherId }: { cls: JournalClass; chorak: number; teacherId?: string }) {
  const { t } = useTranslation()
  const { data: grid, isLoading } = useGrid(cls.id, teacherId)
  const bulkMarks = useBulkMarks(cls.id)
  const dropDay = useDropDay(cls.id)
  const setFinal = useSetFinal(cls.id)
  const updateClass = useUpdateClass(cls.id)
  const deleteClass = useDeleteClass()
  const toast = useToast()
  const confirm = useConfirm()
  const navigate = useNavigate()

  const [addingDay, setAddingDay] = useState(false)
  const [editingClass, setEditingClass] = useState(false)
  const [editingStudents, setEditingStudents] = useState(false)
  const [asking, setAsking] = useState<string | null>(null)
  const [granting, setGranting] = useState<string | null>(null)
  const [control, setControl] = useState<ControlWork | 'new' | null>(null)
  const [practical, setPractical] = useState<PracticalWork | 'new' | null>(null)
  const decide = useDecideGrant()

  if (isLoading || !grid) return <Skeleton lines={4} />

  const lock = grid.lock
  // a past o'quv yili's journal: looked at, not written (but for opened days)
  const past = !!lock?.past_year
  // the school's licence isn't in force (Litsenziyalar): nothing is written
  const unlicensed = !!lock?.licence
  const owner = (!lock || lock.owner) && !past && !unlicensed
  // its quarter grades open while an administrator's permission does
  const finalsOpen = unlicensed ? false : past ? !!lock?.owner && (lock?.grants.length ?? 0) > 0 : owner

  const students = grid.students
  const days = grid.days.filter((d) => d.chorak === chorak).sort((a, b) => a.date.localeCompare(b.date))
  const scale = asScale(grid.scale ?? cls.scale)
  const hasMarks = grid.days.some((d) => Object.keys(d.marks).length > 0)
    || Object.values(grid.finals ?? {}).some((q) => Object.keys(q).length > 0)
  // Straight from the header: existing marks are carried over to the new
  // scale (backend keeps each in its colour band), so ask first if any.
  const changeScale = async (next: Scale) => {
    if (next === scale) return
    if (hasMarks && !(await confirm({
      title: t('Baholash shkalasi'),
      text: t("Mavjud baholar yangi shkalaga o'tkaziladi — har birining rang toifasi saqlanadi."),
    }))) return
    try {
      await updateClass.mutateAsync({ school: cls.school, name: cls.name, scale: next })
      toast(t("Shkala o'zgartirildi"))
    } catch (err) {
      toast(t(errDetail(err) ?? 'Xatolik yuz berdi'), 'error')
    }
  }
  const stats = computeStats(grid, days, scale)
  const finals = grid.finals[String(chorak)] ?? {}
  const controls = (grid.controls ?? []).filter((w) => w.chorak === chorak)
  const canControl = !!lock?.can_control && !past
  // Moved to another class, marks kept here: shown greyed under the
  // roster, outside the class's averages.
  const archived = grid.archived ?? []
  const archivedStats = computeStats({ students: archived }, days, scale)
  const finalsAvg = meanOf(students, finals)
  // amaliy ishlar of this chorak, numbered "L-1", "STEM-1"; the teacher's own
  const pracs = numbered((grid.practicals ?? []).filter((w) => w.chorak === chorak))
  const att = students.map((s) => attendancePct(s.id, days))
  const activity = students.map((_, i) => activityOf(stats.perStudent[i].lvl, att[i]))
  const attKnown = att.filter((v): v is number => v !== null)
  const classAtt = attKnown.length ? Math.round(attKnown.reduce((a, b) => a + b, 0) / attKnown.length) : null
  const warnN = activity.filter((a) => a === 'ogoh').length
  const pracDone = students.filter((s) => pracs.some(({ work }) => work.marks[s.id] != null)).length

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
  const exportPdf = () => {
    const head = ['№', t("To'liq ism"), ...days.map((d) => fmtD(d.date)),
      ...controls.map((w) => `${t('Nazorat ishi')} ${fmtD(w.date)}`), ...pracs.map((p) => `${p.tag} ${fmtD(p.work.date)}`),
      t("O'rtacha"), t('Chorak'), t('Davomat'), t('Holat')]
    const rows = students.map((s, i) => [
      i + 1, s.full_name,
      ...days.map((d) => d.marks[s.id] ?? (d.attendance[s.id] ? attOf(d.attendance[s.id]).ic : '')),
      ...controls.map((w) => w.marks[s.id] ?? ''),
      ...pracs.map((p) => p.work.marks[s.id] ?? ''),
      stats.perStudent[i].avg != null ? fmtAvg(stats.perStudent[i].avg, scale) : '',
      finals[s.id] ?? '',
      att[i] !== null ? `${att[i]}%` : '',
      activity[i] ? t(activity[i] === 'faol' ? 'Faol' : 'Ogohlantirish') : '',
    ])
    const avgText = (v: number | null, sc: Scale) => (v != null ? fmtAvg(v, sc) : '')
    rows.push([
      '', t("Sinf o'rtachasi"),
      ...days.map((d) => avgText(meanOf(students, d.marks), scale)),
      ...controls.map((w) => controlAvg(students, [w]) ?? ''),
      ...pracs.map((p) => avgText(meanOf(students, p.work.marks), scale)),
      avgText(stats.classAvg, scale), avgText(finalsAvg, scale),
      classAtt !== null ? `${classAtt}%` : '', '',
    ])
    tablePdf(`${t('Jurnal')} — ${cls.name}`, head, rows, { orientation: 'landscape' })
  }

  return (
    <div>
      <div className="jhead">
        <div className="jhead__info">
          {owner ? (
            <select className="jscale" value={scale} title={t('Baholash shkalasi')} aria-label={t('Baholash shkalasi')}
              disabled={updateClass.isPending} onChange={(e) => void changeScale(asScale(Number(e.target.value)))}>
              {SCALES.map((o) => <option key={o.v} value={o.v}>{t(o.label)}</option>)}
            </select>
          ) : (
            <span className="jscale" title={t('Baholash shkalasi')}>{t(SCALES.find((x) => x.v === scale)!.label)}</span>
          )}
          {past && <span className="jpast">{IC.lock} {cls.year_name} {t("o'quv yili — faqat ko'rish")}</span>}
          {unlicensed && <span className="jpast" title={t(lock!.licence!)}>{IC.lock} {t("Litsenziya amalda emas — faqat ko'rish")}</span>}
          {lock && lock.pending.length > 0 && <span className="jpending">{IC.lock} {lock.pending.length} {t("ta so'rov ko'rib chiqilmoqda")}</span>}
          <GuideLink section="jurnal" />
        </div>
        <div className="jhead__acts">
          {canControl && (
            <button className={`btn btn--sm ${owner ? '' : 'btn--primary'}`} onClick={() => setControl('new')}>
              {IC.clipboard} + {t('Nazorat ishi')}
            </button>
          )}
          {owner && <button className="btn btn--sm" onClick={() => setPractical('new')}>{IC.flask} + {t('Amaliy ish')}</button>}
          {owner && <button className="btn btn--sm btn--primary" onClick={() => openDay(lock?.today ?? localToday())}>{IC.calendar} {t('Bugungi dars')}</button>}
          {owner && <button className="btn btn--sm" onClick={() => setAddingDay(true)}>+ {t('Dars kuni')}</button>}
          {owner && <button className="btn btn--sm" onClick={() => setEditingStudents(true)}>{t("O'quvchilar ro'yxati")}</button>}
          <button className="btn btn--sm" onClick={exportPdf}>{IC.download} {t('Yuklab olish')}</button>
          {owner && <button className="btn btn--sm" onClick={() => setEditingClass(true)}>{t('Sinfni tahrirlash')}</button>}
          {owner && <button className="btn btn--sm btn--ghost" onClick={onRemoveClass}>{t("Sinfni o'chirish")}</button>}
        </div>
      </div>

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
              {controls.map((w) => {
                const avg = controlAvg(students, [w])
                return (
                  <th key={`ctl${w.id}`} className={`jt__d jt__ctl ${canControl ? 'is-link' : ''}`}
                    onClick={canControl ? () => setControl(w) : undefined}
                    title={[t('Nazorat ishi'), t('100 ballik'), w.by_name, avg !== null ? `${t("O'rtacha ball")}: ${avg}` : ''].filter(Boolean).join(' · ')}>
                    <span className="jt__ctag">{t('Nazorat ishi')}</span>
                    <span className={canControl ? 'jt__dt' : undefined}>{fmtD(w.date)}</span>
                    {w.title && <span className="jt__topic">{w.title}</span>}
                  </th>
                )
              })}
              {pracs.map(({ work: w, tag }) => (
                <th key={`pr${w.id}`} className={`jt__d jt__prac jt__prac--${w.kind} ${owner ? 'is-link' : ''}`}
                  onClick={owner ? () => setPractical(w) : undefined}
                  title={[t(KIND_LABEL[w.kind]), w.title, t("O'rtacha ballga ta'sir qilmaydi")].filter(Boolean).join(' · ')}>
                  <span className="jt__ptag">{tag}</span>
                  <span className={owner ? 'jt__dt' : undefined}>{fmtD(w.date)}</span>
                  {w.title && <span className="jt__topic">{w.title}</span>}
                </th>
              ))}
              <th className="jt__avg">{t("O'rtacha")}</th>
              <th className="jt__fin">{t('Chorak')}</th>
              <th className="jt__att" title={t("Chorakdagi darslarga qatnashish (kechikish — qatnashgan)")}>{t('Davomat')}</th>
              <th className="jt__act" title={t("«Ogohlantirish» — o'rtacha 3,5 dan past yoki davomat 85% dan kam")}>{t('Holat')}</th>
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
                        <GradeChip v={d.marks[s.id]} scale={scale} />
                      </div>
                    </td>
                  )
                })}
                {controls.map((w) => (
                  <td key={`ctl${w.id}`} className={`jt__c jt__ctl ${canControl ? 'is-link' : ''}`} onClick={canControl ? () => setControl(w) : undefined}>
                    <GradeChip v={w.marks[s.id]} scale={100} />
                  </td>
                ))}
                {pracs.map(({ work: w }) => (
                  <td key={`pr${w.id}`} className={`jt__c jt__prac ${owner ? 'is-link' : ''}`} onClick={owner ? () => setPractical(w) : undefined}>
                    <GradeChip v={w.marks[s.id]} scale={scale} />
                  </td>
                ))}
                <td className="jt__avg"><AvgChip avg={stats.perStudent[i].avg} scale={scale} /></td>
                <td className="jt__fin">
                  <GradeCell value={finals[s.id]} scale={scale} disabled={!finalsOpen} onChange={(v) => onFinalChange(s.id, v)} />
                </td>
                <td className={`jt__att ${att[i] !== null && att[i]! < 85 ? 'is-low' : ''}`}>{att[i] !== null ? `${att[i]}%` : '—'}</td>
                <td className="jt__act">
                  {activity[i] ? (
                    <span className={`pill pill--${activity[i] === 'faol' ? 'ok' : 'mid'}`}>{t(activity[i] === 'faol' ? 'Faol' : 'Ogohlantirish')}</span>
                  ) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
          <tbody>
            <tr className="jt__sum">
              <td className="jt__no" />
              <td className="jt__nm">{t("Sinf o'rtachasi")}</td>
              {days.map((d) => (
                <td key={d.id} className="jt__c"><AvgChip avg={meanOf(students, d.marks)} scale={scale} /></td>
              ))}
              {controls.map((w) => (
                <td key={`ctl${w.id}`} className="jt__c jt__ctl"><GradeChip v={controlAvg(students, [w])} scale={100} empty="—" /></td>
              ))}
              {pracs.map(({ work: w }) => (
                <td key={`pr${w.id}`} className="jt__c jt__prac"><AvgChip avg={meanOf(students, w.marks)} scale={scale} /></td>
              ))}
              <td className="jt__avg"><AvgChip avg={stats.classAvg} scale={scale} /></td>
              <td className="jt__fin"><AvgChip avg={finalsAvg} scale={scale} /></td>
              <td className="jt__att">{classAtt !== null ? `${classAtt}%` : '—'}</td>
              <td className="jt__act">{warnN ? <span className="jt__warn">{warnN} ⚠</span> : ''}</td>
            </tr>
          </tbody>
          {archived.length > 0 && (
            <tbody className="jt__gone">
              {archived.map((s, i) => (
                <tr key={s.id} title={`${t("Boshqa sinfga o'tgan")}: ${s.moved_to_class}`}>
                  <td className="jt__no">—</td>
                  <td className="jt__nm">{s.full_name} <span className="jt__moved">→ {s.moved_to_class}</span></td>
                  {days.map((d) => {
                    const st = d.attendance[s.id]
                    const a = st ? attOf(st) : null
                    return (
                      <td key={d.id} className="jt__c">
                        <div className="jt__c-in">
                          {a && <span className={`at ${a.cls}`} title={t(a.label)}>{a.ic}</span>}
                          <GradeChip v={d.marks[s.id]} scale={scale} />
                        </div>
                      </td>
                    )
                  })}
                  {controls.map((w) => (
                    <td key={`ctl${w.id}`} className="jt__c jt__ctl"><GradeChip v={w.marks[s.id]} scale={100} /></td>
                  ))}
                  {pracs.map(({ work: w }) => (
                    <td key={`pr${w.id}`} className="jt__c jt__prac"><GradeChip v={w.marks[s.id]} scale={scale} /></td>
                  ))}
                  <td className="jt__avg"><AvgChip avg={archivedStats.perStudent[i].avg} scale={scale} /></td>
                  <td className="jt__fin"><GradeChip v={finals[s.id]} scale={scale} /></td>
                  <td className="jt__att">—</td>
                  <td className="jt__act" />
                </tr>
              ))}
            </tbody>
          )}
        </table>
      </div>

      <div className="jins">
        <section className="jins__card">
          <h4>{t("Sinf o'zlashtirish tahlili")}</h4>
          <p><span>{t("O'zlashtirish")}</span><b>{stats.pct !== null ? `${stats.pct}%` : '—'}</b></p>
          <p><span>{t('Sifat')}</span><b>{stats.sifat !== null ? `${stats.sifat}%` : '—'}</b></p>
          <p><span>{t('Darsda ishtirok')}</span><b>{classAtt !== null ? `${classAtt}%` : '—'}</b></p>
        </section>
        <section className="jins__card">
          <h4>{t('Amaliy ishlar')}</h4>
          <p><span>{t('Laboratoriya ishlari')}</span><b>{pracs.filter((p) => p.work.kind === 'lab').length}</b></p>
          <p><span>{t('STEM loyihalar')}</span><b>{pracs.filter((p) => p.work.kind === 'stem').length}</b></p>
          <p><span>{t('Baho olganlar')}</span><b>{pracDone} / {students.length}</b></p>
        </section>
        <section className="jins__card jins__card--note">
          <h4>{t("O'qituvchi uchun eslatma")}</h4>
          <p className="jins__note">{t("Laboratoriya (L) va STEM loyiha baholari alohida ustunda turadi: o'rtacha ballga va chorak bahosiga ta'sir qilmaydi. «Ogohlantirish» — o'rtacha 3,5 dan past yoki davomat 85% dan kam bo'lgan o'quvchi.")}</p>
        </section>
      </div>

      {addingDay && <AddDayModal classId={cls.id} chorak={chorak} lock={lock} onClose={() => setAddingDay(false)} onCreated={openDay} />}
      {asking && <EditRequestModal classId={cls.id} date={asking} onClose={() => setAsking(null)} />}
      {granting && lock && (
        <GrantDayModal lock={lock} classId={cls.id} classLabel={cls.school ? `${cls.school} | ${cls.name}` : cls.name}
          date={granting} onClose={() => setGranting(null)} />
      )}
      {control && (
        <ControlWorkModal classId={cls.id} chorak={chorak} students={students}
          work={control === 'new' ? null : control} onClose={() => setControl(null)} />
      )}
      {practical && (
        <PracticalWorkModal classId={cls.id} chorak={chorak} scale={scale} students={students}
          work={practical === 'new' ? null : practical} onClose={() => setPractical(null)} />
      )}
      {editingClass && <ClassModal cls={cls} onClose={() => setEditingClass(false)} />}
      {editingStudents && <EditStudentsModal cls={cls} onClose={() => setEditingStudents(false)} />}
    </div>
  )
}
