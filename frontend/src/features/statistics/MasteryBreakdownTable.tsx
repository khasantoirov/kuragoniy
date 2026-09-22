import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BLANK_SCHOOL_KEY, type MasteryBreakdownRow } from './masteryTypes'

type SortKey = 'default' | 'name' | 'students' | 'coverage' | 'pct' | 'attendance'

/** The direct replacement for journal/AdminStatsTable.tsx's "Sinflar
 * kesimida" table — always visible under whichever chart form is
 * selected, per the "tanlagich + doimiy jadval" decision, so the exact
 * numbers behind a chart are always one scroll away. Sorting is
 * client-side (the row count here is bounded by the caller's own
 * schools/classes, never large enough to need server-side sorting). */
export function MasteryBreakdownTable({ rows, levelLabel }: { rows: MasteryBreakdownRow[]; levelLabel: string }) {
  const { t } = useTranslation()
  const [sortKey, setSortKey] = useState<SortKey>('default')

  const sorted = useMemo(() => {
    if (sortKey === 'default') return rows
    const indexed = rows.map((r, i) => ({ r, i }))
    const cmp: Record<Exclude<SortKey, 'default'>, (a: MasteryBreakdownRow, b: MasteryBreakdownRow) => number> = {
      name: (a, b) => (a.label ?? '').localeCompare(b.label ?? ''),
      students: (a, b) => b.total_students - a.total_students,
      coverage: (a, b) => (b.coverage_pct ?? -1) - (a.coverage_pct ?? -1),
      pct: (a, b) => (b.class_pct ?? -1) - (a.class_pct ?? -1),
      attendance: (a, b) => (b.attendance_rate_pct ?? -1) - (a.attendance_rate_pct ?? -1),
    }
    indexed.sort((a, b) => cmp[sortKey](a.r, b.r) || a.i - b.i)
    return indexed.map((x) => x.r)
  }, [rows, sortKey])

  if (!rows.length) return <p className="prose">{t("Hali yozuv yo'q.")}</p>

  const sortableTh = (key: SortKey, label: string) => (
    <th className="table__q">
      <button type="button" className="mstats__sortbtn" onClick={() => setSortKey((k) => (k === key ? 'default' : key))}>
        {label}{sortKey === key ? ' ▾' : ''}
      </button>
    </th>
  )

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>{levelLabel}</th>
            {sortableTh('students', t("O'quvchi"))}
            {sortableTh('coverage', t('Baholangan'))}
            <th className="table__q">{t('Darslar soni')}</th>
            <th className="table__q">{t("O'rtacha")}</th>
            {sortableTh('pct', t("O'zlashtirish"))}
            {sortableTh('attendance', t('Davomat'))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.key} className={r.selected ? 'is-sel' : ''}>
              <td className="table__name">
                {r.key === BLANK_SCHOOL_KEY ? t("Maktab ko'rsatilmagan") : r.label}
                {r.variants.length > 1 && (
                  <span className="mstats__variants" title={r.variants.join(', ')}>
                    {' '}· {r.variants.length} {t('xil yozilgan')}
                  </span>
                )}
                <div className="mstats__sublabel">{r.sublabel}</div>
              </td>
              <td className="table__q">{r.total_students}</td>
              <td className={`table__q ${r.thin ? 'mstats__thin' : ''}`}>{r.graded_students} / {r.total_students}</td>
              <td className="table__q">{r.lesson_days}</td>
              <td className="table__q">{r.class_avg !== null ? r.class_avg.toFixed(2) : '—'}</td>
              <td className={`table__q ${r.thin ? 'mstats__thin' : ''}`}>
                {r.class_pct !== null ? `${r.class_pct}%${r.thin ? '*' : ''}` : '—'}
              </td>
              <td className="table__q">{r.attendance_rate_pct !== null ? `${r.attendance_rate_pct}%` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.some((r) => r.thin) && <p className="form__note mstats__note">{t("* Ma'lumot yetarli emas")}</p>}
    </div>
  )
}
