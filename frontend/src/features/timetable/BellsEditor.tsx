import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Modal } from '@/components/Modal'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { errText } from '@/features/portal/ui'
import { useUIStore } from '@/store/uiStore'

import { type BellTimes, type SchoolBells, usePartnerSchools, useSaveBells, useSchoolBell } from './api'
import { HhMmInput } from './SlotEditor'
import { hourLabel, PERIODS } from './types'

type Pair = [string, string]
type Rows = Record<number, Pair>
type Tab = 'all' | 'fri'

const FRIDAY = '4'

const rowsOf = (m: Record<string, [string, string]> | undefined): Rows =>
  Object.fromEntries(PERIODS.map((p) => [p, (m?.[String(p)] ?? ['', '']) as Pair]))

const toMap = (rows: Rows) =>
  Object.fromEntries(PERIODS.filter((p) => rows[p][0] && rows[p][1]).map((p) => [String(p), rows[p]]))

const hm = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
const minutes = (v: string) => {
  const [h, m] = v.split(':').map(Number)
  return h * 60 + m
}

/**
 * "Dars vaqtlari" — a school's lesson times, entered once by a teacher who
 * works there (backend timetable/bells.py). Saving sets the times of every
 * lesson at that school in everyone's timetable, and new lessons there take
 * them by themselves. One table for every school day; Friday may have its
 * own (it runs differently in many schools).
 */
