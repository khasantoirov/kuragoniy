import { useTranslation } from 'react-i18next'

import { ColumnChart } from '@/features/portal/ColumnChart'
import { DonutChart } from '@/features/portal/DonutChart'
import { LineChart } from '@/features/portal/LineChart'
import { Segmented } from '@/features/portal/ui'

import type { Composition, TrendPoint } from './api'
import type { ChartKind, TrendPeriod, useTrendView } from './trendView'

const PERIODS: { value: TrendPeriod; label: string; title: string }[] = [
  { value: 'week', label: 'Haftalik', title: 'Haftalik' },
  { value: 'month', label: 'Oylik', title: 'Oylik' },
  { value: 'quarter', label: 'Choraklik', title: 'Choraklik' },
  { value: 'year', label: 'Yillik', title: 'Yillik' },
]

const KINDS: { value: ChartKind; label: string }[] = [
  { value: 'bar', label: 'Ustunli' },
  { value: 'line', label: 'Chiziqli' },
  { value: 'pie', label: 'Doiraviy' },
]

// «5» darkest … «1» lightest: one hue, ordered by value.
const MARK_COLORS: Record<string, string> = {
  '5': 'var(--seq-5)', '4': 'var(--seq-4)', '3': 'var(--seq-3)', '2': 'var(--seq-2)', '1': 'var(--seq-1)',
}

/** Average mark and attendance over time — grouped by week, month, school
 * quarter or year, drawn as columns or a line — or, as pies, what the
 * marks and lesson attendances are made of in the selected period. */
export function TrendPanels({ trend, composition, view }: {
  trend: TrendPoint[]
  composition?: Composition
  view: ReturnType<typeof useTrendView>
}) {
  const { t } = useTranslation()
  const word = t(PERIODS.find((p) => p.value === view.period)?.title ?? 'Oylik')
  const Chart = view.kind === 'line' ? LineChart : ColumnChart
  const marks = trend.filter((p) => p.avg_mark != null)
  const attendance = trend.filter((p) => p.attendance != null)

  return (
    <>
      <div className="trendbar">
        {view.kind !== 'pie' && (
          <Segmented value={view.period} onChange={view.setPeriod} options={PERIODS.map((p) => ({ value: p.value, label: t(p.label) }))} />
        )}
        <span className="trendbar__sp" />
        <Segmented value={view.kind} onChange={view.setKind} options={KINDS.map((k) => ({ value: k.value, label: t(k.label) }))} />
      </div>

      {view.kind === 'pie' ? (
        <div className="cols2">
          <section className="panel">
            <h3 className="panel__title">{t('Baholar taqsimoti')}</h3>
            <DonutChart ariaLabel={t('Baholar taqsimoti')} total={t('ta baho')}
              slices={(['5', '4', '3', '2', '1'] as const).map((m) => ({ label: `«${m}»`, value: composition?.marks[m] ?? 0, color: MARK_COLORS[m] }))} />
          </section>
          <section className="panel">
            <h3 className="panel__title">{t('Davomat tarkibi')}</h3>
            <DonutChart ariaLabel={t('Davomat tarkibi')} total={t('dars qatnovi')}
              slices={[
                { label: t('Qatnashgan'), value: composition?.attendance.present ?? 0, color: 'var(--tone-ok)' },
                { label: t('Kechikkan'), value: composition?.attendance.late ?? 0, color: 'var(--tone-mid)' },
                { label: t('Sababli'), value: composition?.attendance.excused ?? 0, color: 'var(--ink-3)' },
                { label: t('Sababsiz'), value: composition?.attendance.unexcused ?? 0, color: 'var(--tone-bad)' },
              ]} />
          </section>
        </div>
      ) : (
        <div className="cols2">
          <section className="panel">
            <h3 className="panel__title">{word} {t("o'rtacha baho")}</h3>
            {marks.length ? (
              <Chart ariaLabel={`${word} ${t("o'rtacha baho")}`} max={5} format={(v) => v.toFixed(1)}
                data={marks.map((p) => ({ label: p.label, value: p.avg_mark ?? 0, note: `${p.marks} ${t('ta baho')}` }))} />
            ) : <p className="prose prose--note">{t("Ma'lumot yo'q.")}</p>}
          </section>
          <section className="panel">
            <h3 className="panel__title">{word} {t('davomat, %')}</h3>
            {attendance.length ? (
              <Chart ariaLabel={`${word} ${t('davomat, %')}`} max={100} format={(v) => `${Math.round(v)}`}
                data={attendance.map((p) => ({ label: p.label, value: p.attendance ?? 0 }))} />
            ) : <p className="prose prose--note">{t("Ma'lumot yo'q.")}</p>}
          </section>
        </div>
      )}
    </>
  )
}
