import { createContext, useContext, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'

import { Segmented } from '@/features/portal/ui'

import { CHORAK_OPTIONS, useClassRows } from './api'

/* Statistika's one filter panel. The choice lives in the address
   (?chorak= ?school= ?teacher= ?class=), so it survives switching tabs and
   reloading; each tab reads what applies to it through useStatsHub() and
   hides its own copies of these controls while inside Statistika. */

export interface StatsFilter {
  /** 'all' or '1'..'4' */
  chorak: string
  /** a partner school id, 'none' (linked to none) or '' */
  school: string
  teacher: string
  cls: string
}

export type StatsField = 'chorak' | 'school' | 'teacher' | 'class'

/** The address parameters the filter owns — kept when the tab changes. */
export const STATS_FILTER_PARAMS = ['chorak', 'school', 'teacher', 'class']

const Ctx = createContext<{ filter: StatsFilter; set: (patch: Partial<StatsFilter>) => void } | null>(null)

export function StatsFilterProvider({ children }: { children: ReactNode }) {
  const [params, setParams] = useSearchParams()
  const filter: StatsFilter = {
    chorak: params.get('chorak') || 'all',
    school: params.get('school') || '',
    teacher: params.get('teacher') || '',
    cls: params.get('class') || '',
  }
  const set = (patch: Partial<StatsFilter>) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      const merged = { ...filter, ...patch }
      const put = (key: string, value: string, empty = '') => (value && value !== empty ? next.set(key, value) : next.delete(key))
      put('chorak', merged.chorak, 'all')
      put('school', merged.school)
      put('teacher', merged.teacher)
      put('class', merged.cls)
      next.delete('page') // a new filter starts from the first page
      return next
    }, { replace: true })
  return <Ctx.Provider value={{ filter, set }}>{children}</Ctx.Provider>
}

/** The Statistika filter, or null outside Statistika. */
export const useStatsHub = () => useContext(Ctx)

/** The panel: the fields that apply to the open tab. Schools, teachers and
 * classes narrow each other — a teacher list for the chosen school, a class
 * list for the chosen school and teacher. */
export function StatsFilterBar({ fields }: { fields: StatsField[] }) {
  const { t } = useTranslation()
  const hub = useStatsHub()
  const { data: rows = [] } = useClassRows()
  if (!hub || !fields.length) return null
  const { filter, set } = hub

  const schoolOf = (r: (typeof rows)[number]) => (r.school_id ? String(r.school_id) : 'none')
  const inSchool = rows.filter((r) => !filter.school || schoolOf(r) === filter.school)
  const schools = [...new Map(rows.filter((r) => r.school_id).map((r) => [String(r.school_id), r.school])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1]))
  const teachers = [...new Map(inSchool.map((r) => [r.teacher_id, r.teacher])).entries()].sort((a, b) => a[1].localeCompare(b[1]))
  const classes = inSchool.filter((r) => !filter.teacher || r.teacher_id === filter.teacher)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))

  const pickSchool = (school: string) => {
    const keepsTeacher = !filter.teacher || rows.some((r) => r.teacher_id === filter.teacher && (!school || schoolOf(r) === school))
    set({ school, teacher: keepsTeacher ? filter.teacher : '', cls: '' })
  }
  const any = (fields.includes('chorak') && filter.chorak !== 'all') || filter.school || filter.teacher || filter.cls

  return (
    <div className="filters statsfilter">
      {fields.includes('chorak') && (
        <Segmented value={filter.chorak} onChange={(v) => set({ chorak: v })} options={CHORAK_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))} />
      )}
      {fields.includes('school') && (
        <select className="input input--sm" value={filter.school} onChange={(e) => pickSchool(e.target.value)} aria-label={t('Maktab')}>
          <option value="">{t('Barcha maktablar')}</option>
          {schools.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          {rows.some((r) => !r.school_id) && <option value="none">{t('Biriktirilmagan')}</option>}
        </select>
      )}
      {fields.includes('teacher') && (
        <select className="input input--sm" value={filter.teacher} onChange={(e) => set({ teacher: e.target.value, cls: '' })} aria-label={t("O'qituvchi")}>
          <option value="">{t("Barcha o'qituvchilar")}</option>
          {teachers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      )}
      {fields.includes('class') && (
        <select className="input input--sm" value={filter.cls} onChange={(e) => set({ cls: e.target.value })} aria-label={t('Sinf')}>
          <option value="">{t('Barcha sinflar')}</option>
          {classes.map((r) => (
            <option key={r.class_id} value={r.class_id}>{r.name}{!filter.teacher ? ` — ${r.teacher}` : ''}</option>
          ))}
        </select>
      )}
      {any && (
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => set({ chorak: 'all', school: '', teacher: '', cls: '' })}>
          ✕ {t('Tozalash')}
        </button>
      )}
    </div>
  )
}
