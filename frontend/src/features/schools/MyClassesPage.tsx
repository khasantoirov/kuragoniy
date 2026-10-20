import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { Skeleton } from '@/components/Skeleton'
import { downloadCsv } from '@/features/portal/csv'
import { PageHead, Segmented, StatTile, StatusPill } from '@/features/portal/ui'
import { IC } from '@/icons'

import { CHORAK_OPTIONS, useMyClassesStats } from './api'
import { METRIC_CSV_HEAD, METRIC_HELP, MetricCells, MetricHeads, metricCsv, MetricPill } from './shared'
import { TrendPanels } from './TrendPanels'
import { useTrendView } from './trendView'

/** A teacher's own classes — the same figures administration sees for a
 * school (o'zlashtirish, sifat, davomat, trend, pupils needing
 * attention), limited to the classes this teacher teaches. */
export function MyClassesPage() {
  const { t } = useTranslation()
  const [chorak, setChorak] = useState('all')
  const view = useTrendView()
  const { data, isLoading } = useMyClassesStats(chorak, view.period)
  const totals = data?.totals
  const manySchools = (data?.schools.length ?? 0) > 1

  const exportClasses = () => data && downloadCsv('sinflarim',
    ['Sinf', 'Maktab', "O'quvchilar", 'Darslar', ...METRIC_CSV_HEAD, 'Platforma hisoblari', "Platforma o'rtachasi %"],
    data.classes.map((c) => [c.name, c.school || c.school_text, c.students, c.days, ...metricCsv(c), c.accounts, c.platform_avg ?? '']))

  return (
    <div>
      <PageHead title={t('Sinflarim statistikasi')} sub={t("O'zingiz dars beradigan sinflar: o'zlashtirish, sifat, davomat va natijalar.")}
        actions={<Segmented value={chorak} onChange={setChorak} options={CHORAK_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))} />} />

      {isLoading || !totals ? <Skeleton lines={3} /> : (
        <div className="stiles">
          <StatTile label={t('Sinflar')} value={data.classes.length} hint={manySchools ? `${data.schools.length} ${t('ta maktabda')}` : data.schools[0]?.name} />
          <StatTile label={t("O'quvchilar")} value={totals.students} hint={`${totals.accounts} ${t('tasi platformada')}`} />
          <StatTile label={t("O'rtacha baho")} value={totals.avg_mark?.toFixed(2) ?? '—'} hint={`${totals.marks} ${t('ta baho')} · ${totals.days} ${t('dars')}`} />
          <StatTile label={t("O'zlashtirish")} value={totals.uzlashtirish != null ? `${totals.uzlashtirish}%` : '—'} hint={totals.sifat != null ? `${t('sifat')} ${totals.sifat}%` : undefined} />
          <StatTile label={t('Davomat')} value={totals.attendance != null ? `${totals.attendance}%` : '—'}
            hint={`${t('sababsiz')} ${totals.abs_n} · ${t('kech')} ${totals.late}`} />
          <StatTile label={t("Platformadagi o'rtacha")} value={totals.platform_avg != null ? `${Math.round(totals.platform_avg)}%` : '—'} hint={t('test va masalalar')} />
        </div>
      )}

      {data && <TrendPanels trend={data.trend} composition={data.composition} view={view} />}

      {manySchools && data && (
        <section className="panel">
          <h3 className="panel__title">{t('Maktablar kesimida')}</h3>
          <div className="tablewrap">
            <table className="dtable">
              <thead><tr><th>{t('Maktab')}</th><th>{t('Sinf')}</th><th>{t("O'quvchi")}</th><MetricHeads /></tr></thead>
              <tbody>
                {data.schools.map((s) => (
                  <tr key={s.id}>
                    <td><b>{s.name || t("Maktab ko'rsatilmagan")}</b></td>
                    <td>{s.classes}</td>
                    <td>{s.students}</td>
                    <MetricCells m={s} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="panel">
        <div className="thead">
          <h3 className="panel__title">{t('Sinflar')}</h3>
          <p className="thead__hint">{t(METRIC_HELP)}</p>
          {data && data.classes.length > 0 && <button className="btn btn--sm btn--ghost" onClick={exportClasses}>{IC.download} CSV</button>}
        </div>
        {data?.classes.length ? (
          <div className="tablewrap">
            <table className="dtable">
              <thead><tr><th>{t('Sinf')}</th>{manySchools && <th>{t('Maktab')}</th>}<th>{t("O'quvchi")}</th><th>{t('Dars')}</th><MetricHeads /><th>{t('Sababsiz / kech')}</th><th>{t('Platforma')}</th></tr></thead>
              <tbody>
                {data.classes.map((c) => (
                  <tr key={c.class_id}>
                    <td><Link to="/journal"><b>{c.name}</b></Link></td>
                    {manySchools && <td>{c.school || c.school_text}</td>}
                    <td>{c.students}</td>
                    <td>{c.days}</td>
                    <MetricCells m={c} />
                    <td>{c.abs_n} / {c.late}</td>
                    <td>
                      <Link to="/students">{c.accounts}/{c.students}</Link>
                      {c.platform_avg != null && <> · <MetricPill value={c.platform_avg} good={85} fair={60} /></>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : !isLoading && (
          <p className="prose prose--note">{t("Hali sinf yo'q — «Jurnal» bo'limida sinf qo'shing.")}</p>
        )}
      </section>

      {data && data.attention.length > 0 && (
        <section className="panel panel--attention">
          <h3 className="panel__title">{t("E'tibor talab qiladigan o'quvchilar")} <span className="badge">{data.attention.length}</span></h3>
          <p className="prose prose--note">{t("O'rtacha bahosi «3»dan past yoki 3 va undan ko'p sababsiz qoldirgan o'quvchilar.")}</p>
          <div className="tablewrap">
            <table className="dtable">
              <thead><tr><th>{t("O'quvchi")}</th><th>{t('Sinf')}</th><th>{t("O'rtacha baho")}</th><th>{t('Sababsiz')}</th></tr></thead>
              <tbody>
                {data.attention.map((r) => (
                  <tr key={r.student_id}>
                    <td>{r.name}</td>
                    <td>{r.class_name}</td>
                    <td><MetricPill value={r.avg_mark} good={4} fair={2.5} suffix="" digits={2} /> <small className="muted">({r.marks})</small></td>
                    <td>{r.unexcused >= 3 ? <StatusPill tone="bad">{r.unexcused}</StatusPill> : r.unexcused}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
