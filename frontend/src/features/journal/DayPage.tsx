import { isAxiosError } from 'axios'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useBlocker, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { useConfirm } from '@/components/ConfirmProvider'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { GuideLink } from '@/features/guide/GuideLink'
import { IC } from '@/icons'

import { useBulkMarks, useClasses, useGrid } from './api'
import { isAbsent } from './attendance'
import { EditRequestModal } from './EditRequestModal'
import { DAY_ATT, dayTitle } from './grades'
import { asScale, levelOf, markLabel, marksOf } from './scales'
import { GrantDayModal } from './GrantDayModal'
import { canEditDay, isPending, localToday } from './lock'
import type { AttendanceStatus, Grid, JournalClass } from './types'

const errDetail = (err: unknown) => (isAxiosError<{ detail?: string }>(err) ? err.response?.data?.detail : undefined)
const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8]

/** /journal/:classId/day/:date — one lesson: attendance and marks for every
 * pupil, entered here and saved together. ?q= is the quarter for a new
 * day, ?teacher= an administrator looking at someone else's journal. */
export function DayPage() {
  const { classId, date = '' } = useParams()
  const [params] = useSearchParams()
  const teacherId = params.get('teacher') ?? undefined
  const id = Number(classId)
  const { data: grid, isLoading } = useGrid(id, teacherId)
  const { data: classes } = useClasses(teacherId)
  const cls = classes?.find((c) => c.id === id)

  if (isLoading || !grid) return <div className="dpage"><Skeleton lines={6} /></div>
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return <p className="prose prose--note">—</p>
  return <DayEditor key={`${id}-${date}`} grid={grid} cls={cls} classId={id} date={date} teacherId={teacherId} quarter={Number(params.get('q')) || 0} />
}

