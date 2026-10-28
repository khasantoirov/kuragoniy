import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Skeleton } from '@/components/Skeleton'
import { ColumnChart } from '@/features/portal/ColumnChart'
import { downloadCsv } from '@/features/portal/csv'
import { fmtDate, PageHead, PercentPill, Segmented, Stars, StatTile } from '@/features/portal/ui'
import { useStatsHub } from '@/features/schools/statsFilter'
import { IC } from '@/icons'

import {
  PERIOD_OPTIONS,
  useAnalytics,
  useTeacherClasses,
  useTeachersList,
  type ClassRow,
  type LessonReport,
  type LessonStatRow,
  type Overview,
  type TopStudent,
  type TopTeacher,
} from './api'

export type AwardTarget = { id: string; name: string; kind: 'student_of_month' | 'best_lesson' | 'top_teacher' }

function TableHead({ title, onCsv, hint }: { title: string; onCsv?: () => void; hint?: string }) {
  const { t } = useTranslation()
  return (
    <div className="thead">
      <h3 className="panel__title">{title}</h3>
      {hint && <p className="thead__hint">{hint}</p>}
      {onCsv && <button className="btn btn--sm btn--ghost" onClick={onCsv}>{IC.download} {t('CSV')}</button>}
    </div>
  )
}

/** One dashboard, two scopes: a teacher sees their own classes, the
 * administration (incl. Kuzatuvchi) sees everyone and can filter. */
