import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { Skeleton } from '@/components/Skeleton'
import { downloadCsv } from '@/features/portal/csv'
import { PageHead, Segmented } from '@/features/portal/ui'
import { IC } from '@/icons'
import { EditGrantsPanel } from '@/features/journal/EditGrantsPanel'
import { useGrants } from '@/features/journal/api'
import { TeacherList } from '@/features/journal/TeacherList'
import { isAdmin, isAdminInView, useAuth } from '@/lib/auth/AuthContext'
import { useUIStore } from '@/store/uiStore'

import { useSchoolsOverview, useUnlinked, type ClassRow, type GroupRow, type StatsGroup } from './api'
import { LinkNamesModal } from './LinkNamesModal'
import { METRIC_CSV_HEAD, METRIC_HELP, MetricCells, MetricHeads, metricCsv, SchoolFormModal } from './shared'
import { useStatsHub } from './statsFilter'

type Part = 'stats' | 'oqituvchilar' | 'ruxsatlar'

/** Statistika › Jurnal: the figures, and — for the administration — every
 * teacher's journal and the permissions for past days (moved here from
 * the Jurnal page; ?qism= picks the part). */
export function SchoolsPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const viewMode = useUIStore((s) => s.viewMode)
  const admin = isAdminInView(user, viewMode)
  const [params, setParams] = useSearchParams()
  const raw = params.get('qism')
  const part: Part = admin && (raw === 'oqituvchilar' || raw === 'ruxsatlar') ? raw : 'stats'
  const waiting = useGrants('pending', admin).data?.length ?? 0
  const pick = (p: Part) => setParams((prev) => {
    const next = new URLSearchParams(prev)
    if (p === 'stats') next.delete('qism')
    else next.set('qism', p)
    return next
  }, { replace: true })

  return (
    <div>
      {admin && (
        <div className="chips" style={{ marginBottom: 14 }}>
          <button className={`chip ${part === 'stats' ? 'is-on' : ''}`} onClick={() => pick('stats')}>
            {IC.chart} {t("Ko'rsatkichlar")}
          </button>
          <button className={`chip ${part === 'oqituvchilar' ? 'is-on' : ''}`} onClick={() => pick('oqituvchilar')}>
            {IC.users} {t("O'qituvchilar jurnali")}
          </button>
          <button className={`chip ${part === 'ruxsatlar' ? 'is-on' : ''}`} onClick={() => pick('ruxsatlar')}>
            {IC.lock} {t('Ruxsatlar')} {waiting > 0 && <span className="chip__count">{waiting}</span>}
          </button>
        </div>
      )}
      {part === 'oqituvchilar' ? <TeacherList /> : part === 'ruxsatlar' ? <EditGrantsPanel /> : <JournalFigures />}
    </div>
  )
}

const GROUPS: { value: StatsGroup; label: string }[] = [
  { value: 'school', label: 'Maktab' },
  { value: 'teacher', label: "O'qituvchi" },
  { value: 'class', label: 'Sinf' },
]
const isGroup = (v: string | null): v is StatsGroup => v === 'school' || v === 'teacher' || v === 'class'
const EMPTY_UNIT: Record<StatsGroup, string> = { school: 'ta maktabda', teacher: "ta o'qituvchida", class: 'ta sinfda' }

/** Statistika › Jurnal: every journal figure in one table, grouped by
 * school, teacher or class (?guruh=). A school row opens its teachers, a
 * teacher's row their classes — by narrowing the filter panel, so the rest
 * of Statistika follows — and a class row opens that class's journal. The
 * numbers are the ones Umumiy ko'rinish shows (schools/stats.py). */