export function BellsEditor({ schoolIds, onClose }: { schoolIds: number[]; onClose: () => void }) {
  const { t } = useTranslation()
  const { data: schoolList } = usePartnerSchools()
  const active = (schoolList ?? []).filter((s) => s.is_active !== false)
  // the schools of one's own lessons first
  const schools = [...active.filter((s) => schoolIds.includes(s.id)), ...active.filter((s) => !schoolIds.includes(s.id))]
  const [picked, setPicked] = useState<number | null>(null)
  const schoolId = picked ?? schools[0]?.id ?? null
  const bell = useSchoolBell(schoolId)

  return (
    <Modal title={t('Dars vaqtlari')} onClose={onClose}>
      <label className="field">
        <span className="field__label">{t('Maktab')}</span>
        <select className="input" value={schoolId ?? ''} onChange={(e) => setPicked(Number(e.target.value) || null)}>
          {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      {!schoolId ? (
        <p className="prose prose--note">{t("Hamkor maktablar ro'yxati bo'sh.")}</p>
      ) : bell.isLoading || !bell.data ? (
        <Skeleton lines={5} />
      ) : (
        <BellsForm key={`${schoolId}:${bell.dataUpdatedAt}`} bells={bell.data} onClose={onClose} />
      )}
    </Modal>
  )
}

function BellsForm({ bells, onClose }: { bells: SchoolBells; onClose: () => void }) {
  const { t } = useTranslation()
  const { lang } = useUIStore()
  const toast = useToast()
  const save = useSaveBells()
  const [all, setAll] = useState<Rows>(() => rowsOf(bells.times['*']))
  const [fri, setFri] = useState<Rows>(() => rowsOf(bells.times[FRIDAY] ?? bells.times['*']))
  const [friOwn, setFriOwn] = useState(() => !!Object.keys(bells.times[FRIDAY] ?? {}).length)
  const [tab, setTab] = useState<Tab>('all')
  // the quick fill: first lesson's start, a lesson's length, a break's
  const [start, setStart] = useState<string | null>('08:00')
  const [len, setLen] = useState(45)
  const [gap, setGap] = useState(5)
  // bumped to re-mount the time boxes after a quick fill
  const [version, setVersion] = useState(0)
  const ro = !bells.can_edit

  const rows = tab === 'fri' ? fri : all
  const setRows = tab === 'fri' ? setFri : setAll
  const setCell = (p: number, i: 0 | 1, v: string | null) =>
    setRows((r) => ({ ...r, [p]: (i === 0 ? [v ?? '', r[p][1]] : [r[p][0], v ?? '']) as Pair }))

  const quickFill = () => {
    if (!start) return
    let at = minutes(start)
    const next: Rows = {}
    for (const p of PERIODS) {
      next[p] = [hm(at), hm(at + len)]
      at += len + gap
    }
    setRows(next)
    setVersion((v) => v + 1)
  }

  const onSave = async () => {
    const half = PERIODS.find((p) => !!rows[p][0] !== !!rows[p][1])
    if (half) return toast(`${hourLabel(half, lang)}: ${t('boshlanish va tugash vaqtini kiriting')}`, 'error')
    const times: BellTimes = { '*': toMap(all) }
    if (friOwn) times[FRIDAY] = toMap(fri)
    try {
      const r = await save.mutateAsync({ schoolId: bells.school, times })
      toast(`${t('Saqlandi')} · ${r.updated_slots ?? 0} ${t('ta darsning vaqti yangilandi')}`)
      onClose()
    } catch (err) {
      toast(t(errText(err)), 'error')
    }
  }

  return (
    <div className="bells">
      {ro ? (
        <p className="prose prose--note">{t("Bu maktabda darsingiz yo'q — dars vaqtlarini shu maktab o'qituvchisi kiritadi.")}</p>
      ) : (
        <div className="bells__quick">
          <label className="field">
            <span className="field__label">{t('1-soat boshlanishi')}</span>
            <HhMmInput value={start} onChange={setStart} />
          </label>
          <label className="field">
            <span className="field__label">{t('Dars (daq)')}</span>
            <input className="input" type="number" min={20} max={90} value={len} onChange={(e) => setLen(Number(e.target.value) || 45)} />
          </label>
          <label className="field">
            <span className="field__label">{t('Tanaffus (daq)')}</span>
            <input className="input" type="number" min={0} max={60} value={gap} onChange={(e) => setGap(Number(e.target.value) || 0)} />
          </label>
          <button type="button" className="btn btn--sm bells__fill" onClick={quickFill} disabled={!start}>{t("To'ldirish")}</button>
        </div>
      )}

      {friOwn && (
        <div className="seg bells__tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'all'} className={`seg__b ${tab === 'all' ? 'is-on' : ''}`} onClick={() => setTab('all')}>
            {t('Dushanba–Payshanba')}
          </button>
          <button type="button" role="tab" aria-selected={tab === 'fri'} className={`seg__b ${tab === 'fri' ? 'is-on' : ''}`} onClick={() => setTab('fri')}>
            {t('Juma')}
          </button>
        </div>
      )}

      <table className="bells__table">
        <thead>
          <tr><th>{t('Soat')}</th><th>{t('Boshlanish')}</th><th>{t('Tugash')}</th></tr>
        </thead>
        <tbody>
          {PERIODS.map((p) => (
            <tr key={`${tab}-${p}-${version}`}>
              <th>{hourLabel(p, lang)}</th>
              <td><HhMmInput value={rows[p][0] || null} onChange={(v) => setCell(p, 0, v)} disabled={ro} /></td>
              <td><HhMmInput value={rows[p][1] || null} onChange={(v) => setCell(p, 1, v)} disabled={ro} /></td>
            </tr>
          ))}
        </tbody>
      </table>

      {!ro && (
        <label className="check bells__fri">
          <input type="checkbox" checked={friOwn} onChange={(e) => { setFriOwn(e.target.checked); if (!e.target.checked) setTab('all') }} />
          <span>{t('Juma kuni dars vaqtlari boshqacha')}</span>
        </label>
      )}
      <p className="prose prose--note bells__note">
        {t("Saqlanganda shu maktabdagi barcha darslarning (boshqa ustozlarnikining ham) vaqti shu jadvalga qarab qo'yiladi; yangi darslarga ham o'zi qo'yiladi.")}
        {bells.updated_by_name && ` ${t('Oxirgi marta')}: ${bells.updated_by_name}.`}
      </p>
      {!ro && (
        <div className="bells__acts">
          <button type="button" className="btn" onClick={onClose}>{t('Bekor qilish')}</button>
          <button type="button" className="btn btn--primary" onClick={onSave} disabled={save.isPending}>{t('Saqlash')}</button>
        </div>
      )}
    </div>
  )
}
