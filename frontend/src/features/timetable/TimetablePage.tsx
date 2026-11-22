import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { useConfirm } from '@/components/ConfirmProvider'
import { EmptyState } from '@/components/EmptyState'
import { ExportMenu, type ExportFormat } from '@/components/ExportMenu'
import { ScaleToFit } from '@/components/ScaleToFit'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { IC } from '@/icons'
import { api } from '@/lib/api/client'
import type { Paginated } from '@/lib/api/types'
import { tableJpg, tableOffice } from '@/lib/export/tableExport'
import { isAdminInView, useAuth } from '@/lib/auth/AuthContext'
import { record } from '@/lib/history'
import { tablePdf } from '@/lib/pdf'
import { type Lang, useUIStore } from '@/store/uiStore'

import { useAllTimetables, usePartnerSchools, useSaveTeacherTimetable, useSaveTimetable, useTimetable } from './api'
import { BellsEditor } from './BellsEditor'
import { SlotEditor } from './SlotEditor'
import { DAYS, hourLabel, SOATLAR, type TimetableSlot } from './types'
import './timetable.css'

// table-layout:fixed column sizing: the hour/day label columns stay this
// narrow always, and every data column gets at least this much at its
// natural (1:1) size. On a screen wide enough for that, the data columns
// grow to fill the rest of the width evenly (ScaleToFit is a no-op then),
// so adding a teacher column just changes how much each one gets — no
// manual re-tuning needed. On a screen narrower than the natural width,
// ScaleToFit shrinks the whole table uniformly so it still reads as one
// grid instead of needing horizontal scroll.
const LABEL_COL = 62
const DATA_COL_MIN = 132
const WEEK_CELLS = DAYS.length * SOATLAR

type T = (s: string) => string

const key = (d: number, p: number) => `${d}:${p}`
const isEmpty = (c?: TimetableSlot) => !c || !(c.maktab || c.xona || c.sinf || c.time_from)
const spanOf = (c: TimetableSlot, p: number) => Math.max(1, Math.min(c.span || 1, SOATLAR - p + 1))
const hoursOf = (c: TimetableSlot) => Math.max(1, c.span || 1)
const timeOf = (c: TimetableSlot) =>
  c.time_from || c.time_to ? `${c.time_from?.slice(0, 5) || ''}${c.time_to ? '–' + c.time_to.slice(0, 5) : ''}` : ''

/** "302-xona" for a plain room number, "Xona Fizika" otherwise. */
const roomText = (t: T, lang: Lang, xona: string) =>
  lang === 'uz' && /^\d+[A-Za-z]?$/.test(xona.trim()) ? `${xona.trim()}-xona` : `${t('Xona')} ${xona.trim()}`

// ── where a lesson stands this week ─────────────────────────────────
type Status = 'done' | 'now' | 'next' | 'today'
const STATUS_LABEL: Record<Status, string> = { done: 'Yakunlangan', now: 'Hozirgi dars', next: 'Kutilmoqda', today: 'Bugun' }
const LESSON_MIN = 45

const minutesOf = (v: string | null) => {
  if (!v) return null
  const [h, m] = v.split(':').map(Number)
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null
}

/** Done, going on now, or still to come — this week's (a weekend already
 * looks at the coming week). A lesson with no times is placed by its day
 * only; one with a single time is taken as 45 minutes per soat. */
function statusOf(c: TimetableSlot, now: Date): Status {
  const today = (now.getDay() + 6) % 7  // Monday = 0
  if (today > 4 || c.day_index > today) return 'next'
  if (c.day_index < today) return 'done'
  let from = minutesOf(c.time_from)
  let to = minutesOf(c.time_to)
  if (from == null && to == null) return 'today'
  const len = LESSON_MIN * hoursOf(c)
  if (to == null) to = (from as number) + len
  if (from == null) from = to - len
  const cur = now.getHours() * 60 + now.getMinutes()
  return cur < from ? 'next' : cur >= to ? 'done' : 'now'
}

/** The clock the statuses follow — ticks once a minute. */
function useNow() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(id)
  }, [])
  return now
}

// ── filters ─────────────────────────────────────────────────────────
type Filters = { sinf: string; maktab: string }
const NO_FILTER: Filters = { sinf: '', maktab: '' }
const matches = (c: TimetableSlot, f: Filters) =>
  (!f.sinf || c.sinf.trim() === f.sinf) && (!f.maktab || c.maktab.trim() === f.maktab)
