import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useUIStore } from '@/store/uiStore'

import { bucketDays, computeMastery, type PeriodType } from './masteryStats'
import type { Grid } from './types'

const PERIODS: { key: PeriodType; label: string }[] = [
  { key: 'week', label: 'Haftalik' },
  { key: 'month', label: 'Oylik' },
  { key: 'quarter', label: 'Choraklik' },
  { key: 'year', label: 'Yillik' },
]

export function MasteryPanel({ grid }: { grid: Grid }) {
  const { t } = useTranslation()
  const { lang } = useUIStore()
  const [period, setPeriod] = useState<PeriodType>(() => {
    const raw = localStorage.getItem('afmd.mperiod')
    return raw === 'week' || raw === 'month' || raw === 'quarter' || raw === 'year' ? raw : 'quarter'
  })

  const changePeriod = (p: PeriodType) => {
    setPeriod(p)
    localStorage.setItem('afmd.mperiod', p)
  }

  const stats = useMemo(() => computeMastery(grid, bucketDays(grid.days, period), lang), [grid, period, lang])
  const graded = stats.filter((s) => s.good + s.mid + s.bad > 0)
  const latest = graded[graded.length - 1] ?? null
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
          <div className="mastery__kpis">
            <div className="mastery__kpi">
              <span>{t("O'zlashtirish")}</span>
              <b>{latest && latest.classPct !== null ? `${latest.classPct}%` : '—'}</b>
            </div>
            <div className="mastery__kpi mastery__kpi--good">
              <span>{t('Yaxshi')}</span>
              <b>{latest?.good ?? 0}</b>
            </div>
            <div className="mastery__kpi mastery__kpi--mid">
              <span>{t("O'rtacha")}</span>
              <b>{latest?.mid ?? 0}</b>
            </div>
            <div className="mastery__kpi mastery__kpi--bad">
              <span>{t('Past')}</span>
              <b>{latest?.bad ?? 0}</b>
            </div>
          </div>

          <div className="mastery__legend">
            <span className="mastery__lg"><i className="mastery__dot mastery__dot--good" />{t('Yaxshi')} (&ge;75%)</span>
            <span className="mastery__lg"><i className="mastery__dot mastery__dot--mid" />{t("O'rtacha")} (50–74%)</span>
            <span className="mastery__lg"><i className="mastery__dot mastery__dot--bad" />{t('Past')} (&lt;50%)</span>
          </div>

          <div className="mastery__scroll">
            <div className="mastery__chart">
              {stats.map((s) => {
                const total = s.good + s.mid + s.bad
                const h = (n: number) => (n / maxTotal) * 100
                return (
                  <div key={s.key} className="mastery__col">
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
                  </div>
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
                {stats.map((s) => (
                  <tr key={s.key}>
                    <td>{s.label}</td>
                    <td className="table__q">{s.good}</td>
                    <td className="table__q">{s.mid}</td>
                    <td className="table__q">{s.bad}</td>
                    <td className="table__q">{s.classPct !== null ? `${s.classPct}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
