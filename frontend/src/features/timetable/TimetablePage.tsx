import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useConfirm } from '@/components/ConfirmProvider'
import { EmptyState } from '@/components/EmptyState'
import { ExportMenu, type ExportFormat } from '@/components/ExportMenu'
import { usePinchZoom, ZoomBox } from '@/components/PinchZoom'
import { ScaleToFit } from '@/components/ScaleToFit'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { IC } from '@/icons'
import { tableJpg, tableOffice } from '@/lib/export/tableExport'
import { isAdminInView, useAuth } from '@/lib/auth/AuthContext'
import { record } from '@/lib/history'
import { tablePdf } from '@/lib/pdf'
import { useUIStore } from '@/store/uiStore'

import { useAllTimetables, useSaveTeacherTimetable, useSaveTimetable, useTimetable } from './api'
import { SlotEditor } from './SlotEditor'
import { DAYS, hourLabel, SOATLAR, type TimetableSlot } from './types'

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

const key = (d: number, p: number) => `${d}:${p}`
const isEmpty = (c?: TimetableSlot) => !c || !(c.maktab || c.xona || c.sinf || c.time_from)
const spanOf = (c: TimetableSlot, p: number) => Math.max(1, Math.min(c.span || 1, SOATLAR - p + 1))
const timeOf = (c: TimetableSlot) =>
  c.time_from || c.time_to ? `${c.time_from?.slice(0, 5) || ''}${c.time_to ? '–' + c.time_to.slice(0, 5) : ''}` : ''

function Cell({ c, sp = 1 }: { c: TimetableSlot; sp?: number }) {
  const { t } = useTranslation()
  return (
    <>
      {timeOf(c) && <span className="tt__time">{timeOf(c)}</span>}
      <span className="tt__school">
        {c.band && IC.lock} {c.maktab || ''}
      </span>
      {/* Sinf — maktab bilan bir xil (.tt__school) shriftda; xona kichikroq
          meta sifatida sinfning yonida, bir qatorda ko'rsatiladi. */}
      {(c.sinf || c.xona) && (
        <span className="tt__row">
          {c.sinf && <span className="tt__school">{c.sinf}</span>}
          {c.xona && <span className="tt__meta">{t('Xona')} {c.xona}</span>}
        </span>
      )}
      {sp > 1 && <span className="tt__span">{sp} {t('soat')}</span>}
    </>
  )
}

function metaText(t: (s: string) => string, c: TimetableSlot) {
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
  return { day_index: day, period_index: period, time_from: null, time_to: null, maktab: '', xona: '', sinf: '', span: 1, band: false }
}

function ModeBar({ mode, onChange }: { mode: 'mine' | 'all'; onChange: (m: 'mine' | 'all') => void }) {
  const { t } = useTranslation()
  return (
    <div className="chips" style={{ marginBottom: 14 }}>
      <button className={`chip ${mode === 'mine' ? 'is-on' : ''}`} onClick={() => onChange('mine')}>
        {IC.user} {t('Mening jadvalim')}
      </button>
      <button className={`chip ${mode === 'all' ? 'is-on' : ''}`} onClick={() => onChange('all')}>
        {IC.users} {t("Barcha o'qituvchilar")}
      </button>
    </div>
  )
}