const distinct = (slots: TimetableSlot[], pick: (s: TimetableSlot) => string) =>
  [...new Set(slots.filter((s) => !isEmpty(s)).map((s) => pick(s).trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))

function Pick({ label, value, all, options, onChange }: {
  label: string
  value: string
  all?: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  return (
    <label className="ttx__f">
      <span className="ttx__fl">{label}</span>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        {all !== undefined && <option value="">{all}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  )
}

/** Class and school pickers — a picked one leaves the other lessons faded. */
function SlotFilters({ slots, f, onChange }: { slots: TimetableSlot[]; f: Filters; onChange: (f: Filters) => void }) {
  const { t } = useTranslation()
  const sinfs = distinct(slots, (s) => s.sinf)
  const schools = distinct(slots, (s) => s.maktab)
  return (
    <>
      {sinfs.length > 0 && (
        <Pick label={t('Sinfni tanlash')} value={f.sinf} all={t('Barcha sinflar')}
          options={sinfs.map((s) => ({ value: s, label: s }))} onChange={(sinf) => onChange({ ...f, sinf })} />
      )}
      {schools.length > 0 && (
        <Pick label={t('Maktabni tanlash')} value={f.maktab} all={t('Barcha maktablar')}
          options={schools.map((s) => ({ value: s, label: s }))} onChange={(maktab) => onChange({ ...f, maktab })} />
      )}
    </>
  )
}

// ── one lesson in its cell ──────────────────────────────────────────
function LessonCard({ c, sp, now, heading }: { c: TimetableSlot; sp: number; now: Date; heading?: string }) {
  const { t } = useTranslation()
  const { lang } = useUIStore()
  const st = c.band ? null : statusOf(c, now)
  const title = heading ?? (c.maktab || (c.band ? t('Boshqa joyda band') : c.sinf))
  const sinf = c.sinf && c.sinf !== title ? c.sinf : ''
  const room = c.xona ? roomText(t, lang, c.xona) : ''
  return (
    <div className={`ttk ${c.band ? 'ttk--band' : ''} ${st ? `is-${st}` : ''}`}>
      <b className="ttk__t">
        {c.band && IC.lock}{title}
        {!heading && !c.band && !!c.maktab && !c.school && <span className="ttk__warn" title={t("Maktab ro'yxatdan tanlanmagan")}>⚠</span>}
      </b>
      {(sinf || room) && <span className="ttk__m">{sinf && room ? `${sinf} (${room})` : sinf || room}</span>}
      <span className="ttk__f">
        {timeOf(c) && <span className="ttk__time">{timeOf(c)}</span>}
        {sp > 1 && <span className="ttk__span">{sp} {t('soat')}</span>}
        {c.band
          ? <span className="ttk__st ttk__st--band">{t('Band')}</span>
          : st && <span className={`ttk__st ttk__st--${st}`}>{t(STATUS_LABEL[st])}</span>}
      </span>
    </div>
  )
}

// ── under the table: who teaches how much, and the week in numbers ──
type Load = { id: string; name: string; hours: number }

function loadsOf(teachers: { id: string; name: string }[], tables: Record<string, TimetableSlot[]>): Load[] {
  return teachers
    .map((tc) => ({
      id: tc.id,
      name: tc.name,
      hours: (tables[tc.id] ?? []).filter((s) => !isEmpty(s) && !s.band).reduce((n, s) => n + hoursOf(s), 0),
    }))
    .sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name))
}

function LoadsPanel({ loads, meId, loading }: { loads: Load[]; meId?: string; loading?: boolean }) {
  const { t } = useTranslation()
  const top = loads.slice(0, 6)
  const me = loads.find((l) => l.id === meId)
  if (me && !top.includes(me)) top.push(me)
  const rest = loads.length - top.length
  return (
    <section className="ttsum__p">
      <h3 className="ttsum__h">{t('Ustozlar bandligi va yuklamalar')}</h3>
      {loading ? <Skeleton lines={3} /> : (
        <ul className="ttsum__list">
          {top.map((l) => (
            <li key={l.id} className={l.id === meId ? 'is-me' : ''}>
              <b>{l.name}</b>{l.id === meId && <small> ({t('siz')})</small>}: {l.hours} {t('soat/hafta')}
            </li>
          ))}
          {rest > 0 && <li className="ttsum__more">+{rest} {t("ta o'qituvchi")}</li>}
        </ul>
      )}
    </section>
  )
}

function StatsPanel({ slots, now, teachers }: { slots: TimetableSlot[]; now: Date; teachers?: number }) {
  const { t } = useTranslation()
  const filled = slots.filter((s) => !isEmpty(s))
  const lessons = filled.filter((s) => !s.band)
  const hours = lessons.reduce((n, s) => n + hoursOf(s), 0)
  const done = lessons.filter((s) => statusOf(s, now) === 'done').length
  const away = filled.filter((s) => s.band).reduce((n, s) => n + hoursOf(s), 0)
  const schools = distinct(lessons, (s) => s.maktab)
  const rows: [string, ReactNode][] = [
    [t('Haftalik darslar'), `${lessons.length} ${t('ta dars')} · ${hours} ${t('soat')}`],
    [t("O'tilgan darslar"), `${done} / ${lessons.length} ${t('ta dars')}`],
    [t('Maktablar'), schools.join(', ') || '—'],
  ]
  if (teachers != null) rows.push([t("O'qituvchilar"), String(teachers)])
  else rows.push([t("Bo'sh soatlar"), `${Math.max(0, WEEK_CELLS - hours - away)} / ${WEEK_CELLS}`])
  if (away > 0) rows.push([t('Boshqa joyda band'), `${away} ${t('soat')}`])
  return (
    <section className="ttsum__p">
      <h3 className="ttsum__h">{t('Haftalik xulosa')}</h3>
      <dl className="ttsum__dl">
        {rows.map(([k, v]) => (
          <div key={k} className="ttsum__row"><dt>{k}:</dt><dd>{v}</dd></div>
        ))}
      </dl>
    </section>
  )
}

/** Hours a week, by school (one teacher) or by teacher (one school). */
function BreakdownPanel({ title, rows }: { title: string; rows: { key: string; name: string; hours: number }[] }) {
  const { t } = useTranslation()
  return (
    <section className="ttsum__p">
      <h3 className="ttsum__h">{title}</h3>
      {rows.length ? (
        <ul className="ttsum__list">
          {rows.map((r) => <li key={r.key}><b>{r.name}</b>: {r.hours} {t('soat/hafta')}</li>)}
        </ul>
      ) : <p className="prose prose--note">—</p>}
    </section>
  )
}

const hoursBy = <E extends { slot: TimetableSlot }>(items: E[], keyOf: (e: E) => [string, string]) => {
  const m = new Map<string, { key: string; name: string; hours: number }>()
  for (const e of items) {
    const s = e.slot
    if (isEmpty(s) || s.band) continue
    const [k, name] = keyOf(e)
    const row = m.get(k) ?? { key: k, name, hours: 0 }
    row.hours += hoursOf(s)
    m.set(k, row)
  }
  return [...m.values()].sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name))
}

/** The administration writing into a teacher's week (both "Barcha
 * o'qituvchilar" views): saves the whole week, with undo. */
