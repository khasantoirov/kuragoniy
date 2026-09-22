import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DonutChart } from '@/components/charts/DonutChart'
import { RankBarChart, type RankDatum } from '@/components/charts/RankBarChart'
import { StatCard } from '@/components/charts/StatCard'
import { TrendLineChart, type TrendPoint } from '@/components/charts/TrendLineChart'
import { Skeleton } from '@/components/Skeleton'
import { bucketLabel } from '@/features/journal/masteryStats'
import { useUIStore } from '@/store/uiStore'

import { useMasteryBreakdown } from './masteryApi'
import { MasteryBreakdownTable } from './MasteryBreakdownTable'
import { MasteryScopeFilters } from './MasteryScopeFilters'
import { BLANK_SCHOOL_KEY, type MasteryForm, type MasteryPeriod, type MasteryTrendPoint } from './masteryTypes'
import type { DashboardChorak } from './types'

const FORMS: { key: MasteryForm; label: string }[] = [
  { key: 'distribution', label: 'Taqsimot' },
  { key: 'comparison', label: 'Taqqoslash' },
  { key: 'trend', label: 'Dinamika' },
]

const PERIODS: { key: MasteryPeriod; label: string }[] = [
  { key: 'week', label: 'Haftalik' },
  { key: 'month', label: 'Oylik' },
  { key: 'quarter', label: 'Choraklik' },
]

const SINGLE = 'var(--cat-1)'

/** A trend point's meta, shaped for bucketLabel() (features/journal/
 * masteryStats.ts) — that function expects a JS-style 0-indexed month,
 * the server sends a natural 1-12, so the -1 happens exactly once here. */
function toBucketMeta(p: MasteryTrendPoint) {
  return { period: p.period, year: p.year ?? 0, week: p.week, month: p.month !== undefined ? p.month - 1 : undefined, quarter: p.quarter }
}

/** The org -> school -> class mastery breakdown: replaces the old
 * donut-only snapshot and the client-side "Sinflar kesimida" table
 * (journal/AdminStatsTable.tsx) with one server-backed view that adds a
 * Maktab/Sinf drill-down and a form switch (Taqsimot/Taqqoslash/
 * Dinamika), with the exact numbers always visible in the table below.
 *
 * Rendered for every approved user, not just admins: the backend scopes
 * everything through the same scoped_class_ids() a teacher's journal
 * already uses, so a teacher sees only their own schools/classes —
 * which is exactly the "kim yaxshi o'zlashtiryapti" view they lack
 * today across their own multiple classes. */