function DayEditor({ grid, cls, classId, date, teacherId, quarter }: {
  grid: Grid
  cls?: JournalClass
  classId: number
  date: string
  teacherId?: string
  quarter: number
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const bulk = useBulkMarks(classId)
  const lock = grid.lock
  const day = grid.days.find((d) => d.date === date)
  const students = grid.students
  const editable = canEditDay(lock, date)
  const scale = asScale(grid.scale ?? cls?.scale)
  const chorak = day?.chorak ?? (quarter || Number(localStorage.getItem('afmd.chorak')) || 1)

  const origAtt = (sid: number) => (day?.attendance[sid] ?? '') as AttendanceStatus | ''
  const origMark = (sid: number) => day?.marks[sid] ?? null
  const [tab, setTab] = useState<'att' | 'marks'>('att')
  const [att, setAtt] = useState<Record<number, AttendanceStatus | ''>>(() => Object.fromEntries(students.map((s) => [s.id, origAtt(s.id)])))
  const [marks, setMarks] = useState<Record<number, number | null>>(() => Object.fromEntries(students.map((s) => [s.id, origMark(s.id)])))
  const [topic, setTopic] = useState(day?.topic ?? '')
  const [period, setPeriod] = useState<number | null>(day?.period ?? null)
  const [asking, setAsking] = useState(false)
  const [granting, setGranting] = useState(false)

  const markOf = (sid: number) => (isAbsent(att[sid]) ? null : marks[sid] ?? null)
  const attChanged = students.filter((s) => (att[s.id] ?? '') !== origAtt(s.id))
  const markChanged = students.filter((s) => markOf(s.id) !== origMark(s.id))
  const dirty = editable && (!day || attChanged.length > 0 || markChanged.length > 0 || topic !== (day?.topic ?? '') || period !== (day?.period ?? null))

  const present = students.filter((s) => !isAbsent(att[s.id])).length
  const graded = students.filter((s) => markOf(s.id) != null).length
  const lessonDays = [...grid.days].map((d) => d.date).sort()
  const prev = [...lessonDays].reverse().find((d) => d < date)
  const next = lessonDays.find((d) => d > date)
  const q = teacherId ? `?teacher=${encodeURIComponent(teacherId)}` : ''
  const { day: dayLabel, weekday } = dayTitle(date)
  const future = date > (lock?.today ?? localToday())

  const save = async () => {
    try {
      await bulk.mutateAsync({
        date, chorak, topic, period,
        attendance: attChanged.map((s) => ({ student_id: s.id, status: att[s.id] || null })),
        marks: markChanged.map((s) => ({ student_id: s.id, mark: markOf(s.id) })),
      })
      toast(t('Saqlandi'))
    } catch (err) {
      toast(t(errDetail(err) ?? 'Saqlashda xatolik'), 'error')
    }
  }

  // Leaving with unsaved changes asks first — inside the app and on reload.
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !bulk.isPending && currentLocation.pathname !== nextLocation.pathname)
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    void confirm({ title: t("Saqlanmagan o'zgarishlar"), text: t('Chiqsangiz, kiritilganlar saqlanmaydi.'), danger: true })
      .then((ok) => (ok ? blocker.proceed() : blocker.reset()))
  }, [blocker, confirm, t])
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const setStatus = (sid: number, k: AttendanceStatus | '') => setAtt((a) => ({ ...a, [sid]: k }))
  const status = bulk.isPending ? t('Saqlanmoqda…') : !editable ? t("Faqat ko'rish") : dirty ? t("Saqlanmagan o'zgarishlar bor") : t('Saqlangan')

  return (
    <div className="dpage">
      <div className="dpage__top">
        <Link className="dpage__back" to={`/journal${q ? `${q}&` : '?'}class=${classId}`}>{IC.back} {t('Jurnal')}</Link>
        <span className="dpage__nav">
          <button type="button" className="icon-btn" disabled={!prev} onClick={() => prev && navigate(`/journal/${classId}/day/${prev}${q}`)} aria-label={t('Oldingi dars')}>
            <span className="dpage__chev dpage__chev--l">{IC.chevron}</span>
          </button>
          <button type="button" className="icon-btn" disabled={!next} onClick={() => next && navigate(`/journal/${classId}/day/${next}${q}`)} aria-label={t('Keyingi dars')}>
            <span className="dpage__chev">{IC.chevron}</span>
          </button>
        </span>
      </div>

      <p className="dpage__cls">{cls ? (cls.school ? `${cls.school} | ${cls.name}` : cls.name) : ''}</p>
      <div className="dpage__head">
        <h1 className="dpage__day">{dayLabel}</h1>
        <select className="dpage__period" value={period ?? ''} disabled={!editable} onChange={(e) => setPeriod(e.target.value ? Number(e.target.value) : null)}
          aria-label={t('Dars soati')}>
          <option value="">{t('Soat')}</option>
          {PERIODS.map((p) => <option key={p} value={p}>{p}-{t('soat')}</option>)}
        </select>
      </div>
      <p className="dpage__wd">{t(weekday)}</p>
      <input className="input dpage__topic" value={topic} disabled={!editable} maxLength={500}
        onChange={(e) => setTopic(e.target.value)} placeholder={t('Dars mavzusi')} />

      {!editable && lock && (
        <p className="jlock__why">
          {IC.lock}
          <span>
            {!lock.owner ? t("Faqat ko'rish") : future ? t('Kelgusi kun') : t('Bu kun yopilgan')}
            {' '}<GuideLink section="yopilgan-kunlar" />
            {!future && (lock.can_grant || lock.owner) && (
              <>
                {' '}
                <button type="button" className="linklike" onClick={() => (lock.can_grant ? setGranting(true) : isPending(lock, date)
                  ? toast(t("So'rov yuborilgan — administrator javobini kuting.")) : setAsking(true))}>
                  {lock.can_grant ? t('Kunni ochish') : t("Ruxsat so'rash")}
                </button>
              </>
            )}
          </span>
        </p>
      )}

      <div className="dtabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'att'} className={`dtab ${tab === 'att' ? 'is-on' : ''}`} onClick={() => setTab('att')}>
          {t('Davomat')}<small>{present}/{students.length}</small>
        </button>
        <button type="button" role="tab" aria-selected={tab === 'marks'} className={`dtab ${tab === 'marks' ? 'is-on' : ''}`} onClick={() => setTab('marks')}>
          {t('Baho')}<small>{graded}/{present}</small>
        </button>
      </div>

      {tab === 'att' ? (
        <>
          <div className="dpage__bar">
            <button type="button" className="btn" disabled={!editable} onClick={() => setAtt(Object.fromEntries(students.map((s) => [s.id, ''])))}>
              {t('Hammasi keldi')}
            </button>
            <span className="dpage__hint">{t('Kirmadi: maktabda bor, lekin darsga kirmadi')}</span>
          </div>
          <ul className="drows">
            {students.map((s, i) => {
              const cur = att[s.id] === 's' ? 'n' : att[s.id] ?? ''
              return (
                <li key={s.id} className="drow">
                  <span className="drow__n">{i + 1}</span>
                  <span className="drow__nm">{s.full_name}</span>
                  <span className="dseg" role="radiogroup" aria-label={s.full_name}>
                    {DAY_ATT.map((o) => (
                      <button key={o.k} type="button" role="radio" aria-checked={cur === o.k} disabled={!editable}
                        className={`dseg__b dseg__b--${o.k || 'ok'} ${cur === o.k ? 'is-on' : ''}`} onClick={() => setStatus(s.id, o.k)}>
                        {t(o.label)}
                      </button>
                    ))}
                  </span>
                </li>
              )
            })}
          </ul>
        </>
      ) : (
        <>
          <ul className="drows">
            {students.map((s, i) => {
              const absent = isAbsent(att[s.id])
              return (
                <li key={s.id} className={`drow ${absent ? 'is-absent' : ''}`}>
                  <span className="drow__n">{i + 1}</span>
                  <span className="drow__nm">{s.full_name}</span>
                  {absent ? (
                    <span className="drow__away">{t(att[s.id] === 'x' ? 'Kirmadi' : 'Kelmadi')}</span>
                  ) : (
                    scale === 100 ? (
                      <span className="dnum">
                        <input className="input dnum__in" type="number" inputMode="numeric" min={0} max={100} disabled={!editable}
                          value={marks[s.id] ?? ''} aria-label={s.full_name} placeholder="0–100"
                          onChange={(e) => {
                            const raw = e.target.value.trim()
                            const v = raw === '' ? null : Math.round(Number(raw))
                            if (v !== null && (Number.isNaN(v) || v < 0 || v > 100)) return
                            setMarks((m) => ({ ...m, [s.id]: v }))
                          }} />
                        {marks[s.id] != null && (
                          <span className={`gchip gchip--${levelOf(marks[s.id]!, scale)} dnum__lvl`}>{t(markLabel(marks[s.id]!, scale))}</span>
                        )}
                      </span>
                    ) : (
                      <span className={`dgrades dgrades--s${scale}`} role="radiogroup" aria-label={s.full_name}>
                        {marksOf(scale).map((v) => (
                          <button key={v} type="button" role="radio" aria-checked={marks[s.id] === v} disabled={!editable} title={t(markLabel(v, scale))}
                            className={`dgrade gchip--${levelOf(v, scale)} ${marks[s.id] === v ? 'is-on' : ''}`}
                            onClick={() => setMarks((m) => ({ ...m, [s.id]: m[s.id] === v ? null : v }))}>
                            <b>{v}</b>{scale === 5 && <span>{t(markLabel(v, scale))}</span>}
                          </button>
                        ))}
                      </span>
                    )
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}

      <div className="dsave">
        <span className={`dsave__st ${dirty ? 'is-dirty' : ''}`}>{status}</span>
        {editable && (
          <button type="button" className="btn btn--primary dsave__go" onClick={save} disabled={!dirty || bulk.isPending}>{t('Saqlash')}</button>
        )}
      </div>

      {asking && <EditRequestModal classId={classId} date={date} onClose={() => setAsking(false)} />}
      {granting && lock && (
        <GrantDayModal lock={lock} classId={classId} classLabel={cls ? (cls.school ? `${cls.school} | ${cls.name}` : cls.name) : ''}
          date={date} onClose={() => setGranting(false)} />
      )}
    </div>
  )
}
