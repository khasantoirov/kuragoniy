import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'

import { useConfirm } from '@/components/ConfirmProvider'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { ColumnChart } from '@/features/portal/ColumnChart'
import { downloadCsv } from '@/features/portal/csv'
import { errText, fmtDate, PageHead, Segmented, StatTile, StatusPill } from '@/features/portal/ui'
import { IC } from '@/icons'
import { api } from '@/lib/api/client'
import type { Paginated, User } from '@/lib/api/types'
import { isAdmin, useAuth } from '@/lib/auth/AuthContext'

import { CHORAK_OPTIONS, useSchool, useSchoolsMutation, useSchoolStats } from './api'
import { Presence } from '@/features/portal/Presence'
import { METRIC_CSV_HEAD, METRIC_HELP, MetricCells, MetricHeads, metricCsv, MetricPill, SchoolFormModal } from './shared'

export function SchoolDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const { user } = useAuth()
  const admin = isAdmin(user)
  const toast = useToast()
  const confirm = useConfirm()
  const [chorak, setChorak] = useState('all')
  const isNone = id === 'none'
  const { data: school } = useSchool(id)
  const { data, isLoading } = useSchoolStats(id, chorak)
  const [editing, setEditing] = useState(false)
  const [addTeacher, setAddTeacher] = useState('')
  const staff = useQuery({
    queryKey: ['schools', 'staff-options'],
    enabled: admin,
    queryFn: async () => (await api.get<Paginated<User>>('/accounts/users/')).data.results.filter((u) => u.role !== 'kuzatuvchi'),
  })
  const classTeacher = useSchoolsMutation(async ({ classId, teacher }: { classId: number; teacher: string }) =>
    api.post(`/schools/classes/${classId}/teacher/`, { teacher }))

  // Hand a class (roster, marks, student accounts) to another teacher.
  const onClassTeacher = async (classId: number, className: string, teacher: string) => {
    const name = staff.data?.find((u) => u.id === teacher)?.name ?? ''
    if (!(await confirm({ title: t("Sinfni boshqa o'qituvchiga o'tkazish"), text: `${className} → ${name}` }))) return
    try {
      await classTeacher.mutateAsync({ classId, teacher })
      toast(t("Sinf o'tkazildi"))
    } catch (err) {
      toast(t(errText(err)), 'error')
    }
  }
  const teacherAction = useSchoolsMutation(async ({ action, teacher }: { action: 'add-teacher' | 'remove-teacher'; teacher: string }) =>
    api.post(`/schools/${id}/${action}/`, { teacher }))

  const onTeacher = async (action: 'add-teacher' | 'remove-teacher', teacher: string, name?: string) => {
    if (action === 'remove-teacher' && !(await confirm({ title: t('Maktabdan chiqarish'), text: name, danger: true }))) return
    try {
      await teacherAction.mutateAsync({ action, teacher })
      setAddTeacher('')
    } catch (err) {
      toast(t(errText(err)), 'error')
    }
  }

  const title = isNone ? t('Biriktirilmagan sinflar') : school?.name ?? data?.school?.name ?? '…'
  const totals = data?.totals
  const assignedIds = new Set(school?.teachers?.map((x) => x.id))

  const exportClasses = () => data && downloadCsv(`${title}-sinflar`,
    ['Sinf', "O'qituvchi", "O'quvchilar", 'Darslar', ...METRIC_CSV_HEAD, 'Platforma hisoblari', "Platforma o'rtachasi %"],
    data.classes.map((c) => [c.name, c.teacher, c.students, c.days, ...metricCsv(c), c.accounts, c.platform_avg ?? '']))

  return (
    <div>
      <Link to="/manage/schools" className="backlink">← {t('Hamkor maktablar')}</Link>
      <PageHead title={title} sub={isNone ? t("Maktab nomi hech qaysi hamkor maktabga mos kelmagan sinflar — «Hamkor maktablar» sahifasidagi «Moslashtirish» orqali biriktiring.") : school?.district}
        actions={<>
          <Segmented value={chorak} onChange={setChorak} options={CHORAK_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))} />
          {admin && school && <button className="btn" onClick={() => setEditing(true)}>{IC.edit} {t('Tahrirlash')}</button>}
        </>} />

      {school && (
        <section className="panel">
          <ul className="kv kv--grid">
            <li><span>{t('Direktor')}</span><b>{school.director || '—'}</b></li>
            <li><span>{t('Telefon')}</span><b>{school.phone || '—'}</b></li>
            <li><span>{t('Manzil')}</span><b>{school.address || '—'}</b></li>
            <li><span>{t('Shartnoma')}</span><b>{school.contract_start ? `${fmtDate(school.contract_start)} — ${fmtDate(school.contract_end)}` : '—'}</b></li>
            <li><span>{t('Holati')}</span><b>{school.is_active ? <StatusPill tone="ok">{t('Faol')}</StatusPill> : <StatusPill tone="muted">{t('Faol emas')}</StatusPill>}</b></li>
            {school.aliases.length > 0 && <li><span>{t('Muqobil nomlar')}</span><b>{school.aliases.join(' · ')}</b></li>}
          </ul>
          {school.notes && <p className="prose prose--note">{school.notes}</p>}
        </section>
      )}

      {isLoading || !totals ? <Skeleton lines={3} /> : (
        <div className="stiles">
          <StatTile label={t("O'quvchilar")} value={totals.students} hint={`${totals.accounts} ${t('tasi platformada')}`} />
          <StatTile label={t("O'rtacha baho")} value={totals.avg_mark?.toFixed(2) ?? '—'} hint={`${totals.marks} ${t('ta baho')} · ${totals.days} ${t('dars')}`} />
          <StatTile label={t("O'zlashtirish")} value={totals.uzlashtirish != null ? `${totals.uzlashtirish}%` : '—'} />
          <StatTile label={t('Sifat')} value={totals.sifat != null ? `${totals.sifat}%` : '—'} />
          <StatTile label={t('Davomat')} value={totals.attendance != null ? `${totals.attendance}%` : '—'}
            hint={`${t('sababli')} ${totals.abs_s} · ${t('sababsiz')} ${totals.abs_n} · ${t('kech')} ${totals.late}`} />
          <StatTile label={t("Platformadagi o'rtacha")} value={totals.platform_avg != null ? `${Math.round(totals.platform_avg)}%` : '—'} hint={t('test va masalalar')} />
        </div>
      )}

      {data && data.trend.length > 0 && (
        <div className="cols2">
          <section className="panel">
            <h3 className="panel__title">{t("Oylik o'rtacha baho")}</h3>
            <ColumnChart ariaLabel={t("Oylik o'rtacha baho")} max={5} format={(v) => v.toFixed(1)}
              data={data.trend.filter((p) => p.avg_mark != null).map((p) => ({ label: p.month.slice(5) + '.' + p.month.slice(2, 4), value: p.avg_mark ?? 0, note: `${p.marks} ${t('ta baho')}` }))} />
          </section>
          <section className="panel">
            <h3 className="panel__title">{t('Oylik davomat, %')}</h3>
            <ColumnChart ariaLabel={t('Oylik davomat, %')} max={100} format={(v) => `${Math.round(v)}`}
              data={data.trend.filter((p) => p.attendance != null).map((p) => ({ label: p.month.slice(5) + '.' + p.month.slice(2, 4), value: p.attendance ?? 0 }))} />
          </section>
        </div>
      )}

      {!isNone && (
        <section className="panel">
          <h3 className="panel__title">{t("O'qituvchilar")}</h3>
          <div className="tablewrap">
            <table className="dtable">
              <thead><tr><th>{t("O'qituvchi")}</th><th>{t('Faollik')}</th><th>{t('Sinf')}</th><th>{t("O'quvchi")}</th><MetricHeads />{admin && <th />}</tr></thead>
              <tbody>
                {(school?.teachers ?? []).map((tch) => {
                  const m = data?.teachers.find((r) => r.id === tch.id)
                  return (
                    <tr key={tch.id}>
                      <td>
                        <b>{tch.name}</b>
                        {!tch.assigned && <> <StatusPill tone="mid">{t('faqat sinf orqali')}</StatusPill></>}
                        <br /><small className="muted">{tch.phone || tch.email}</small>
                      </td>
                      <td><Presence online={tch.online} lastSeen={tch.last_seen} /></td>
                      <td>{tch.classes}</td>
                      <td>{m?.students ?? 0}</td>
                      {m ? <MetricCells m={m} /> : <><td>—</td><td>—</td><td>—</td><td>—</td></>}
                      {admin && (
                        <td className="dtable__acts">
                          {tch.assigned
                            ? <button className="btn btn--sm btn--ghost" onClick={() => onTeacher('remove-teacher', tch.id, tch.name)}>{t('Chiqarish')}</button>
                            : <button className="btn btn--sm btn--ghost" onClick={() => onTeacher('add-teacher', tch.id)}>{t('Biriktirish')}</button>}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {admin && (
            <div className="row row--2" style={{ marginTop: 12 }}>
              <select className="input" value={addTeacher} onChange={(e) => setAddTeacher(e.target.value)}>
                <option value="">{t("O'qituvchi biriktirish…")}</option>
                {staff.data?.filter((u) => !assignedIds.has(u.id)).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              <button className="btn" disabled={!addTeacher || teacherAction.isPending} onClick={() => onTeacher('add-teacher', addTeacher)}>{t('Biriktirish')}</button>
            </div>
          )}
        </section>
      )}

      <section className="panel">
        <div className="thead">
          <h3 className="panel__title">{t('Sinflar')}</h3>
          <p className="thead__hint">{t(METRIC_HELP)}</p>
          {data && <button className="btn btn--sm btn--ghost" onClick={exportClasses}>{IC.download} CSV</button>}
        </div>
        {data?.classes.length ? (
          <div className="tablewrap">
            <table className="dtable">
              <thead><tr><th>{t('Sinf')}</th><th>{t("O'qituvchi")}</th><th>{t("O'quvchi")}</th><th>{t('Dars')}</th><MetricHeads /><th>{t('Sababsiz / kech')}</th><th>{t('Platforma')}</th></tr></thead>
              <tbody>
                {data.classes.map((c) => (
                  <tr key={c.class_id}>
                    <td><Link to={`/manage/database?class=${c.class_id}`}><b>{c.name}</b></Link>{isNone && <><br /><small className="muted">«{c.school_text}»</small></>}</td>
                    <td>
                      {admin && staff.data ? (
                        <select className="input input--sm" value={c.teacher_id} aria-label={t("O'qituvchi")}
                          disabled={classTeacher.isPending}
                          onChange={(e) => onClassTeacher(c.class_id, c.name, e.target.value)}>
                          {!staff.data.some((u) => u.id === c.teacher_id) && <option value={c.teacher_id}>{c.teacher}</option>}
                          {staff.data.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                      ) : c.teacher}
                    </td>
                    <td>{c.students}</td>
                    <td>{c.days}</td>
                    <MetricCells m={c} />
                    <td>{c.abs_n} / {c.late}</td>
                    <td>{c.accounts}/{c.students}{c.platform_avg != null && <> · <MetricPill value={c.platform_avg} good={85} fair={60} /></>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : !isLoading && <p className="prose prose--note">{t("Sinflar yo'q.")}</p>}
      </section>

      {data && data.attention.length > 0 && (
        <section className="panel panel--attention">
          <h3 className="panel__title">{t("E'tibor talab qiladigan o'quvchilar")} <span className="badge">{data.attention.length}</span></h3>
          <p className="prose prose--note">{t("O'rtacha bahosi «3»dan past yoki 3 va undan ko'p sababsiz qoldirgan o'quvchilar.")}</p>
          <div className="tablewrap">
            <table className="dtable">
              <thead><tr><th>{t("O'quvchi")}</th><th>{t('Sinf')}</th><th>{t("O'qituvchi")}</th><th>{t("O'rtacha baho")}</th><th>{t('Sababsiz')}</th></tr></thead>
              <tbody>
                {data.attention.map((r) => (
                  <tr key={r.student_id}>
                    <td>{r.name}</td>
                    <td>{r.class_name}</td>
                    <td>{r.teacher}</td>
                    <td><MetricPill value={r.avg_mark} good={4} fair={2.5} suffix="" digits={2} /> <small className="muted">({r.marks})</small></td>
                    <td>{r.unexcused >= 3 ? <StatusPill tone="bad">{r.unexcused}</StatusPill> : r.unexcused}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {editing && school && <SchoolFormModal initial={school} onClose={() => setEditing(false)} />}
    </div>
  )
}