function useTeacherEdits(tables: Record<string, TimetableSlot[]> | undefined) {
  const { t } = useTranslation()
  const { lang } = useUIStore()
  const saveTeacher = useSaveTeacherTimetable()
  const toast = useToast()
  const mapOf = (teacherId: string) => {
    const m = new Map<string, TimetableSlot>()
    ;(tables?.[teacherId] ?? []).forEach((s) => m.set(key(s.day_index, s.period_index), s))
    return m
  }
  const slotLabel = (slot: TimetableSlot) => `${t(DAYS[slot.day_index])} ${hourLabel(slot.period_index, lang)}`
  const persist = async (teacherId: string, next: Map<string, TimetableSlot>, label: string) => {
    const before = Array.from(mapOf(teacherId).values())
    const after = Array.from(next.values())
    try {
      await saveTeacher.mutateAsync({ teacherId, slots: after })
      record(
        label,
        async () => { await saveTeacher.mutateAsync({ teacherId, slots: before }) },
        async () => { await saveTeacher.mutateAsync({ teacherId, slots: after }) },
      )
      return true
    } catch {
      toast(t('Saqlashda xatolik'), 'error')
      return false
    }
  }
  const put = (teacherId: string, slot: TimetableSlot) => {
    const next = mapOf(teacherId)
    const k = key(slot.day_index, slot.period_index)
    for (let i = 1; i < spanOf(slot, slot.period_index); i++) next.delete(key(slot.day_index, slot.period_index + i))
    if (isEmpty(slot)) next.delete(k)
    else next.set(k, slot)
    return persist(teacherId, next, slotLabel(slot))
  }
  const drop = (teacherId: string, slot: TimetableSlot) => {
    const next = mapOf(teacherId)
    for (let i = 1; i < spanOf(slot, slot.period_index); i++) next.delete(key(slot.day_index, slot.period_index + i))
    next.delete(key(slot.day_index, slot.period_index))
    return persist(teacherId, next, slotLabel(slot))
  }
  const save = async (teacherId: string, slot: TimetableSlot) => {
    if (await put(teacherId, slot)) toast(isEmpty(slot) ? t("Katak bo'shatildi") : t('Saqlandi'))
  }
  const remove = async (teacherId: string, slot: TimetableSlot) => {
    if (await drop(teacherId, slot)) toast(t("Dars o'chirildi"))
  }
  /** The lesson moves to `to`'s week, same day and soat — refused when
   * they teach then (a cell with only its time set counts as free). */
  const give = async (from: string, to: string, slot: TimetableSlot, toName: string) => {
    const dest = mapOf(to)
    const busy = coveredOf(dest.values())
    for (let i = 0; i < spanOf(slot, slot.period_index); i++) {
      const k = key(slot.day_index, slot.period_index + i)
      const c = dest.get(k)
      if (busy.has(k) || (c && (c.maktab || c.sinf || c.xona || c.band))) {
        toast(`${toName}: ${t('bu soatda boshqa darsi bor')}`, 'error')
        return false
      }
    }
    if (!(await put(to, slot))) return false
    if (!(await drop(from, slot))) return false
    toast(`${t('Dars berildi')}: ${toName}`)
    return true
  }
  return { save, remove, give }
}

function metaText(t: T, c: TimetableSlot) {
  return [c.sinf || '', c.xona ? `${t('Xona')} ${c.xona}` : ''].filter(Boolean).join(' · ')
}

async function runExport(
  format: ExportFormat,
  title: string,
  tableEl: HTMLElement | null,
  head: string[],
  rows: (string | number)[][],
) {
  if (format === 'jpg') {
    if (tableEl) await tableJpg(title, tableEl)
    return
  }
  if (format === 'xls' || format === 'doc') {
    tableOffice(title, head, rows, format)
    return
  }
  await tablePdf(title, head, rows, { orientation: format === 'pdf-portrait' ? 'portrait' : 'landscape' })
}

function emptySlot(day: number, period: number): TimetableSlot {
  return { day_index: day, period_index: period, time_from: null, time_to: null, maktab: '', xona: '', sinf: '', span: 1, band: false, school: null }
}

/** Cells covered by a lesson above them that lasts several soat. */
function coveredOf(slots: Iterable<TimetableSlot>) {
  const out = new Set<string>()
  for (const s of slots) {
    for (let i = 1; i < spanOf(s, s.period_index); i++) out.add(key(s.day_index, s.period_index + i))
  }
  return out
}

function ModeTabs({ mode, onChange }: { mode: 'mine' | 'all'; onChange: (m: 'mine' | 'all') => void }) {
  const { t } = useTranslation()
  return (
    <div className="seg ttx__tabs" role="tablist">
      <button type="button" role="tab" aria-selected={mode === 'mine'} className={`seg__b ${mode === 'mine' ? 'is-on' : ''}`} onClick={() => onChange('mine')}>
        {IC.user} {t('Mening jadvalim')}
      </button>
      <button type="button" role="tab" aria-selected={mode === 'all'} className={`seg__b ${mode === 'all' ? 'is-on' : ''}`} onClick={() => onChange('all')}>
        {IC.users} {t("Barcha o'qituvchilar")}
      </button>
    </div>
  )
}