function JournalFigures() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const admin = isAdmin(user)
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const f = useStatsHub()?.filter
  // unless picked, one level below what the filter panel narrows to
  const raw = params.get('guruh')
  const group: StatsGroup = isGroup(raw) ? raw : f?.teacher || f?.cls ? 'class' : f?.school ? 'teacher' : 'school'
  const scope = f ? { school: f.school, teacher: f.teacher, class: f.cls } : {}
  const { data, isLoading } = useSchoolsOverview(f?.chorak ?? 'all', 'month', scope, group)
  const unlinked = useUnlinked()
  const [creating, setCreating] = useState(false)
  const [linking, setLinking] = useState(false)
  // rows with neither a lesson day nor a mark yet wait behind one line
  const [showEmpty, setShowEmpty] = useState(false)

  const setGroup =(next: StatsGroup, narrow: Record<string, string> = {}) => setParams((prev) => {
    const p = new URLSearchParams(prev)
    for (const [k, v] of Object.entries(narrow)) p.set(k, v)
    if (Object.keys(narrow).length) p.delete('class')
    p.set('guruh', next)
    return p
  }, { replace: true })

  const rows = data?.group === group ? data.rows : []
  const hasData = (m: GroupRow | ClassRow) => m.marks > 0 || m.days > 0
  const emptyCount = rows.filter((m) => !hasData(m)).length
  const shown = showEmpty ? rows : rows.filter(hasData)
  const schoolRows = group === 'school' ? (rows as GroupRow[]) : []
  const teacherRows = group === 'teacher' ? (rows as GroupRow[]) : []
  const classRows = group === 'class' ? (rows as ClassRow[]) : []
  const shownSchools = group === 'school' ? (shown as GroupRow[]) : []
  const shownTeachers = group === 'teacher' ? (shown as GroupRow[]) : []
  const shownClasses = group === 'class' ? (shown as ClassRow[]) : []
  const schoolName = (r: GroupRow) => (r.id === 'none' ? t('Biriktirilmagan sinflar') : r.name)
  const teacherSchools = (r: GroupRow) => [...(r.schools ?? []), ...(r.unlinked ? [t('Biriktirilmagan')] : [])].join(', ')
  const period = f?.chorak ?? 'all'

  const exportCsv = () => {
    const tail = (m: GroupRow | ClassRow) => [m.students, m.days, ...metricCsv(m), m.abs_n, m.late]
    const head = ["O'quvchilar", 'Darslar', ...METRIC_CSV_HEAD, 'Sababsiz', 'Kech']
    if (group === 'school') downloadCsv(`jurnal-maktablar-${period}`, ['Maktab', "O'qituvchilar", 'Sinflar', ...head],
      schoolRows.map((r) => [schoolName(r), r.teachers ?? '', r.classes, ...tail(r)]))
    else if (group === 'teacher') downloadCsv(`jurnal-oqituvchilar-${period}`, ["O'qituvchi", 'Maktab', 'Sinflar', ...head],
      teacherRows.map((r) => [r.name, teacherSchools(r), r.classes, ...tail(r)]))
    else downloadCsv(`jurnal-sinflar-${period}`, ['Sinf', 'Maktab', "O'qituvchi", ...head],
      classRows.map((r) => [r.name, r.school || r.school_text, r.teacher, ...tail(r)]))
  }

  const cells = (m: GroupRow | ClassRow): ReactNode => (
    <>
      <td>{m.students}</td>
      <td>{m.days}</td>
      <MetricCells m={m} />
      <td>{m.abs_n} / {m.late}</td>
    </>
  )

  return (
    <div>
      <PageHead title={t('Jurnal')}
        sub={t("O'zlashtirish va davomat — maktab, o'qituvchi yoki sinf kesimida. Qatorni bosing — ichkariga kirasiz.")}
        actions={<>
          {admin && <button className="btn btn--primary" onClick={() => setCreating(true)}>+ {t('Maktab')}</button>}
        </>} />

      {!!unlinked.data?.length && (
        <div className="notice">
          <span>⚠️ {unlinked.data.length} {t("ta maktab nomi hech qaysi hamkor maktabga biriktirilmagan — bu sinflar statistikada «Biriktirilmagan» qatoriga tushadi.")}</span>
          {admin && <button className="btn btn--sm" onClick={() => setLinking(true)}>{t('Moslashtirish')}</button>}
        </div>
      )}

      <section className="panel">
        <div className="thead">
          <Segmented value={group} onChange={(g) => setGroup(g)} options={GROUPS.map((g) => ({ ...g, label: t(g.label) }))} />
          <p className="thead__hint">{t(METRIC_HELP)}</p>
          {data && <button className="btn btn--sm btn--ghost" onClick={exportCsv}>{IC.download} CSV</button>}
        </div>
        {isLoading && !data ? <Skeleton lines={5} /> : (
          <div className="tablewrap">
            <table className="dtable">
              <thead>
                <tr>
                  {group === 'school' && <><th>{t('Maktab')}</th><th>{t("O'qituvchi")}</th><th>{t('Sinf')}</th></>}
                  {group === 'teacher' && <><th>{t("O'qituvchi")}</th><th>{t('Maktab')}</th><th>{t('Sinf')}</th></>}
                  {group === 'class' && <><th>{t('Sinf')}</th><th>{t('Maktab')}</th><th>{t("O'qituvchi")}</th></>}
                  <th>{t("O'quvchi")}</th><th>{t('Dars')}</th>
                  <MetricHeads />
                  <th>{t('Sababsiz / kech')}</th>
                </tr>
              </thead>
              <tbody>
                {shownSchools.map((r) => (
                  <tr key={r.id} className="is-click" onClick={() => setGroup('teacher', { school: String(r.id) })}>
                    <td>
                      {r.id === 'none' ? <i className="muted">{schoolName(r)}</i> : <b>{r.name}</b>}{' '}
                      <button type="button" className="linklike" title={t('Maktab sahifasi')} aria-label={t('Maktab sahifasi')}
                        onClick={(e) => { e.stopPropagation(); navigate(`/manage/schools/${r.id}`) }}>↗</button>
                    </td>
                    <td>{r.teachers ?? '—'}</td>
                    <td>{r.classes}</td>
                    {cells(r)}
                  </tr>
                ))}
                {shownTeachers.map((r) => (
                  <tr key={r.id} className="is-click" onClick={() => setGroup('class', { teacher: String(r.id) })}>
                    <td><b>{r.name}</b></td>
                    <td>{teacherSchools(r) || '—'}</td>
                    <td>{r.classes}</td>
                    {cells(r)}
                  </tr>
                ))}
                {shownClasses.map((r) => (
                  <tr key={r.class_id} className="is-click" title={t('Sinf jurnalini ochish')} onClick={() => navigate(`/journal?class=${r.class_id}`)}>
                    <td><b>{r.name}</b></td>
                    <td>{r.school || <i className="muted">{r.school_text || t('Biriktirilmagan')}</i>}</td>
                    <td>{r.teacher}</td>
                    {cells(r)}
                  </tr>
                ))}
                {emptyCount > 0 && (
                  <tr className="dtable__more">
                    <td colSpan={10}>
                      <span className="muted">{emptyCount} {t(EMPTY_UNIT[group])} {t("hali dars ham, baho ham yo'q")}.</span>{' '}
                      <button type="button" className="linklike" onClick={() => setShowEmpty(!showEmpty)}>
                        {showEmpty ? t('Yashirish') : t('Ko‘rsatish')}
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {creating && <SchoolFormModal initial={null} onClose={() => setCreating(false)} />}
      {linking && unlinked.data && <LinkNamesModal rows={unlinked.data} onClose={() => setLinking(false)} />}
    </div>
  )
}
