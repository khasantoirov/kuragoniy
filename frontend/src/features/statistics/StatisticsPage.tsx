import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'

import { RankBarChart, type RankDatum } from '@/components/charts/RankBarChart'
import { StatCard } from '@/components/charts/StatCard'
import { Skeleton } from '@/components/Skeleton'
import { BANDS } from '@/features/journal/masteryStats'
import { PageHead } from '@/features/portal/ui'
import { useSchoolsOverview, type StatsGroup } from '@/features/schools/api'
import { useStatsHub } from '@/features/schools/statsFilter'
import { TrendPanels } from '@/features/schools/TrendPanels'
import { useTrendView } from '@/features/schools/trendView'
import { IC } from '@/icons'

const COMPARE_TITLE: Record<StatsGroup, string> = {
  school: 'Maktablar taqqoslash',
  teacher: "O'qituvchilar taqqoslash",
  class: 'Sinflar taqqoslash',
}

const pct = (v: number | null | undefined) => (v == null ? '—' : `${v}%`)

/** Statistika › Umumiy ko'rinish: how the journal stands for the period and
 * scope picked in the filter panel — the headline figures, pupils by band,
 * the trend and the next level down side by side. Every number comes from
 * the same source as the Jurnal tab's table (schools/stats.py), so the two
 * always agree; a bar in the comparison narrows the panel one level in. */
export function StatisticsPage() {
  const { t } = useTranslation()
  const [, setParams] = useSearchParams()
  const f = useStatsHub()?.filter
  const view = useTrendView()
  // what the comparison lines up: one level below the panel's scope
  const level: StatsGroup | null = f?.cls ? null : f?.teacher ? 'class' : f?.school ? 'teacher' : 'school'
  const scope = f ? { school: f.school, teacher: f.teacher, class: f.cls } : {}
  const { data, isLoading } = useSchoolsOverview(f?.chorak ?? 'all', view.period, scope, level ?? 'class')

  const narrow = (key: string) => setParams((prev) => {
    const p = new URLSearchParams(prev)
    p.set(level === 'school' ? 'school' : level === 'teacher' ? 'teacher' : 'class', key)
    if (level !== 'class') p.delete('class')
    return p
  }, { replace: true })
  const openJurnal = () => setParams((prev) => {
    const p = new URLSearchParams(prev)
    p.set('bolim', 'jurnal')
    return p
  })

  if (isLoading && !data) return <Skeleton lines={5} />
  if (!data) return null
  const { totals, bands } = data

  const compare: RankDatum[] = level && data.group === level
    ? data.rows
      .filter((r) => r.students > 0)
      .map((r) => ({
        key: 'class_id' in r ? String(r.class_id) : String(r.id),
        label: 'class_id' in r ? r.name : r.id === 'none' ? t('Biriktirilmagan') : r.name,
        titleText: 'class_id' in r ? `${r.name} · ${r.teacher}` : undefined,
        value: r.uzlashtirish,
        hint: `${t("O'quvchilar")}: ${r.students}`,
      }))
      .sort((a, b) => (b.value ?? -1) - (a.value ?? -1))
    : []

  return (
    <div className="stats">
      <PageHead title={t("Umumiy ko'rinish")}
        sub={t("Jurnal bo'yicha o'zlashtirish va davomat. Davr, maktab, o'qituvchi va sinfni yuqoridagi filtrdan tanlang.")} />

      <div className="dash__stats">
        <StatCard label={t("O'quvchilar")} value={totals.students} hint={`${totals.classes} ${t('ta sinf')}`} icon="users" />
        <StatCard label={t("O'rtacha baho")} value={totals.avg_mark?.toFixed(2) ?? '—'} hint={`${totals.marks} ${t('ta baho')}`} icon="star" />
        <StatCard label={t("O'zlashtirish")} value={pct(totals.uzlashtirish)} progressPct={totals.uzlashtirish} icon="target" />
        <StatCard label={t('Davomat')} value={pct(totals.attendance)} progressPct={totals.attendance} icon="check2"
          hint={`${t('sababsiz')} ${totals.abs_n} · ${t('kech')} ${totals.late}`} />
      </div>

      <section className="panel dash">
        <h3 className="panel__title">{t("O'quvchilar baholar bo'yicha")}</h3>
        <div className="mastery__kpis">
          {BANDS.map((b) => (
            <div key={b.key} className={`mastery__kpi gchip--${b.level}`}><span>{t(b.label)}</span><b>{bands[b.key]}</b></div>
          ))}
          <div className="mastery__kpi"><span>{t('Baholanmagan')}</span><b>{bands.ungraded}</b></div>
        </div>
        <p className="form__note mstats__note">{t("O'quvchining o'rtacha bahosi qaysi bahoga yaqin bo'lsa, shu guruhda sanaladi.")}</p>
      </section>

      <TrendPanels trend={data.trend} composition={data.composition} view={view} />

      {level && compare.length > 1 && (
        <section className="panel dash">
          <div className="thead">
            <h3 className="panel__title">{t(COMPARE_TITLE[level])}</h3>
            <p className="thead__hint">{t("O'zlashtirish bo'yicha. Bosing — shu bilan cheklanadi.")}</p>
          </div>
          <RankBarChart ariaLabel={t(COMPARE_TITLE[level])} color="var(--cat-1)" data={compare} onSelect={narrow} />
        </section>
      )}

      <p>
        <button type="button" className="btn btn--ghost" onClick={openJurnal}>{IC.list} {t('Batafsil jadval — «Jurnal» bo‘limida')}</button>
      </p>
    </div>
  )
}