function MineView({ modeBar }: { modeBar: React.ReactNode }) {
  const { t } = useTranslation()
  const { lang } = useUIStore()
  const { data, isLoading } = useTimetable()
  const save = useSaveTimetable()
  const toast = useToast()
  const confirm = useConfirm()
  const { user } = useAuth()
  const [editing, setEditing] = useState<{ slot: TimetableSlot; existing: boolean } | null>(null)
  const pz = usePinchZoom()

  const byKey = useMemo(() => {
    const m = new Map<string, TimetableSlot>()
    data?.forEach((s) => m.set(key(s.day_index, s.period_index), s))
    return m
  }, [data])

  const filled = data?.filter((c) => !isEmpty(c)).length ?? 0

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
    const moved = { ...slot, day_index: target.day_index, period_index: target.period_index }
    const targetKey = key(target.day_index, target.period_index)
    if (byKey.get(targetKey)) {
      const ok = await confirm({
        title: t('Katak band'),
        text: t("Tanlangan katakda boshqa dars bor. Uni almashtirib, ko'chirishni davom ettirasizmi?"),
        danger: true,
      })
      if (!ok) return
    }
    const next = new Map(byKey)
    for (let i = 1; i < spanOf(slot, slot.period_index); i++) next.delete(key(slot.day_index, slot.period_index + i))
    next.delete(key(slot.day_index, slot.period_index))
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
    <div>
      {modeBar}
      <div className="ttbar">
        <div>
          <h3 className="ttbar__title">{user?.name}</h3>
          <p className="ttbar__sub">{t('Haftalik dars jadvali')} · {filled} {t('ta dars')}</p>
        </div>
        <div className="ttbar__acts">
          <ExportMenu
            formats={['jpg', 'pdf-portrait', 'pdf-landscape']}
            onExport={(f) =>
              runExport(f, exportTitle, tableRef.current, exportHead, exportRows).catch(() => toast(t("Yuklab olishda xatolik"), 'error'))
            }
          />
        </div>
      </div>

      <div className="table-wrap">
        <ScaleToFit naturalWidth={LABEL_COL + DAYS.length * DATA_COL_MIN}>
          <ZoomBox zoom={pz.zoom} touchHandlers={pz.touchHandlers}>
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
                            onClick={() => setEditing({ slot: emptySlot(di, p), existing: false })}
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
                          className={`tt__c tt__c--on ${c!.band ? 'tt__c--band' : ''}`}
                          tabIndex={0}
                          rowSpan={sp > 1 ? sp : undefined}
                          onClick={() => setEditing({ slot: c!, existing: true })}
                        >
                          <Cell c={c!} sp={sp} />
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
          </ZoomBox>
        </ScaleToFit>
      </div>

      {editing && (
        <SlotEditor
          slot={editing.slot}
          onSave={onSaveSlot}
          onDelete={editing.existing ? () => onDeleteSlot(editing.slot) : undefined}
          onMove={editing.existing ? (target) => onMoveSlot(editing.slot, target) : undefined}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function AllView({ modeBar, admin }: { modeBar: React.ReactNode; admin: boolean }) {
  const { t } = useTranslation()
  const { lang } = useUIStore()
  const { data, isLoading } = useAllTimetables()
  const saveTeacher = useSaveTeacherTimetable()
  const toast = useToast()
  const tableRef = useRef<HTMLTableElement>(null)
  const [editing, setEditing] = useState<{ teacherId: string; slot: TimetableSlot; existing: boolean } | null>(null)
  const pz = usePinchZoom()

  if (isLoading) return <Skeleton lines={6} />

  if (!data?.teachers.length) {
    return (
      <div>
        {modeBar}
        <EmptyState title={t("O'qituvchi yo'q")} hint={t("Tasdiqlangan foydalanuvchilar paydo bo'lgach jadval shu yerda chiqadi.")} />
      </div>
    )
  }

  const { teachers, tables } = data
  const byKey = new Map<string, Map<string, TimetableSlot>>()
  teachers.forEach((tc) => {
    const m = new Map<string, TimetableSlot>()
    tables[tc.id].forEach((s) => m.set(key(s.day_index, s.period_index), s))
    byKey.set(tc.id, m)
  })

  const slotLabel = (slot: TimetableSlot) => `${t(DAYS[slot.day_index])} ${hourLabel(slot.period_index, lang)}`

  const persistTeacher = async (teacherId: string, next: Map<string, TimetableSlot>, label: string) => {
    const before = Array.from(byKey.get(teacherId)?.values() ?? [])
    const after = Array.from(next.values())
    try {
      await saveTeacher.mutateAsync({ teacherId, slots: after })
      record(
        label,
        async () => { await saveTeacher.mutateAsync({ teacherId, slots: before }) },
        async () => { await saveTeacher.mutateAsync({ teacherId, slots: after }) },
      )
    } catch {
      toast(t('Saqlashda xatolik'), 'error')
    }
  }

  const onSaveSlot = async (teacherId: string, slot: TimetableSlot) => {
    const next = new Map(byKey.get(teacherId))
    const k = key(slot.day_index, slot.period_index)
    for (let i = 1; i < spanOf(slot, slot.period_index); i++) next.delete(key(slot.day_index, slot.period_index + i))
    if (isEmpty(slot)) next.delete(k)
    else next.set(k, slot)
    await persistTeacher(teacherId, next, slotLabel(slot))
    toast(isEmpty(slot) ? t("Katak bo'shatildi") : t('Saqlandi'))
  }

  const onDeleteSlot = async (teacherId: string, slot: TimetableSlot) => {
    const next = new Map(byKey.get(teacherId))
    for (let i = 1; i < spanOf(slot, slot.period_index); i++) next.delete(key(slot.day_index, slot.period_index + i))
    next.delete(key(slot.day_index, slot.period_index))
    await persistTeacher(teacherId, next, slotLabel(slot))
    toast(t("Dars o'chirildi"))
  }

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
    <div>
      {modeBar}
      <div className="ttbar">
        <div>
          <h3 className="ttbar__title">{t('Umumiy dars jadvali')}</h3>
          <p className="ttbar__sub">
            {teachers.length} {t("ta o'qituvchi")} · {t("bo'sh kataklar — bo'sh vaqt")}
            {!admin && ` · ${t("faqat ko'rish uchun")}`}
          </p>
        </div>
        <div className="ttbar__acts">
          <ExportMenu
            formats={['jpg', 'pdf-portrait', 'pdf-landscape', 'xls', 'doc']}
            onExport={(f) =>
              runExport(f, exportTitle, tableRef.current, exportHead, exportRows).catch(() => toast(t("Yuklab olishda xatolik"), 'error'))
            }
          />
        </div>
      </div>

      <div className="table-wrap">
        <ScaleToFit naturalWidth={2 * LABEL_COL + teachers.length * DATA_COL_MIN}>
          <ZoomBox zoom={pz.zoom} touchHandlers={pz.touchHandlers}>
          <table className="tt tt--wide" ref={tableRef} style={{ minWidth: 2 * LABEL_COL + teachers.length * DATA_COL_MIN }}>
            <colgroup>
              <col style={{ width: LABEL_COL }} />
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
                      {teachers.map((tc, ti) => {
                        if (skip[tc.id + ':' + p]) return null
                        const c = byKey.get(tc.id)?.get(key(di, p))
                        if (isEmpty(c)) {
                          return (
                            <td
                              key={tc.id}
                              className="tt__c tt__c--free"
                              tabIndex={admin ? 0 : undefined}
                              onClick={admin ? () => setEditing({ teacherId: tc.id, slot: emptySlot(di, p), existing: false }) : undefined}
                            />
                          )
                        }
                        const sp = spanOf(c!, p)
                        for (let k2 = 1; k2 < sp; k2++) skip[tc.id + ':' + (p + k2)] = true
                        return (
                          <td
                            key={tc.id}
                            className={`tt__c tt__c--on tt--c${ti % 8} ${c!.band ? 'tt__c--band' : ''}`}
                            rowSpan={sp > 1 ? sp : undefined}
                            tabIndex={admin ? 0 : undefined}
                            onClick={admin ? () => setEditing({ teacherId: tc.id, slot: c!, existing: true }) : undefined}
                          >
                            <Cell c={c!} sp={sp} />
                          </td>
                        )
                      })}
                    </tr>
                  )
                })
              })}
            </tbody>
          </table>
          </ZoomBox>
        </ScaleToFit>
      </div>

      {editing && (
        <SlotEditor
          slot={editing.slot}
          onSave={(slot) => onSaveSlot(editing.teacherId, slot)}
          onDelete={editing.existing ? () => onDeleteSlot(editing.teacherId, editing.slot) : undefined}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

export function TimetablePage() {
  const { user } = useAuth()
  const viewMode = useUIStore((s) => s.viewMode)
  const admin = isAdminInView(user, viewMode)
  const [mode, setMode] = useState<'mine' | 'all'>(() => (localStorage.getItem('afmd.ttmode') === 'mine' ? 'mine' : 'all'))

  const changeMode = (m: 'mine' | 'all') => {
    setMode(m)
    localStorage.setItem('afmd.ttmode', m)
  }

  // "Barcha o'qituvchilar" is visible to every approved user (read-only
  // for non-admins — AllView itself gates cell editing on `admin`), not
  // just admins; only the ability to *write* another teacher's slots
  // stays admin-only (see timetable/views.py's require_write_permission).
  const modeBar = <ModeBar mode={mode} onChange={changeMode} />

  if (mode === 'all') return <AllView modeBar={modeBar} admin={admin} />
  return <MineView modeBar={modeBar} />
}