export function MasteryBreakdown({ chorak }: { chorak: DashboardChorak }) {
  const { t } = useTranslation()
  const { lang } = useUIStore()

  const [form, setForm] = useState<MasteryForm>(() => {
    const raw = localStorage.getItem('afmd.stats.form')
    return raw === 'distribution' || raw === 'comparison' || raw === 'trend' ? raw : 'distribution'
  })
  const changeForm = (f: MasteryForm) => {
    setForm(f)
    localStorage.setItem('afmd.stats.form', f)
  }

  const [period, setPeriod] = useState<MasteryPeriod>(() => {
    const raw = localStorage.getItem('afmd.stats.period')
    return raw === 'week' || raw === 'month' || raw === 'quarter' ? raw : 'quarter'
  })
  const changePeriod = (p: MasteryPeriod) => {
    setPeriod(p)
    localStorage.setItem('afmd.stats.period', p)
  }

  const [school, setSchool] = useState<string | null>(null)
  const [classId, setClassId] = useState<number | null>(null)

  const { data, isLoading } = useMasteryBreakdown({ chorak, school, classId, period })

  if (isLoading && !data) return <Skeleton lines={4} />
  if (!data) return null

  const { totals, breakdown, filters, scope, trend } = data

  const scopeLabel =
    scope.level === 'class'
      ? `${scope.school_label ?? t("Maktab ko'rsatilmagan")} · ${scope.class_name}`
      : scope.level === 'school'
        ? (scope.school_label ?? t("Maktab ko'rsatilmagan"))
        : t('Umumiy')

  const levelLabel = breakdown.level === 'school' ? t('Maktab') : t('Sinf')

  const onSelectRow = (key: string) => {
    if (breakdown.level === 'school') {
      setSchool(key)
      setClassId(null)
    } else {
      setClassId(Number(key))
    }
  }

  const highlightKey = breakdown.level === 'class' && classId !== null ? String(classId) : (school ?? undefined)

  return (
    <div className="mstats">
      <MasteryScopeFilters
        schools={filters.schools}
        classes={filters.classes}
        school={school}
        classId={classId}
        onChange={(next) => {
          setSchool(next.school)
          setClassId(next.classId)
        }}
      />

      <p className="dash__card-title stats__sub">{scopeLabel}</p>

      <div className="dash__stats">
        <StatCard label={t('Sinflar')} value={totals.total_classes} icon="clipboard" />
        <StatCard label={t("O'quvchilar")} value={totals.total_students} icon="users" />
        <StatCard
          label={t('Baholangan')}
          value={`${totals.graded_students} / ${totals.total_students}`}
          icon="target"
          progressPct={totals.coverage_pct}
          accent={totals.thin ? 'mid' : undefined}
          hint={totals.thin ? t("Ma'lumot yetarli emas") : undefined}
        />
        <StatCard
          label={t('Davomat')}
          value={totals.attendance_rate_pct !== null ? `${totals.attendance_rate_pct}%` : '—'}
          icon="check2"
          progressPct={totals.attendance_rate_pct}
        />
      </div>

      <div className="jhead">
        <div className="chips chips--nowrap">
          {FORMS.map((f) => (
            <button key={f.key} className={`chip ${form === f.key ? 'is-on' : ''}`} onClick={() => changeForm(f.key)}>
              {t(f.label)}
            </button>
          ))}
        </div>
        {form === 'trend' && (
          <div className="chips chips--nowrap">
            {PERIODS.map((p) => (
              <button key={p.key} className={`chip ${period === p.key ? 'is-on' : ''}`} onClick={() => changePeriod(p.key)}>
                {t(p.label)}
              </button>
            ))}
          </div>
        )}
      </div>

      {form === 'distribution' && (
        <div className="dash__row">
          <div className="dash__card">
            <div className="mastery__snapshot">
              <DonutChart
                ariaLabel={`${t('Yaxshi')} ${totals.good}, ${t("O'rtacha")} ${totals.mid}, ${t('Past')} ${totals.bad}`}
                centerValue={totals.class_pct !== null ? `${totals.class_pct}%` : '—'}
                centerLabel={t("O'zlashtirish")}
                segments={[
                  { key: 'good', label: t('Yaxshi'), value: totals.good, color: 'var(--band-good)' },
                  { key: 'mid', label: t("O'rtacha"), value: totals.mid, color: 'var(--band-mid)' },
                  { key: 'bad', label: t('Past'), value: totals.bad, color: 'var(--band-bad)' },
                  { key: 'ungraded', label: t('Baholanmagan'), value: totals.ungraded, color: 'var(--rule)' },
                ]}
              />
              <div className="mastery__kpis">
                <div className="mastery__kpi mastery__kpi--good"><span>{t('Yaxshi')}</span><b>{totals.good}</b></div>
                <div className="mastery__kpi mastery__kpi--mid"><span>{t("O'rtacha")}</span><b>{totals.mid}</b></div>
                <div className="mastery__kpi mastery__kpi--bad"><span>{t('Past')}</span><b>{totals.bad}</b></div>
                <div className="mastery__kpi"><span>{t('Baholanmagan')}</span><b>{totals.ungraded}</b></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {form === 'comparison' && (
        <div className="dash__row">
          <div className="dash__card mstats__wide">
            {breakdown.rows.length ? (
              <RankBarChart
                ariaLabel={t("Maktab yoki sinflar bo'yicha o'zlashtirish taqqoslash")}
                color={SINGLE}
                data={breakdown.rows.map(
                  (r): RankDatum => ({
                    key: r.key,
                    label: r.key === BLANK_SCHOOL_KEY ? t("Maktab ko'rsatilmagan") : (r.label ?? r.key),
                    value: r.class_pct,
                    muted: r.thin,
                    hint: `${t('Baholangan')}: ${r.graded_students} / ${r.total_students}`,
                  })
                )}
                onSelect={onSelectRow}
                highlightKey={highlightKey}
              />
            ) : (
              <p className="prose">{t("Hali yozuv yo'q.")}</p>
            )}
            {breakdown.rows.some((r) => r.thin) && (
              <p className="form__note mstats__note">{t("* Ma'lumot yetarli emas")}</p>
            )}
          </div>
        </div>
      )}

      {form === 'trend' && (
        <div className="dash__row">
          <div className="dash__card mstats__wide">
            {trend.ignores_chorak_filter && (
              <p className="form__note mstats__note">{t('Choraklik dinamika barcha choraklarni ko\'rsatadi')}</p>
            )}
            <TrendLineChart
              ariaLabel={t("O'zlashtirish dinamikasi")}
              valueSuffix="%"
              seriesLabel={scopeLabel}
              referenceLabel={scope.level === 'class' ? scope.school_label ?? t("Maktab ko'rsatilmagan") : t('Umumiy')}
              formatDate={(key) => {
                const point = trend.points.find((p) => p.key === key)
                return point ? bucketLabel(toBucketMeta(point), lang) : key
              }}
              data={trend.points.map((p): TrendPoint => ({ date: p.key, value: p.class_pct }))}
              reference={trend.reference?.map((p): TrendPoint => ({ date: p.key, value: p.class_pct }))}
            />
          </div>
        </div>
      )}

      <p className="dash__card-title stats__sub">{t('Sinflar kesimida')}</p>
      <MasteryBreakdownTable rows={breakdown.rows} levelLabel={levelLabel} />
    </div>
  )
}