function MineView({ tabs, admin }: { tabs: ReactNode; admin: boolean }) {
  const { t } = useTranslation()
  const { lang } = useUIStore()
  const { data, isLoading } = useTimetable()
  const all = useAllTimetables(false, admin)
  const save = useSaveTimetable()
  const toast = useToast()
  const confirm = useConfirm()
  const { user } = useAuth()
  const now = useNow()
  const [editing, setEditing] = useState<{ slot: TimetableSlot; existing: boolean; fresh?: boolean } | null>(null)
  const [bellsOpen, setBellsOpen] = useState(false)

  const byKey = useMemo(() => {
    const m = new Map<string, TimetableSlot>()
    data?.forEach((s) => m.set(key(s.day_index, s.period_index), s))
    return m
  }, [data])
  const covered = useMemo(() => coveredOf(byKey.values()), [byKey])
  // the schools of one's own lessons: Dars vaqtlari opens on them first
  const mySchools = useMemo(() => [...new Set((data ?? []).map((s) => s.school).filter((x): x is number => !!x))], [data])

  const filled = data?.filter((c) => !isEmpty(c)).length ?? 0
  const loads = useMemo(() => (all.data ? loadsOf(all.data.teachers, all.data.tables) : []), [all.data])

  const persist = async (next: Map<string, TimetableSlot>, label: string) => {
    const before = Array.from(byKey.values())
    const after = Array.from(next.values())
    try {
      await save.mutateAsync(after)
      record(
        label,
        async () => { await save.mutateAsync(before) },
        async () => { await save.mutateAsync(after) },
      )
    } catch {
      toast(t('Saqlashda xatolik'), 'error')
    }
  }

  const slotLabel = (slot: TimetableSlot) => `${t(DAYS[slot.day_index])} ${hourLabel(slot.period_index, lang)}`

  const onSaveSlot = async (slot: TimetableSlot) => {
    const next = new Map(byKey)
    const k = key(slot.day_index, slot.period_index)
    for (let i = 1; i < spanOf(slot, slot.period_index); i++) next.delete(key(slot.day_index, slot.period_index + i))
    if (isEmpty(slot)) next.delete(k)
    else next.set(k, slot)
    await persist(next, slotLabel(slot))
    toast(isEmpty(slot) ? t("Katak bo'shatildi") : t('Saqlandi'))
  }

  const onDeleteSlot = async (slot: TimetableSlot) => {
    const next = new Map(byKey)
    for (let i = 1; i < spanOf(slot, slot.period_index); i++) next.delete(key(slot.day_index, slot.period_index + i))
    next.delete(key(slot.day_index, slot.period_index))
    await persist(next, slotLabel(slot))
    toast(t("Dars o'chirildi"))
  }

  const onMoveSlot = async (slot: TimetableSlot, target: { day_index: number; period_index: number }) => {
    if (target.day_index === slot.day_index && target.period_index === slot.period_index) return
    const targetKey = key(target.day_index, target.period_index)
    const existingTarget = byKey.get(targetKey)
    if (existingTarget) {
      const ok = await confirm({
        title: t('Katak band'),
        text: t("Tanlangan katakda boshqa dars bor. Uni almashtirib, ko'chirishni davom ettirasizmi?"),
        danger: true,
      })
      if (!ok) return
    }
    // Time belongs to the cell's own position (day+period), not to
    // whichever lesson currently sits in it — moving content elsewhere
    // must never drag the old cell's time along, and must never
    // overwrite the destination cell's own time.
    const moved: TimetableSlot = {
      ...slot,
      day_index: target.day_index,
      period_index: target.period_index,
      time_from: existingTarget?.time_from ?? null,
      time_to: existingTarget?.time_to ?? null,
    }
    const next = new Map(byKey)
    for (let i = 1; i < spanOf(slot, slot.period_index); i++) next.delete(key(slot.day_index, slot.period_index + i))
    // Clear the source cell's content but keep its own time in place —
    // same "a time-only cell isn't empty" rule isEmpty() already applies
    // everywhere else, so the vacated cell doesn't lose its time just
    // because its lesson moved out.
    const sourceKey = key(slot.day_index, slot.period_index)
    if (slot.time_from || slot.time_to) {
      next.set(sourceKey, { ...emptySlot(slot.day_index, slot.period_index), time_from: slot.time_from, time_to: slot.time_to })
    } else {
      next.delete(sourceKey)
    }
    for (let i = 1; i < spanOf(moved, target.period_index); i++) next.delete(key(target.day_index, target.period_index + i))
    next.set(targetKey, moved)
    await persist(next, `${slotLabel(slot)} → ${slotLabel(moved)}`)
    toast(t("Dars ko'chirildi"))
  }

  const tableRef = useRef<HTMLTableElement>(null)

  if (isLoading) return <Skeleton lines={6} />

  const skip: Record<string, boolean> = {}

  const exportHead = [t('Soat'), ...DAYS.map((d) => t(d))]
  const exportRows = Array.from({ length: SOATLAR }, (_, i) => {
    const p = i + 1
    return [hourLabel(p, lang), ...DAYS.map((_, di) => {
      const c = byKey.get(key(di, p))
      if (isEmpty(c)) return ''
      return [timeOf(c!), (c!.band ? '[BAND] ' : '') + (c!.maktab || ''), metaText(t, c!)].filter(Boolean).join(' ')
    })]
  })
  const exportTitle = `${user?.name || ''} — ${t('haftalik jadval')}`

  return (
    <div className="ttpage">
      {/* the two actions sit by the title, so the tabs keep the whole row */}
      <header className="ttx-head ttx-head--acts">
        <div className="ttx-head__txt">
          <h2 className="ttx-head__title">{t('Dars jadvali')}</h2>
          <p className="ttx-head__sub">{user?.name} · {filled} {t('ta dars')}</p>
        </div>
        <div className="ttx__acts">
          <button type="button" className="btn btn--sm" onClick={() => setBellsOpen(true)} title={t('Dars vaqtlari')}>
            {IC.clock} <span className="btnlbl">{t('Dars vaqtlari')}</span>
          </button>
          <ExportMenu
            formats={['jpg', 'pdf-portrait', 'pdf-landscape']}
            onExport={(fm) =>
              runExport(fm, exportTitle, tableRef.current, exportHead, exportRows).catch(() => toast(t('Yuklab olishda xatolik'), 'error'))
            }
          />
        </div>
      </header>

      <section className="ttx">
        {tabs}
        <div className="table-wrap ttx__grid">
          <ScaleToFit naturalWidth={LABEL_COL + DAYS.length * DATA_COL_MIN}>
            <table className="tt" ref={tableRef} style={{ minWidth: LABEL_COL + DAYS.length * DATA_COL_MIN }}>
              <colgroup>
                <col style={{ width: LABEL_COL }} />
                {DAYS.map((d) => (
                  <col key={d} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th className="tt__corner">{t('Soat')}</th>
                  {DAYS.map((d, i) => (
                    <th key={d} className={`tt__h tt__h--d${i}`}>{t(d)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: SOATLAR }, (_, i) => {
                  const p = i + 1
                  return (
                    <tr key={p}>
                      <th className="tt__soat">{hourLabel(p, lang)}</th>
                      {DAYS.map((_, di) => {
                        if (skip[key(di, p)]) return null
                        const c = byKey.get(key(di, p))
                        if (isEmpty(c)) {
                          return (
                            <td
                              key={di}
                              className="tt__c tt__c--empty"
                              tabIndex={0}
                              title={t("Dars qo'shish")}
                              onClick={() => setEditing({ slot: c ?? emptySlot(di, p), existing: false })}
                            >
                              <span className="tt__plus">+</span>
                            </td>
                          )
                        }
                        const sp = spanOf(c!, p)
                        for (let k2 = 1; k2 < sp; k2++) skip[key(di, p + k2)] = true
                        return (
                          <td
                            key={di}
                            className="tt__c tt__c--on"
                            tabIndex={0}
                            rowSpan={sp > 1 ? sp : undefined}
                            onClick={() => setEditing({ slot: c!, existing: true })}
                          >
                            <LessonCard c={c!} sp={sp} now={now} />
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </ScaleToFit>
        </div>
      </section>

      {/* the teachers' loads and the week's summary: the administration's */}
      {admin && (
        <div className={`ttsum ${all.isError ? 'ttsum--one' : ''}`}>
          {!all.isError && <LoadsPanel loads={loads} meId={user?.id} loading={all.isLoading} />}
          <StatsPanel slots={data ?? []} now={now} />
        </div>
      )}

      {editing && (
        <SlotEditor
          slot={editing.slot}
          onSave={onSaveSlot}
          onDelete={editing.existing ? () => onDeleteSlot(editing.slot) : undefined}
          onMove={editing.existing ? (target) => onMoveSlot(editing.slot, target) : undefined}
          onClose={() => setEditing(null)}
        />
      )}
      {bellsOpen && <BellsEditor schoolIds={mySchools} onClose={() => setBellsOpen(false)} />}
    </div>
  )
}

function AllView({ tabs, admin, versions }: { tabs: ReactNode; admin: boolean; versions?: ReactNode }) {
  const { t } = useTranslation()
  const { lang } = useUIStore()
  const { user } = useAuth()
  const { data, isLoading } = useAllTimetables()
  const edits = useTeacherEdits(data?.tables)
  const toast = useToast()
  const now = useNow()
  const tableRef = useRef<HTMLTableElement>(null)
  const [editing, setEditing] = useState<{ teacherId: string; slot: TimetableSlot; existing: boolean } | null>(null)
  const [only, setOnly] = useState('')
  const [f, setF] = useState<Filters>(NO_FILTER)

  if (isLoading) return <Skeleton lines={6} />

  if (!data?.teachers.length) {
    return (
      <div className="ttpage">
        <section className="ttx">
          {tabs}
          <EmptyState title={t("O'qituvchi yo'q")} hint={t("Tasdiqlangan foydalanuvchilar paydo bo'lgach jadval shu yerda chiqadi.")} />
        </section>
      </div>
    )
  }

  const { tables } = data
  // one teacher picked, or everyone
  const teachers = data.teachers.filter((tc) => !only || tc.id === only)
  const byKey = new Map<string, Map<string, TimetableSlot>>()
  teachers.forEach((tc) => {
    const m = new Map<string, TimetableSlot>()
    tables[tc.id].forEach((s) => m.set(key(s.day_index, s.period_index), s))
    byKey.set(tc.id, m)
  })
  const shownSlots = teachers.flatMap((tc) => tables[tc.id] ?? [])
  const filtering = !!(f.sinf || f.maktab)

  const exportHead = [t('Kun'), t('Soat'), ...teachers.map((tc) => tc.name)]
  const exportRows = DAYS.flatMap((d, di) =>
    Array.from({ length: SOATLAR }, (_, i) => {
      const p = i + 1
      return [
        i === 0 ? t(d) : '',
        hourLabel(p, lang),
        ...teachers.map((tc) => {
          const c = byKey.get(tc.id)?.get(key(di, p))
          if (isEmpty(c)) return ''
          return [timeOf(c!), (c!.band ? '[BAND] ' : '') + (c!.maktab || ''), metaText(t, c!)].filter(Boolean).join(' ')
        }),
      ]
    }),
  )
  const exportTitle = t('Umumiy dars jadvali')

  return (
    <div className="ttpage">
      <header className="ttx-head">
        <h2 className="ttx-head__title">{t('Umumiy dars jadvali')}</h2>
        <p className="ttx-head__sub">
          {teachers.length} {t("ta o'qituvchi")} · {t("bo'sh kataklar — bo'sh vaqt")}
          {!admin && ` · ${t("faqat ko'rish uchun")}`}
        </p>
      </header>

      <section className="ttx">
        {tabs}
        <div className="ttx__bar">
          <Pick label={t("O'qituvchini tanlash")} value={only} all={t("Barcha o'qituvchilar")}
            options={data.teachers.map((tc) => ({ value: tc.id, label: tc.name }))} onChange={setOnly} />
          <SlotFilters slots={shownSlots} f={f} onChange={setF} />
          <div className="ttx__acts">
            {versions}
            <ExportMenu
              formats={['jpg', 'pdf-portrait', 'pdf-landscape', 'xls', 'doc']}
              onExport={(fm) =>
                runExport(fm, exportTitle, tableRef.current, exportHead, exportRows).catch(() => toast(t('Yuklab olishda xatolik'), 'error'))
              }
            />
          </div>
        </div>
        <p className="ttx__cap">{t("Har bir ustun — bitta o'qituvchi; bo'sh katak — bo'sh vaqt")}</p>

        <div className="table-wrap ttx__grid">
          <ScaleToFit naturalWidth={2 * LABEL_COL + teachers.length * DATA_COL_MIN}>
            <table className="tt tt--wide" ref={tableRef} style={{ minWidth: 2 * LABEL_COL + teachers.length * DATA_COL_MIN }}>
              <colgroup>
                {/* Day column width lives in CSS (.tt__cday): narrower inside the phone zoom viewer. */}
                <col className="tt__cday" />
                <col style={{ width: LABEL_COL }} />
                {teachers.map((tc) => (
                  <col key={tc.id} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th className="tt__corner" colSpan={2}>{t('Kun / Soat')}</th>
                  {teachers.map((tc, i) => (
                    <th key={tc.id} className={`tt__h tt__h--t${i % 8}`}>{tc.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DAYS.map((d, di) => {
                  const skip: Record<string, boolean> = {}
                  return Array.from({ length: SOATLAR }, (_, i) => {
                    const p = i + 1
                    return (
                      <tr key={`${di}:${p}`} className={i === 0 ? 'tt__rowday' : ''}>
                        {i === 0 && (
                          <th className={`tt__day tt__dayv tt__day--${di}`} rowSpan={SOATLAR}>
                            <span>{t(d)}</span>
                          </th>
                        )}
                        <th className="tt__soat">{hourLabel(p, lang)}</th>
                        {teachers.map((tc) => {
                          if (skip[tc.id + ':' + p]) return null
                          const c = byKey.get(tc.id)?.get(key(di, p))
                          if (isEmpty(c)) {
                            return (
                              <td
                                key={tc.id}
                                className="tt__c tt__c--free"
                                tabIndex={admin ? 0 : undefined}
                                onClick={admin ? () => setEditing({ teacherId: tc.id, slot: c ?? emptySlot(di, p), existing: false }) : undefined}
                              />
                            )
                          }
                          const sp = spanOf(c!, p)
                          for (let k2 = 1; k2 < sp; k2++) skip[tc.id + ':' + (p + k2)] = true
                          return (
                            <td
                              key={tc.id}
                              className={`tt__c tt__c--on ${filtering && !matches(c!, f) ? 'is-dim' : ''}`}
                              rowSpan={sp > 1 ? sp : undefined}
                              tabIndex={admin ? 0 : undefined}
                              onClick={admin ? () => setEditing({ teacherId: tc.id, slot: c!, existing: true }) : undefined}
                            >
                              <LessonCard c={c!} sp={sp} now={now} />
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })
                })}
              </tbody>
            </table>
          </ScaleToFit>
        </div>
      </section>

      <div className="ttsum">
        <LoadsPanel loads={loadsOf(data.teachers, tables)} meId={user?.id} />
        <StatsPanel slots={shownSlots} now={now} teachers={teachers.length} />
      </div>

      {editing && (
        <SlotEditor
          slot={editing.slot}
          onSave={(slot) => edits.save(editing.teacherId, slot)}
          onDelete={editing.existing ? () => edits.remove(editing.teacherId, editing.slot) : undefined}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

type Entry = { slot: TimetableSlot; teacherId: string }

/** "Barcha o'qituvchilar", picked: one teacher's week, or one school's —
 * every teacher's lessons there — in the "Mening jadvalim" layout. A school
 * may hold several lessons in one soat: they stack in the cell. */
function PickView({ tabs, versions, admin }: { tabs: ReactNode; versions: ReactNode; admin: boolean }) {
  const { t } = useTranslation()
  const { lang } = useUIStore()
  const { data, isLoading } = useAllTimetables(admin)
  const { data: schoolList } = usePartnerSchools()
  const edits = useTeacherEdits(data?.tables)
  const queryClient = useQueryClient()
  const toast = useToast()
  const now = useNow()
  const tableRef = useRef<HTMLTableElement>(null)
  const [by, setBy] = useState<'teacher' | 'school'>('teacher')
  const [teacherPick, setTeacherPick] = useState('')
  const [schoolPick, setSchoolPick] = useState('')
  const [sinf, setSinf] = useState('')
  const [editing, setEditing] = useState<{ teacherId: string; slot: TimetableSlot; existing: boolean } | null>(null)
  // the open lesson's teacher's journal classes: its class can go along with it
  const fromClasses = useQuery({
    queryKey: ['journal', 'classes', 'of', editing?.teacherId ?? ''],
    enabled: !!editing?.existing,
    queryFn: async () => (await api.get<Paginated<{ id: number; name: string; partner_school?: number | null }>>(
      '/journal/classes/', { params: { teacher: editing!.teacherId } })).data.results,
  })

  if (isLoading) return <Skeleton lines={6} />
  if (!data?.teachers.length) {
    return (
      <div className="ttpage">
        <section className="ttx">
          {tabs}
          <EmptyState title={t("O'qituvchi yo'q")} hint={t("Tasdiqlangan foydalanuvchilar paydo bo'lgach jadval shu yerda chiqadi.")} />
        </section>
      </div>
    )
  }

  const { tables } = data
  const names = new Map(data.teachers.map((tc) => [tc.id, tc.name]))
  const blocked = new Set(data.teachers.filter((tc) => tc.blocked).map((tc) => tc.id))
  const flat = (v: string) => v.toLowerCase().replace(/[\s\-_.]+/g, '')
  const classMatch = editing?.existing && editing.slot.sinf.trim()
    ? (fromClasses.data ?? []).find((c) => flat(c.name) === flat(editing.slot.sinf)
      && (!editing.slot.school || !c.partner_school || c.partner_school === editing.slot.school))
    : undefined
  const giveLesson = async (from: string, slot: TimetableSlot, to: string, cls?: { id: number; name: string }) => {
    if (!(await edits.give(from, to, slot, names.get(to) ?? ''))) return
    if (!cls) return
    try {
      await api.post(`/schools/classes/${cls.id}/teacher/`, { teacher: to })
      queryClient.invalidateQueries({ queryKey: ['journal'] })
      queryClient.invalidateQueries({ queryKey: ['schools'] })
      toast(`«${cls.name}» ${t('sinfi ham berildi')}`)
    } catch {
      toast(t("Sinfni berib bo'lmadi"), 'error')
    }
  }
  const lessonsOf = (id: string) => (tables[id] ?? []).filter((s) => !isEmpty(s))
  // to start with: the first teacher / school that has lessons
  const teacherId = teacherPick || data.teachers.find((tc) => !tc.blocked && lessonsOf(tc.id).length)?.id || data.teachers[0].id
  const schools = (schoolList ?? []).filter((s) => s.is_active !== false)
  const used = new Set(data.teachers.flatMap((tc) => lessonsOf(tc.id).map((s) => s.school)))
  const schoolId = Number(schoolPick) || schools.find((s) => used.has(s.id))?.id || schools[0]?.id || 0
  const schoolName = schools.find((s) => s.id === schoolId)?.name ?? ''
  const multi = by === 'school'

  const entries: Entry[] = multi
    ? data.teachers.flatMap((tc) => lessonsOf(tc.id).filter((s) => !s.band && s.school === schoolId).map((slot) => ({ slot, teacherId: tc.id })))
    : lessonsOf(teacherId).map((slot) => ({ slot, teacherId }))
  const starts = new Map<string, Entry[]>()
  const later = new Map<string, Entry[]>()
  const push = (m: Map<string, Entry[]>, k: string, e: Entry) => m.set(k, [...(m.get(k) ?? []), e])
  for (const e of entries) {
    const s = e.slot
    push(starts, key(s.day_index, s.period_index), e)
    for (let i = 1; i < spanOf(s, s.period_index); i++) push(later, key(s.day_index, s.period_index + i), e)
  }
  const slots = entries.map((e) => e.slot)
  const sinfs = distinct(slots, (s) => s.sinf)
  const dim = (s: TimetableSlot) => !!sinf && s.sinf.trim() !== sinf
  const heading = multi ? schoolName : names.get(teacherId) ?? ''
  const teacherCount = new Set(entries.map((e) => e.teacherId)).size
  const skip: Record<string, boolean> = {}

  const cellText = (e: Entry) => {
    const c = e.slot
    return [multi ? names.get(e.teacherId) ?? '' : (c.band ? '[BAND] ' : '') + (c.maktab || ''), timeOf(c), metaText(t, c)].filter(Boolean).join(' ')
  }
  const exportHead = [t('Soat'), ...DAYS.map((d) => t(d))]
  const exportRows = Array.from({ length: SOATLAR }, (_, i) => {
    const p = i + 1
    return [hourLabel(p, lang), ...DAYS.map((_, di) => (starts.get(key(di, p)) ?? []).map(cellText).join('; '))]
  })
  const exportTitle = `${heading} — ${t('haftalik jadval')}`

  return (
    <div className="ttpage">
      <header className="ttx-head">
        <h2 className="ttx-head__title">
          {heading || t('Umumiy dars jadvali')}
          {!multi && blocked.has(teacherId) && <small className="ttx-head__flag">{t('bloklangan')}</small>}
        </h2>
        <p className="ttx-head__sub">
          {t('Haftalik dars jadvali')} · {entries.filter((e) => !e.slot.band).length} {t('ta dars')}
          {multi && ` · ${teacherCount} ${t("ta o'qituvchi")}`}
        </p>
      </header>

      <section className="ttx">
        {tabs}
        <div className="ttx__bar">
          <div className="ttx__f">
            <span className="ttx__fl">{t("Ko'rish")}</span>
            <div className="seg ttx__by" role="group" aria-label={t("Ko'rish")}>
              <button type="button" className={`seg__b ${!multi ? 'is-on' : ''}`} aria-pressed={!multi} onClick={() => { setBy('teacher'); setSinf('') }}>
                {IC.user} {t("O'qituvchi")}
              </button>
              <button type="button" className={`seg__b ${multi ? 'is-on' : ''}`} aria-pressed={multi} onClick={() => { setBy('school'); setSinf('') }}>
                {IC.school} {t('Maktab')}
              </button>
            </div>
          </div>
          {multi ? (
            <Pick label={t('Maktabni tanlash')} value={schoolId ? String(schoolId) : ''}
              options={schools.map((s) => ({ value: String(s.id), label: s.name }))} onChange={(v) => { setSchoolPick(v); setSinf('') }} />
          ) : (
            <Pick label={t("O'qituvchini tanlash")} value={teacherId}
              options={data.teachers.map((tc) => ({ value: tc.id, label: tc.blocked ? `${tc.name} (${t('bloklangan')})` : tc.name }))}
              onChange={(v) => { setTeacherPick(v); setSinf('') }} />
          )}
          {sinfs.length > 0 && (
            <Pick label={t('Sinfni tanlash')} value={sinf} all={t('Barcha sinflar')}
              options={sinfs.map((s) => ({ value: s, label: s }))} onChange={setSinf} />
          )}
          <div className="ttx__acts">
            {versions}
            <ExportMenu
              formats={['jpg', 'pdf-portrait', 'pdf-landscape']}
              onExport={(fm) =>
                runExport(fm, exportTitle, tableRef.current, exportHead, exportRows).catch(() => toast(t('Yuklab olishda xatolik'), 'error'))
              }
            />
          </div>
        </div>
        <p className="ttx__cap">
          {multi ? t("Shu maktabdagi barcha ustozlarning darslari; bir soatda bir nechta dars bo'lsa, ustma-ust turadi.")
            : admin ? t("Tanlangan ustozning haftasi — katakni bosib tahrirlash mumkin.") : t("Tanlangan ustozning haftasi — faqat ko'rish uchun.")}
        </p>

        <div className="table-wrap ttx__grid">
          <ScaleToFit naturalWidth={LABEL_COL + DAYS.length * DATA_COL_MIN}>
            <table className="tt" ref={tableRef} style={{ minWidth: LABEL_COL + DAYS.length * DATA_COL_MIN }}>
              <colgroup>
                <col style={{ width: LABEL_COL }} />
                {DAYS.map((d) => (
                  <col key={d} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th className="tt__corner">{t('Soat')}</th>
                  {DAYS.map((d, i) => (
                    <th key={d} className={`tt__h tt__h--d${i}`}>{t(d)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: SOATLAR }, (_, i) => {
                  const p = i + 1
                  return (
                    <tr key={p}>
                      <th className="tt__soat">{hourLabel(p, lang)}</th>
                      {DAYS.map((_, di) => {
                        const k = key(di, p)
                        if (skip[k]) return null
                        const here = starts.get(k) ?? []
                        const cont = multi ? later.get(k) ?? [] : []
                        if (!here.length && !cont.length) {
                          return multi || !admin ? (
                            <td key={di} className="tt__c tt__c--free" />
                          ) : (
                            <td key={di} className="tt__c tt__c--empty" tabIndex={0} title={t("Dars qo'shish")}
                              onClick={() => setEditing({ teacherId, slot: emptySlot(di, p), existing: false })}>
                              <span className="tt__plus">+</span>
                            </td>
                          )
                        }
                        if (!multi) {
                          const e = here[0]
                          const sp = spanOf(e.slot, p)
                          for (let k2 = 1; k2 < sp; k2++) skip[key(di, p + k2)] = true
                          return (
                            <td key={di} className={`tt__c tt__c--on ${dim(e.slot) ? 'is-dim' : ''}`} tabIndex={admin ? 0 : undefined}
                              rowSpan={sp > 1 ? sp : undefined} onClick={admin ? () => setEditing({ teacherId, slot: e.slot, existing: true }) : undefined}>
                              <LessonCard c={e.slot} sp={sp} now={now} />
                            </td>
                          )
                        }
                        return (
                          <td key={di} className="tt__c tt__c--on tt__c--multi">
                            <div className="ttstack">
                              {here.map((e) => (
                                <div key={`${e.teacherId}:${e.slot.day_index}:${e.slot.period_index}`}
                                  role={admin ? 'button' : undefined} tabIndex={admin ? 0 : undefined}
                                  className={dim(e.slot) ? 'is-dim' : ''}
                                  onClick={admin ? () => setEditing({ teacherId: e.teacherId, slot: e.slot, existing: true }) : undefined}
                                  onKeyDown={admin ? (ev) => { if (ev.key === 'Enter') setEditing({ teacherId: e.teacherId, slot: e.slot, existing: true }) } : undefined}>
                                  <LessonCard c={e.slot} sp={spanOf(e.slot, e.slot.period_index)} now={now} heading={names.get(e.teacherId)} />
                                </div>
                              ))}
                              {cont.map((e) => (
                                <div key={`c:${e.teacherId}:${e.slot.day_index}:${e.slot.period_index}`} className={`ttk ttk--cont ${dim(e.slot) ? 'is-dim' : ''}`}>
                                  <b className="ttk__t">{names.get(e.teacherId)}</b>
                                  <span className="ttk__m">↳ {t('davomi')}{e.slot.sinf ? ` · ${e.slot.sinf}` : ''}</span>
                                </div>
                              ))}
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </ScaleToFit>
        </div>
      </section>

      {/* the breakdown and the week's summary: the administration's */}
      {admin && <div className="ttsum">
        {multi
          ? <BreakdownPanel title={t("Ustozlar bo'yicha")} rows={hoursBy(entries, (e) => [e.teacherId, names.get(e.teacherId) ?? ''])} />
          : <BreakdownPanel title={t("Maktablar bo'yicha")} rows={hoursBy(entries, (e) => [e.slot.maktab || '—', e.slot.maktab || '—'])} />}
        <StatsPanel slots={multi ? slots : tables[teacherId] ?? []} now={now} teachers={multi ? teacherCount : undefined} />
      </div>}

      {editing && (
        <SlotEditor
          slot={editing.slot}
          onSave={(slot) => edits.save(editing.teacherId, slot)}
          onDelete={editing.existing ? () => edits.remove(editing.teacherId, editing.slot) : undefined}
          handover={editing.existing ? {
            teachers: data.teachers.filter((tc) => !tc.blocked && tc.id !== editing.teacherId).map((tc) => ({ id: tc.id, name: tc.name })),
            className: classMatch?.name,
            onGive: (to, withClass) => giveLesson(editing.teacherId, editing.slot, to, withClass ? classMatch : undefined),
          } : undefined}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

type AllVersion = 'pick' | 'wide'
const VERSION_KEY = 'af-tt-all-view'

export function TimetablePage() {
  const { user } = useAuth()
  const viewMode = useUIStore((s) => s.viewMode)
  const admin = isAdminInView(user, viewMode)
  // Jadval always opens on one's own timetable; everyone's is a click away.
  const [mode, setMode] = useState<'mine' | 'all'>('mine')
  const { t } = useTranslation()
  // the administration's two ways through everyone's timetable
  const [version, setVersion] = useState<AllVersion>(() => {
    try {
      return localStorage.getItem(VERSION_KEY) === 'wide' ? 'wide' : 'pick'
    } catch {
      return 'pick'
    }
  })
  const pickVersion = (v: AllVersion) => {
    setVersion(v)
    try {
      localStorage.setItem(VERSION_KEY, v)
    } catch {
      // remembered only for this visit
    }
  }
  const versions = admin ? (
    <div className="seg ttx__ver" role="group" aria-label={t("Ko'rinish")}>
      <button type="button" className={`seg__b ${version === 'pick' ? 'is-on' : ''}`} aria-pressed={version === 'pick'} onClick={() => pickVersion('pick')}>
        {t('Tanlab')}
      </button>
      <button type="button" className={`seg__b ${version === 'wide' ? 'is-on' : ''}`} aria-pressed={version === 'wide'} onClick={() => pickVersion('wide')}>
        {t('Hammasi birga')}
      </button>
    </div>
  ) : null

  // "Barcha o'qituvchilar" is visible to every approved user (read-only
  // for non-admins — AllView itself gates cell editing on `admin`), not
  // just admins; only the ability to *write* another teacher's slots
  // stays admin-only (see timetable/views.py's require_write_permission).
  const tabs = <ModeTabs mode={mode} onChange={setMode} />

  // everyone's timetable: the readable picked view (one teacher's or one
  // school's week) for everyone; the administration may also see all at once
  if (mode === 'all' && admin && version === 'wide') return <AllView tabs={tabs} admin={admin} versions={versions} />
  if (mode === 'all') return <PickView tabs={tabs} versions={versions} admin={admin} />
  return <MineView tabs={tabs} admin={admin} />
}
