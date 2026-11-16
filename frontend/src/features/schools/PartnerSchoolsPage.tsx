import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { Skeleton } from '@/components/Skeleton'
import { fmtDate, PageHead, StatusPill } from '@/features/portal/ui'
import { IC } from '@/icons'
import { isAdmin, useAuth } from '@/lib/auth/AuthContext'

import { type School, useSchools, useUnlinked } from './api'
import { LinkNamesModal } from './LinkNamesModal'
import { SchoolFormModal } from './shared'

/** Hamkor maktablar — the list the administration keeps. Teachers pick
 * from it in the journal and the timetable instead of typing a name, so
 * one school is one row everywhere; spellings typed before are matched
 * onto it here (Moslashtirish). A row opens the school's page. */
export function PartnerSchoolsPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const admin = isAdmin(user)
  const navigate = useNavigate()
  const { data: schools, isLoading } = useSchools()
  const unlinked = useUnlinked()
  const [editing, setEditing] = useState<Partial<School> | null>(null)
  const [linking, setLinking] = useState(false)
  const [showOff, setShowOff] = useState(false)
  const [q, setQ] = useState('')

  const all = schools ?? []
  const off = all.filter((s) => !s.is_active).length
  const needle = q.trim().toLowerCase()
  const rows = all
    .filter((s) => showOff || s.is_active)
    .filter((s) => !needle || [s.name, s.district, s.director, ...(s.aliases ?? [])].some((v) => (v || '').toLowerCase().includes(needle)))

  const contract = (s: School) =>
    s.contract_start || s.contract_end ? `${s.contract_start ? fmtDate(s.contract_start) : '…'} – ${s.contract_end ? fmtDate(s.contract_end) : '…'}` : '—'

  return (
    <div>
      <PageHead
        title={t('Hamkor maktablar')}
        sub={t("Ma'muriyat yuritadigan ro'yxat: o'qituvchilar jurnal va jadvalda maktabni shu ro'yxatdan tanlaydi.")}
        actions={admin ? <button className="btn btn--primary" onClick={() => setEditing({})}>+ {t('Maktab')}</button> : undefined}
      />

      {!!unlinked.data?.length && (
        <div className="notice">
          <span>⚠️ {unlinked.data.length} {t("ta maktab nomi jurnal yoki jadvalda qo'lda yozilgan va ro'yxatdagi maktabga biriktirilmagan.")}</span>
          {admin && <button className="btn btn--sm" onClick={() => setLinking(true)}>{t('Moslashtirish')}</button>}
        </div>
      )}

      <section className="panel">
        <div className="thead">
          <input className="input input--sm psch__search" type="search" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={t('Maktab, tuman yoki direktor')} aria-label={t('Qidirish')} />
          {off > 0 && (
            <label className="psch__off">
              <input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} /> {t('Faol emaslarini ham')} ({off})
            </label>
          )}
        </div>
        {isLoading ? <Skeleton lines={5} /> : !rows.length ? (
          <p className="prose prose--note">{all.length ? t('Hech narsa topilmadi.') : t("Hali hamkor maktab qo'shilmagan.")}</p>
        ) : (
          <div className="tablewrap">
            <table className="dtable">
              <thead>
                <tr>
                  <th>{t('Maktab')}</th>
                  <th>{t('Tuman')}</th>
                  <th>{t('Direktor')}</th>
                  <th>{t('Telefon')}</th>
                  <th>{t('Shartnoma')}</th>
                  <th>{t("O'qituvchi")}</th>
                  <th>{t('Sinf')}</th>
                  <th>{t("O'quvchi")}</th>
                  <th>{t('Holati')}</th>
                  {admin && <th aria-label={t('Tahrirlash')} />}
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id} className="is-click" onClick={() => navigate(`/manage/schools/${s.id}`)}>
                    <td>
                      <b>{s.name}</b>
                      {!!s.aliases?.length && <small className="psch__aka">{t('boshqacha yozilishi')}: {s.aliases.join(' · ')}</small>}
                    </td>
                    <td>{s.district || '—'}</td>
                    <td>{s.director || '—'}</td>
                    <td>{s.phone || '—'}</td>
                    <td>{contract(s)}</td>
                    <td>{s.teachers_count ?? '—'}</td>
                    <td>{s.classes_count ?? '—'}</td>
                    <td>{s.students_count ?? '—'}</td>
                    <td>{s.is_active ? <StatusPill tone="ok">{t('Faol')}</StatusPill> : <StatusPill tone="muted">{t('Faol emas')}</StatusPill>}</td>
                    {admin && (
                      <td>
                        <button type="button" className="btn btn--sm btn--ghost" title={t('Tahrirlash')} aria-label={t('Tahrirlash')}
                          onClick={(e) => { e.stopPropagation(); setEditing(s) }}>{IC.edit}</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editing && <SchoolFormModal initial={editing.id ? editing : null} onClose={() => setEditing(null)} />}
      {linking && unlinked.data && <LinkNamesModal rows={unlinked.data} onClose={() => setLinking(false)} />}
    </div>
  )
}
