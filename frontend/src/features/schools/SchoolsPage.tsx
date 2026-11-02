import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { Modal } from '@/components/Modal'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { downloadCsv } from '@/features/portal/csv'
import { errText, PageHead, Segmented } from '@/features/portal/ui'
import { IC } from '@/icons'
import { api } from '@/lib/api/client'
import { isAdmin, useAuth } from '@/lib/auth/AuthContext'

import {
  useSchools, useSchoolsMutation, useSchoolsOverview, useUnlinked, type ClassRow, type GroupRow, type StatsGroup, type UnlinkedName,
} from './api'
import { METRIC_CSV_HEAD, METRIC_HELP, MetricCells, MetricHeads, metricCsv, SchoolFormModal } from './shared'
import { useStatsHub } from './statsFilter'

/** Map free-text spellings (from journals/timetables) onto partner schools. */
function LinkModal({ rows, onClose }: { rows: UnlinkedName[]; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const { data: schools } = useSchools()
  const [choice, setChoice] = useState<Record<string, string>>({})
  const link = useSchoolsMutation(async (body: { variants: string[]; school?: number; new_name?: string }) =>
    (await api.post<{ classes: number; teachers_added: number }>('/schools/link/', body)).data)

  const apply = async (row: UnlinkedName) => {
    const pick = choice[row.text] ?? ''
    if (!pick) return toast(t('Maktabni tanlang'), 'error')
    try {
      const res = await link.mutateAsync(pick === 'new' ? { variants: row.variants } : { variants: row.variants, school: Number(pick) })
      toast(`${t('Biriktirildi')}: ${res.classes} ${t('ta sinf')}, ${res.teachers_added} ${t("ta o'qituvchi")}`)
    } catch (err) {
      toast(t(errText(err)), 'error')
    }
  }

  return (
    <Modal title={t('Maktab nomlarini moslashtirish')} onClose={onClose}
      footer={<button className="btn btn--primary" onClick={onClose}>{t('Tayyor')}</button>}>
      <p className="prose prose--note">
        {t("O'qituvchilar jurnal va jadvalda maktab nomini turlicha yozgan. Har bir nomni to'g'ri hamkor maktabga biriktiring — u maktabning muqobil nomi sifatida eslab qolinadi va keyingi yozuvlar avtomatik biriktiriladi.")}
      </p>
      {!rows.length && <p className="prose">✓ {t('Hamma nomlar biriktirilgan.')}</p>}
      <ul className="linklist">
        {rows.map((r) => (
          <li key={r.text} className="linklist__row">
            <div className="linklist__info">
              <b>{r.text}</b>
              {r.variants.length > 1 && <small>{t('yana')}: {r.variants.slice(1).join(' · ')}</small>}
              <small>{r.classes} {t('ta sinf')} · {r.slots} {t('ta jadval katagi')} · {r.teachers.join(', ')}</small>
            </div>
            <div className="linklist__acts">
              <select className="input input--sm" value={choice[r.text] ?? ''} onChange={(e) => setChoice({ ...choice, [r.text]: e.target.value })}>
                <option value="">{t('Maktabni tanlang…')}</option>
                {schools?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                <option value="new">+ {t('Shu nom bilan yangi maktab')}</option>
              </select>
              <button className="btn btn--sm btn--primary" disabled={link.isPending} onClick={() => apply(r)}>{t('Biriktirish')}</button>
            </div>
          </li>
        ))}
      </ul>
    </Modal>
  )
}

const GROUPS: { value: StatsGroup; label: string }[] = [
  { value: 'school', label: 'Maktab' },
  { value: 'teacher', label: "O'qituvchi" },
  { value: 'class', label: 'Sinf' },
]
const isGroup = (v: string | null): v is StatsGroup => v === 'school' || v === 'teacher' || v === 'class'

/** Statistika › Jurnal: every journal figure in one table, grouped by
 * school, teacher or class (?guruh=). A school row opens its teachers, a
 * teacher's row their classes — by narrowing the filter panel, so the rest
 * of Statistika follows — and a class row opens that class's journal. The
 * numbers are the ones Umumiy ko'rinish shows (schools/stats.py). */
export function SchoolsPage() {
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

  const setGroup = (next: StatsGroup, narrow: Record<string, string> = {}) => setParams((prev) => {
    const p = new URLSearchParams(prev)
    for (const [k, v] of Object.entries(narrow)) p.set(k, v)
    if (Object.keys(narrow).length) p.delete('class')
    p.set('guruh', next)
    return p
  }, { replace: true })

  const rows = data?.group === group ? data.rows : []
  const schoolRows = group === 'school' ? (rows as GroupRow[]) : []
  const teacherRows = group === 'teacher' ? (rows as GroupRow[]) : []
  const classRows = group === 'class' ? (rows as ClassRow[]) : []
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
                {schoolRows.map((r) => (
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
                {teacherRows.map((r) => (
                  <tr key={r.id} className="is-click" onClick={() => setGroup('class', { teacher: String(r.id) })}>
                    <td><b>{r.name}</b></td>
                    <td>{teacherSchools(r) || '—'}</td>
                    <td>{r.classes}</td>
                    {cells(r)}
                  </tr>
                ))}
                {classRows.map((r) => (
                  <tr key={r.class_id} className="is-click" title={t('Sinf jurnalini ochish')} onClick={() => navigate(`/journal?class=${r.class_id}`)}>
                    <td><b>{r.name}</b></td>
                    <td>{r.school || <i className="muted">{r.school_text || t('Biriktirilmagan')}</i>}</td>
                    <td>{r.teacher}</td>
                    {cells(r)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {creating && <SchoolFormModal initial={null} onClose={() => setCreating(false)} />}
      {linking && unlinked.data && <LinkModal rows={unlinked.data} onClose={() => setLinking(false)} />}
    </div>
  )
}