export function AnalyticsDashboard({ oversight, canAward, onAward, title, sub }: {
  oversight: boolean
  canAward?: boolean
  onAward?: (target: AwardTarget) => void
  title: string
  sub?: string
}) {
  const { t } = useTranslation()
  const [period, setPeriod] = useState('month')
  const hub = useStatsHub()
  const [ownTeacher, setTeacher] = useState('')
  const [grade, setGrade] = useState('')
  const [ownClass, setClassId] = useState('')
  // inside Statistika the one filter panel decides the teacher and class
  const teacher = hub ? hub.filter.teacher : ownTeacher
  const classId = hub ? hub.filter.cls : ownClass
  const teachers = useTeachersList(oversight)
  const classes = useTeacherClasses(oversight ? teacher || undefined : undefined)
  const filters = { period, teacher: oversight ? teacher : '', grade, class: classId, school: hub?.filter.school ?? '' }

  const overview = useAnalytics<Overview>('overview', filters)
  const students = useAnalytics<TopStudent[]>('top-students', filters)
  const teachersRank = useAnalytics<TopTeacher[]>('top-teachers', { period }, oversight)
  const reports = useAnalytics<LessonReport[]>('best-reports', { period })
  const classRows = useAnalytics<ClassRow[]>('classes', filters)
  const lessons = useAnalytics<LessonStatRow[]>('lessons', filters)
  const o = overview.data

  return (
    <div>
      <PageHead title={title} sub={sub} />
      <div className="filters">
        <Segmented value={period} onChange={setPeriod} options={PERIOD_OPTIONS.map((p) => ({ ...p, label: t(p.label) }))} />
        {oversight && !hub && (
          <select className="input input--sm" value={teacher} onChange={(e) => { setTeacher(e.target.value); setClassId('') }} aria-label={t("O'qituvchi")}>
            <option value="">{t("Barcha o'qituvchilar")}</option>
            {teachers.data?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        )}
        {!hub && (
          <select className="input input--sm" value={classId} onChange={(e) => setClassId(e.target.value)} aria-label={t('Sinf')}>
            <option value="">{t('Barcha sinflar')}</option>
            {classes.data?.map((c) => <option key={c.id} value={c.id}>{c.name}{oversight ? ` (${c.teacher_name})` : ''}</option>)}
          </select>
        )}
        <select className="input input--sm" value={grade} onChange={(e) => setGrade(e.target.value)} aria-label={t('Sinf darajasi')}>
          <option value="">{t('Barcha sinf darajalari')}</option>
          {[5, 6, 7, 8, 9, 10, 11].map((g) => <option key={g} value={g}>{g}-{t('sinf')}</option>)}
        </select>
      </div>

      {overview.isLoading || !o ? <Skeleton lines={3} /> : (
        <div className="stiles">
          <StatTile label={t("O'quvchilar")} value={o.students} hint={`${o.active_students} ${t('faol')}`} />
          <StatTile label={t("O'rtacha natija")} value={o.avg_percent != null ? `${Math.round(o.avg_percent)}%` : '—'} hint={`${o.attempts} ${t('urinish')}`} />
          <StatTile label={t('Uy vazifasi bajarilishi')} value={o.completion_rate != null ? `${Math.round(o.completion_rate)}%` : '—'}
            hint={`${o.homework_done}/${o.homework_expected}`} tone={o.completion_rate == null ? undefined : o.completion_rate >= 70 ? 'ok' : o.completion_rate >= 40 ? 'warn' : 'bad'} />
          <StatTile label={t('Dars hisobotlari')} value={o.reports} hint={o.avg_rating != null ? `${t("o'rtacha baho")} ${o.avg_rating}/5` : undefined} />
          <StatTile label={t('Darsga tayyorgarlik')} value={o.readiness_avg != null ? `${Math.round(o.readiness_avg)}%` : '—'} hint={`${o.readiness_checks} ${t('tekshiruv')}`} />
          <StatTile label={t("Materiali tayyor darslar")} value={`${o.with_material}/${o.lessons}`} />
        </div>
      )}

      {o && o.trend.length > 1 && (
        <section className="panel">
          <TableHead title={t("Haftalik o'rtacha natija, %")} hint={t("So'nggi 8 hafta, uy vazifasi va mashqlar bo'yicha")} />
          <ColumnChart ariaLabel={t("Haftalik o'rtacha natija, %")} max={100}
            data={o.trend.map((w) => ({ label: fmtDate(w.week).slice(0, 5), value: w.avg_percent, note: `${w.attempts} ${t('urinish')}` }))} />
        </section>
      )}

      <section className="panel">
        <TableHead title={`🏆 ${t("Eng yaxshi o'quvchilar")}`}
          hint={t("Reyting = 60% sifat (ishonchlilikka tuzatilgan o'rtacha) + 25% uy vazifasi bajarilishi + 15% faollik")}
          onCsv={students.data?.length ? () => downloadCsv('eng-yaxshi-oquvchilar', ['#', t('Ism'), t('Sinf'), t("O'rtacha %"), t('Bajarilish %'), t('Urinishlar'), t('Reyting')],
            students.data!.map((s) => [s.rank, s.name, s.class_name, s.avg_percent, s.completion_rate ?? '', s.attempts, s.score])) : undefined} />
        {students.isLoading ? <Skeleton lines={4} /> : students.data?.length ? (
          <div className="tablewrap">
            <table className="dtable">
              <thead><tr><th>#</th><th>{t('Ism')}</th><th>{t('Sinf')}</th><th>{t("O'rtacha")}</th><th>{t('Bajarilish')}</th><th>{t('Urinish')}</th><th>{t('Reyting')}</th>{canAward && <th />}</tr></thead>
              <tbody>
                {students.data.map((s) => (
                  <tr key={s.user} className={s.rank <= 3 ? 'is-top' : ''}>
                    <td>{s.rank <= 3 ? ['🥇', '🥈', '🥉'][s.rank - 1] : s.rank}</td>
                    <td>{s.name}</td>
                    <td>{s.class_name}</td>
                    <td><PercentPill value={s.avg_percent} /></td>
                    <td>{s.completion_rate != null ? `${Math.round(s.completion_rate)}%` : '—'}</td>
                    <td>{s.attempts}</td>
                    <td><b>{s.score}</b></td>
                    {canAward && <td><button className="btn btn--sm btn--ghost" onClick={() => onAward?.({ id: s.user, name: s.name, kind: 'student_of_month' })}>🏆 {t("Rag'batlantirish")}</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="prose prose--note">{t("Bu davrda natijalar yo'q.")}</p>}
      </section>

      {oversight && (
        <section className="panel">
          <TableHead title={`⭐ ${t("Eng yaxshi dars o'tgan o'qituvchilar")}`}
            hint={t("Reyting = 35% hisobotlar bahosi + 25% o'quvchilar natijasi + 20% darsga tayyorgarlik + 20% uy vazifasi bajarilishi")}
            onCsv={teachersRank.data?.length ? () => downloadCsv('eng-yaxshi-oqituvchilar', ['#', t('Ism'), t('Hisobotlar'), t('Baho'), t('Tayyorgarlik %'), t("O'quvchilar %"), t('Bajarilish %'), t('Reyting')],
              teachersRank.data!.map((x) => [x.rank, x.name, x.reports, x.avg_rating ?? '', x.readiness_avg ?? '', x.class_avg_percent ?? '', x.completion_rate ?? '', x.score])) : undefined} />
          {teachersRank.isLoading ? <Skeleton lines={4} /> : teachersRank.data?.length ? (
            <div className="tablewrap">
              <table className="dtable">
                <thead><tr><th>#</th><th>{t('Ism')}</th><th>{t('Hisobot')}</th><th>{t('Baho')}</th><th>{t('Tayyorgarlik')}</th><th>{t("O'quvchilar")}</th><th>{t('Bajarilish')}</th><th>{t('Reyting')}</th>{canAward && <th />}</tr></thead>
                <tbody>
                  {teachersRank.data.map((x) => (
                    <tr key={x.user} className={x.rank <= 3 ? 'is-top' : ''}>
                      <td>{x.rank <= 3 ? ['🥇', '🥈', '🥉'][x.rank - 1] : x.rank}</td>
                      <td>{x.name}</td>
                      <td>{x.reports}</td>
                      <td>{x.avg_rating != null ? <Stars value={Math.round(x.avg_rating)} size={14} /> : '—'}</td>
                      <td><PercentPill value={x.readiness_avg} /></td>
                      <td><PercentPill value={x.class_avg_percent} /></td>
                      <td>{x.completion_rate != null ? `${Math.round(x.completion_rate)}%` : '—'}</td>
                      <td><b>{x.score}</b></td>
                      {canAward && <td><button className="btn btn--sm btn--ghost" onClick={() => onAward?.({ id: x.user, name: x.name, kind: 'best_lesson' })}>🏆 {t("Rag'batlantirish")}</button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="prose prose--note">{t("Bu davrda ma'lumot yo'q.")}</p>}
        </section>
      )}

      {reports.data && reports.data.length > 0 && (
        <section className="panel">
          <TableHead title={t('Eng yuqori baholangan darslar')} />
          <ul className="tlist">
            {reports.data.map((r) => (
              <li key={r.id} className="tlist__row">
                <span className="tlist__main">{r.topic} <span className="muted">— {r.teacher_name}, {r.class_name}</span></span>
                <span className="tlist__side">{fmtDate(r.date)} {r.rating && <Stars value={r.rating} size={14} />}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="cols2">
        <section className="panel">
          <TableHead title={t('Sinflar taqqoslash')} onCsv={classRows.data?.length ? () => downloadCsv('sinflar', [t('Sinf'), t('Maktab'), t("O'qituvchi"), t("O'quvchilar"), t('Faol'), t('Urinishlar'), t("O'rtacha %")],
            classRows.data!.map((c) => [c.name, c.school, c.teacher, c.students, c.active_students, c.attempts, c.avg_percent ?? ''])) : undefined} />
          {classRows.data?.length ? (
            <div className="tablewrap">
              <table className="dtable">
                <thead><tr><th>{t('Sinf')}</th>{oversight && <th>{t("O'qituvchi")}</th>}<th>{t("O'quvchi")}</th><th>{t('Faol')}</th><th>{t("O'rtacha")}</th></tr></thead>
                <tbody>
                  {classRows.data.map((c) => (
                    <tr key={c.class_id}><td>{c.name}</td>{oversight && <td>{c.teacher}</td>}<td>{c.students}</td><td>{c.active_students}</td><td><PercentPill value={c.avg_percent} /></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="prose prose--note">{t("Ma'lumot yo'q.")}</p>}
        </section>
        <section className="panel">
          <TableHead title={t('Darslar: eng qiyinlari')} hint={t("Past natija — video yoki nazariyani yaxshilash kerakligi belgisi")} />
          {lessons.data?.length ? (
            <div className="tablewrap">
              <table className="dtable">
                <thead><tr><th>{t('Dars')}</th><th>{t("O'quvchi")}</th><th>{t("O'rtacha")}</th></tr></thead>
                <tbody>
                  {lessons.data.slice(0, 12).map((l) => (
                    <tr key={l.lesson}><td>{l.grade}-{t('sinf')}: {l.title}</td><td>{l.students}</td><td><PercentPill value={l.avg_percent} /></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="prose prose--note">{t("Ma'lumot yo'q.")}</p>}
        </section>
      </div>
    </div>
  )
}
