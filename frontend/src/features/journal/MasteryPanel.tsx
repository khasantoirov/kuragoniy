import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useUIStore } from '@/store/uiStore'

import { BANDS, bucketDays, computeMastery, gradedOf, type BucketStats, type PeriodType } from './masteryStats'
import type { Grid } from './types'

const PERIODS: { key: PeriodType; label: string }[] = [
  { key: 'week', label: 'Haftalik' },
  { key: 'month', label: 'Oylik' },
  { key: 'quarter', label: 'Choraklik' },
  { key: 'year', label: 'Yillik' },
]

// Donut = latest bucket's part-to-whole snapshot; the bars below carry the
// trend across buckets — the two are complementary, not duplicates.
function MasteryDonut({ bucket, ariaLabel }: { bucket: BucketStats; ariaLabel: string }) {
  const total = gradedOf(bucket)
  const r = 52
  const circumference = 2 * Math.PI * r
  const raw = BANDS.map((b) => ({ key: b.key, level: b.level, value: bucket[b.key] })).filter((s) => s.value > 0)
  const gap = raw.length > 1 ? 3 : 0

  let offset = 0
  const arcs = raw.map((s) => {
    const share = s.value / total
    const arc = { key: s.key, level: s.level, length: Math.max(share * circumference - gap, 0), offset }
    offset += share * circumference
    return arc
  })

  return (
    <svg viewBox="0 0 120 120" className="mastery__donut" role="img" aria-label={ariaLabel}>
      <circle cx="60" cy="60" r={r} className="mastery__donut-track" strokeWidth="14" fill="none" />
      {arcs.map((a) => (
        <circle
          key={a.key}
          cx="60"
          cy="60"
          r={r}
          fill="none"
          strokeWidth="14"
          strokeLinecap="round"
          style={{
            stroke: `var(--g${a.level})`,
            strokeDasharray: `${a.length} ${circumference}`,
            strokeDashoffset: -a.offset,
            transform: 'rotate(-90deg)',
            transformOrigin: '60px 60px',
          }}
        />
      ))}
      <text x="60" y="55" textAnchor="middle" className="mastery__donut-num">
        {bucket.classPct !== null ? `${bucket.classPct}%` : '—'}
      </text>
      <text x="60" y="74" textAnchor="middle" className="mastery__donut-label">
        {bucket.label}
      </text>
    </svg>
  )
}

/** Pupils by the band their period average rounds to — the platform's five
 * grading bands (a'lo … yomon) in the journal's colours. */
export function MasteryPanel({ grid }: { grid: Grid }) {
  const { t } = useTranslation()
  const { lang } = useUIStore()
  const [period, setPeriod] = useState<PeriodType>(() => {
    const raw = localStorage.getItem('afmd.mperiod')
    return raw === 'week' || raw === 'month' || raw === 'quarter' || raw === 'year' ? raw : 'quarter'
  })

  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  const changePeriod = (p: PeriodType) => {
    setPeriod(p)
    setSelectedKey(null)
    localStorage.setItem('afmd.mperiod', p)
  }

  const stats = useMemo(() => computeMastery(grid, bucketDays(grid.days, period), lang), [grid, period, lang])
  const graded = stats.filter((s) => gradedOf(s) > 0)
  const latest = graded[graded.length - 1] ?? null
  const selected = graded.find((s) => s.key === selectedKey) ?? latest
  const maxTotal = Math.max(1, ...stats.map(gradedOf))
  const counts = (s: BucketStats) => BANDS.map((b) => `${t(b.label)} ${s[b.key]}`).join(' / ')

  return (
    <div className="mastery">
      <div className="jhead">
        <h3 className="mastery__title">{t("O'zlashtirish diagrammasi")}</h3>
        <div className="chips chips--nowrap">
          {PERIODS.map((p) => (
            <button key={p.key} className={`chip ${period === p.key ? 'is-on' : ''}`} onClick={() => changePeriod(p.key)}>
              {t(p.label)}
            </button>
          ))}
        </div>
      </div>

      {!graded.length ? (
        <p className="mastery__empty">{t("Bu davr uchun baholar hali kiritilmagan.")}</p>
      ) : (
        <>
          <div className="mastery__snapshot">
            {selected && <MasteryDonut bucket={selected} ariaLabel={counts(selected)} />}
            <div className="mastery__kpis">
              <div className="mastery__kpi">
                <span>{selected?.label ?? t("O'zlashtirish")}</span>
                <b>{selected && selected.classPct !== null ? `${selected.classPct}%` : '—'}</b>
              </div>
              {BANDS.map((b) => (
                <div key={b.key} className={`mastery__kpi gchip--${b.level}`}>
                  <span>{t(b.label)}</span>
                  <b>{selected?.[b.key] ?? 0}</b>
                </div>
              ))}
            </div>
          </div>

          <div className="mastery__legend">
            {BANDS.map((b) => (
              <span key={b.key} className="mastery__lg"><i className={`mastery__dot gchip--${b.level}`} />{t(b.label)} ({b.level === 1 ? '≤1' : b.level})</span>
            ))}
          </div>

          <p className="mastery__hint">{t('Muayyan davrni ko\'rish uchun ustunni yoki jadval qatorini bosing.')}</p>

          <div className="mastery__scroll">
            <div className="mastery__chart">
              {stats.map((s) => {
                const total = gradedOf(s)
                const h = (n: number) => (n / maxTotal) * 100
                const isSel = selected?.key === s.key
                return (
                  <button
                    key={s.key}
                    type="button"
                    className={`mastery__col ${isSel ? 'is-sel' : ''}`}
                    disabled={total === 0}
                    onClick={() => setSelectedKey(s.key)}
                  >
                    <div className="mastery__bar" title={`${s.label}: ${s.classPct !== null ? s.classPct + '%' : t('Baholanmagan')} · ${counts(s)}`}>
                      {total === 0 ? (
                        <div className="mastery__seg mastery__seg--empty" style={{ height: '3px' }} />
                      ) : (
                        BANDS.map((b) => s[b.key] > 0 && (
                          <div key={b.key} className={`mastery__seg gchip--${b.level}`} style={{ height: `${h(s[b.key])}%` }} />
                        ))
                      )}
                    </div>
                    <div className="mastery__collabel">{s.label}</div>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="table-wrap mastery__table">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('Davr')}</th>
                  {BANDS.map((b) => <th key={b.key} className="table__q">{t(b.label)}</th>)}
                  <th className="table__q">{t("O'zlashtirish")}</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s) => {
                  const total = gradedOf(s)
                  const isSel = selected?.key === s.key
                  return (
                    <tr
                      key={s.key}
                      className={`mastery__row ${isSel ? 'is-sel' : ''} ${total ? 'is-clickable' : ''}`}
                      onClick={() => total > 0 && setSelectedKey(s.key)}
                    >
                      <td>{s.label}</td>
                      {BANDS.map((b) => <td key={b.key} className="table__q">{s[b.key]}</td>)}
                      <td className="table__q">{s.classPct !== null ? `${s.classPct}%` : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
