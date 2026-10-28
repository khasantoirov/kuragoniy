import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { Modal } from '@/components/Modal'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { downloadCsv } from '@/features/portal/csv'
import { errText, PageHead, Segmented, StatTile } from '@/features/portal/ui'
import { IC } from '@/icons'
import { api } from '@/lib/api/client'
import { isAdmin, useAuth } from '@/lib/auth/AuthContext'

import { CHORAK_OPTIONS, useSchools, useSchoolsMutation, useSchoolsOverview, useUnlinked, type UnlinkedName } from './api'
import { METRIC_CSV_HEAD, METRIC_HELP, MetricCells, MetricHeads, metricCsv, SchoolFormModal } from './shared'
import { useStatsHub } from './statsFilter'
import { TrendPanels } from './TrendPanels'
import { useTrendView } from './trendView'

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

export function SchoolsPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const admin = isAdmin(user)
  const navigate = useNavigate()
  const hub = useStatsHub()
  const [ownChorak, setChorak] = useState('all')
  // inside Statistika the one filter panel decides
  const chorak = hub ? hub.filter.chorak : ownChorak
  const scope = hub ? { school: hub.filter.school, teacher: hub.filter.teacher, class: hub.filter.cls } : {}
  const view = useTrendView()
  const { data, isLoading } = useSchoolsOverview(chorak, view.period, scope)
  const unlinked = useUnlinked()
  const [creating, setCreating] = useState(false)
  const [linking, setLinking] = useState(false)
  const totals = data?.totals

  const exportCsv = () => data && downloadCsv(`hamkor-maktablar-${chorak}`,
    ['Maktab', "O'qituvchilar", 'Sinflar', "O'quvchilar", 'Darslar', ...METRIC_CSV_HEAD, 'Platforma hisoblari'],
    data.schools.map((s) => [s.id === 'none' ? 'Biriktirilmagan' : s.name, s.teachers ?? '', s.classes, s.students, s.days, ...metricCsv(s), s.accounts]))

  return (
    <div>
      <PageHead title={t('Hamkor maktablar')}
        sub={t("Maktablar, ularga biriktirilgan o'qituvchilar va sinflar — o'zlashtirish va davomat bo'yicha.")}
        actions={<>
          {admin && <button className="btn btn--primary" onClick={() => setCreating(true)}>+ {t('Maktab')}</button>}
        </>} />

      {!!unlinked.data?.length && (
        <div className="notice">
          <span>⚠️ {unlinked.data.length} {t("ta maktab nomi hech qaysi hamkor maktabga biriktirilmagan — bu sinflar statistikada «Biriktirilmagan» qatoriga tushadi.")}</span>
          {admin && <button className="btn btn--sm" onClick={() => setLinking(true)}>{t('Moslashtirish')}</button>}
        </div>
      )}

      {!hub && (
        <div className="filters">
          <Segmented value={chorak} onChange={setChorak} options={CHORAK_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))} />
        </div>
      )}

      {isLoading || !totals ? <Skeleton lines={4} /> : (
        <div className="stiles">
          <StatTile label={t('Hamkor maktablar')} value={totals.schools} />
          <StatTile label={t("O'qituvchilar")} value={totals.teachers} hint={`${totals.classes} ${t('ta sinf')}`} />
          <StatTile label={t("O'quvchilar")} value={totals.students} hint={`${totals.accounts} ${t('tasi platformada')}`} />
          <StatTile label={t("O'rtacha baho")} value={totals.avg_mark?.toFixed(2) ?? '—'} hint={`${totals.marks} ${t('ta baho')}`} />
          <StatTile label={t("O'zlashtirish")} value={totals.uzlashtirish != null ? `${totals.uzlashtirish}%` : '—'} />
          <StatTile label={t('Davomat')} value={totals.attendance != null ? `${totals.attendance}%` : '—'}
            hint={`${t('sababsiz')} ${totals.abs_n} · ${t('kech')} ${totals.late}`}
            tone={totals.attendance == null ? undefined : totals.attendance >= 95 ? 'ok' : totals.attendance >= 85 ? 'warn' : 'bad'} />
        </div>
      )}

      {data && <TrendPanels trend={data.trend} composition={data.composition} view={view} />}

      <section className="panel">
        <div className="thead">
          <h3 className="panel__title">{t('Maktablar kesimida')}</h3>
          <p className="thead__hint">{t(METRIC_HELP)}</p>
          {data && <button className="btn btn--sm btn--ghost" onClick={exportCsv}>{IC.download} CSV</button>}
        </div>
        {isLoading ? <Skeleton lines={5} /> : (
          <div className="tablewrap">
            <table className="dtable">
              <thead>
                <tr>
                  <th>{t('Maktab')}</th><th>{t("O'qituvchi")}</th><th>{t('Sinf')}</th><th>{t("O'quvchi")}</th><th>{t('Dars')}</th>
                  <MetricHeads />
                  <th>{t('Sababsiz / kech')}</th>
                </tr>
              </thead>
              <tbody>
                {data?.schools.map((s) => (
                  <tr key={s.id} className="is-click" onClick={() => navigate(`/manage/schools/${s.id}`)}>
                    <td>{s.id === 'none' ? <i className="muted">{t('Biriktirilmagan sinflar')}</i> : <b>{s.name}</b>}</td>
                    <td>{s.teachers ?? '—'}</td>
                    <td>{s.classes}</td>
                    <td>{s.students}</td>
                    <td>{s.days}</td>
                    <MetricCells m={s} />
                    <td>{s.abs_n} / {s.late}</td>
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
