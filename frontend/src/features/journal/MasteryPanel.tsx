import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useUIStore } from '@/store/uiStore'

import { bucketDays, computeMastery, type BucketStats, type PeriodType } from './masteryStats'
import type { Grid } from './types'

const PERIODS: { key: PeriodType; label: string }[] = [
  { key: 'week', label: 'Haftalik' },
  { key: 'month', label: 'Oylik' },
  { key: 'quarter', label: 'Choraklik' },
  { key: 'year', label: 'Yillik' },
]

const BAND_COLOR: Record<'good' | 'mid' | 'bad', string> = {
  good: 'var(--band-good)',
  mid: 'var(--band-mid)',
  bad: 'var(--band-bad)',
}

// Donut = latest bucket's part-to-whole snapshot; the bars below carry the
// trend across buckets — the two are complementary, not duplicates.
function MasteryDonut({ bucket, labels }: { bucket: BucketStats; labels: { good: string; mid: string; bad: string } }) {
  const total = bucket.good + bucket.mid + bucket.bad
  const r = 52
  const circumference = 2 * Math.PI * r
  const raw = (['good', 'mid', 'bad'] as const)
    .map((key) => ({ key, value: bucket[key] }))
    .filter((s) => s.value > 0)
  const gap = raw.length > 1 ? 3 : 0

  let offset = 0
  const arcs = raw.map((s) => {
    const share = s.value / total
    const arc = { key: s.key, value: s.value, length: Math.max(share * circumference - gap, 0), offset }
    offset += share * circumference
    return arc
  })

  return (
    <svg viewBox="0 0 120 120" className="mastery__donut" role="img" aria-label={`${labels.good} ${bucket.good}, ${labels.mid} ${bucket.mid}, ${labels.bad} ${bucket.bad}`}>
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
            stroke: BAND_COLOR[a.key],
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
  const graded = stats.filter((s) => s.good + s.mid + s.bad > 0)
  const latest = graded[graded.length - 1] ?? null
  const selected = graded.find((s) => s.key === selectedKey) ?? latest
  const maxTotal = Math.max(1, ...stats.map((s) => s.good + s.mid + s.bad))

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
            {selected && <MasteryDonut bucket={selected} labels={{ good: t('Yaxshi'), mid: t("O'rtacha"), bad: t('Past') }} />}
            <div className="mastery__kpis">
              <div className="mastery__kpi">
                <span>{selected?.label ?? t("O'zlashtirish")}</span>
                <b>{selected && selected.classPct !== null ? `${selected.classPct}%` : '—'}</b>
              </div>
              <div className="mastery__kpi mastery__kpi--good">
                <span>{t('Yaxshi')}</span>
                <b>{selected?.good ?? 0}</b>
              </div>
              <div className="mastery__kpi mastery__kpi--mid">
                <span>{t("O'rtacha")}</span>
                <b>{selected?.mid ?? 0}</b>
              </div>
              <div className="mastery__kpi mastery__kpi--bad">
                <span>{t('Past')}</span>
                <b>{selected?.bad ?? 0}</b>
              </div>
            </div>
          </div>

          <div className="mastery__legend">
            <span className="mastery__lg"><i className="mastery__dot mastery__dot--good" />{t('Yaxshi')} (5)</span>
            <span className="mastery__lg"><i className="mastery__dot mastery__dot--mid" />{t("O'rtacha")} (4)</span>
            <span className="mastery__lg"><i className="mastery__dot mastery__dot--bad" />{t('Past')} (&le;3)</span>
          </div>

          <p className="mastery__hint">{t('Muayyan davrni ko\'rish uchun ustunni yoki jadval qatorini bosing.')}</p>

          <div className="mastery__scroll">
            <div className="mastery__chart">
              {stats.map((s) => {
                const total = s.good + s.mid + s.bad
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
                    <div
                      className="mastery__bar"
                      title={`${s.label}: ${s.classPct !== null ? s.classPct + '%' : t('Baholanmagan')} · ${t('Yaxshi')} ${s.good} / ${t("O'rtacha")} ${s.mid} / ${t('Past')} ${s.bad}`}
                    >
                      {total === 0 ? (
                        <div className="mastery__seg mastery__seg--empty" style={{ height: '3px' }} />
                      ) : (
                        <>
                          {s.good > 0 && <div className="mastery__seg mastery__seg--good" style={{ height: `${h(s.good)}%` }} />}
                          {s.mid > 0 && <div className="mastery__seg mastery__seg--mid" style={{ height: `${h(s.mid)}%` }} />}
                          {s.bad > 0 && <div className="mastery__seg mastery__seg--bad" style={{ height: `${h(s.bad)}%` }} />}
                        </>
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
                  <th className="table__q">{t('Yaxshi')}</th>
                  <th className="table__q">{t("O'rtacha")}</th>
                  <th className="table__q">{t('Past')}</th>
                  <th className="table__q">{t("O'zlashtirish")}</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s) => {
                  const total = s.good + s.mid + s.bad
                  const isSel = selected?.key === s.key
                  return (
                    <tr
                      key={s.key}
                      className={`mastery__row ${isSel ? 'is-sel' : ''} ${total ? 'is-clickable' : ''}`}
                      onClick={() => total > 0 && setSelectedKey(s.key)}
                    >
                      <td>{s.label}</td>
                      <td className="table__q">{s.good}</td>
                      <td className="table__q">{s.mid}</td>
                      <td className="table__q">{s.bad}</td>
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
