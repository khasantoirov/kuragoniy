import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'

import { Avatar } from '@/components/Avatar'
import { Modal } from '@/components/Modal'
import { RoleBadge } from '@/components/RoleBadge'
import { Meter, PageHead, StatusPill, fmtDate } from '@/features/portal/ui'
import { ProfileCard } from '@/features/profile/ProfileCard'
import { IC } from '@/icons'
import { useAuth } from '@/lib/auth/AuthContext'

import { useOverview, type Overview } from './api'
import { SecurityTab, SessionsTab } from './SecurityPanel'

type Tab = 'general' | 'reports' | 'awards' | 'sessions' | 'security'

const TABS: { key: Tab; label: string; icon: keyof typeof IC }[] = [
  { key: 'general', label: 'Umumiy', icon: 'home' },
  { key: 'reports', label: 'Hisobotlar tarixi', icon: 'report' },
  { key: 'awards', label: "Rag'batlar", icon: 'star' },
  { key: 'sessions', label: 'Aktiv seanslar', icon: 'monitor' },
  { key: 'security', label: 'Kirish va xavfsizlik', icon: 'shield' },
]

const ROLE_TITLE: Record<string, string> = {
  teacher: "O'qituvchi",
  admin: 'Administrator',
  boshliq: 'Boshliq',
  kuzatuvchi: 'Kuzatuvchi',
  student: "O'quvchi",
}

const REPORT_STATUS: Record<string, { tone: 'ok' | 'mid' | 'bad'; label: string }> = {
  reviewed: { tone: 'ok', label: 'Baholandi' },
  submitted: { tone: 'mid', label: 'Tekshiruvda' },
  returned: { tone: 'bad', label: 'Qaytarildi' },
}

function Kpi({ value, label, icon, tone }: { value: string | number; label: string; icon: keyof typeof IC; tone: string }) {
  return (
    <div className="pkpi" style={{ ['--k' as string]: tone }}>
      <span className="pkpi__ic">{IC[icon]}</span>
      <span className="pkpi__v">{value}</span>
      <span className="pkpi__l">{label}</span>
    </div>
  )
}

function GeneralTab({ ov }: { ov?: Overview }) {
  const { t } = useTranslation()
  if (!ov?.reports) return <section className="panel"><p className="prose prose--note">{t('Yuklanmoqda…')}</p></section>
  const r = ov.reports
  const done = r.total ? Math.round((r.reviewed / r.total) * 100) : 0
  return (
    <>
      <div className="pkpis">
        <Kpi value={ov.rating != null ? ov.rating.toFixed(1) : '—'} label={t("O'rtacha baho (5 dan)")} icon="star" tone="#7c5cff" />
        <Kpi value={r.reviewed} label={t('Baholangan hisobotlar')} icon="check2" tone="#14a37f" />
        <Kpi value={r.pending} label={t('Tekshiruvda')} icon="file" tone="#e0a020" />
        <Kpi value={r.returned} label={t('Qaytarilgan')} icon="undo" tone="#e2465a" />
        <Kpi value={ov.classes ?? 0} label={t('Sinflar')} icon="clipboard" tone="#2f7bff" />
        <Kpi value={ov.students ?? 0} label={t("O'quvchilar")} icon="users" tone="#14a37f" />
        <Kpi value={ov.assignments ?? 0} label={t('Berilgan vazifalar')} icon="list" tone="#6a73fa" />
        <Kpi value={ov.readiness ?? 0} label={t('Darsga tayyorgarlik testlari')} icon="target" tone="#f08c2e" />
      </div>
      <section className="panel">
        <div className="pbar">
          <span>{t('Hisobotlar baholanishi')} · {r.reviewed}/{r.total}</span>
          <b>{done}%</b>
        </div>
        <Meter value={done} label={t('Hisobotlar baholanishi')} />
      </section>
      <section className="panel">
        <h3 className="panel__title">{t("So'nggi hisobotlar")}</h3>
        <ReportList rows={(ov.recent_reports ?? []).slice(0, 5)} />
      </section>
    </>
  )
}

function ReportList({ rows }: { rows: NonNullable<Overview['recent_reports']> }) {
  const { t } = useTranslation()
  if (!rows.length) return <p className="prose prose--note">{t("Hali dars hisoboti topshirilmagan.")}</p>
  return (
    <ul className="prow-list">
      {rows.map((r) => (
        <li key={r.id} className="prow">
          <span className="prow__txt">
            <span className="prow__t">{r.topic}</span>
            {r.comment && <span className="prow__s">{r.comment}</span>}
          </span>
          {r.rating != null && <span className="prow__rate">{'★'.repeat(r.rating)}<span>{'★'.repeat(5 - r.rating)}</span></span>}
          <StatusPill tone={REPORT_STATUS[r.status]?.tone ?? 'mid'}>{t(REPORT_STATUS[r.status]?.label ?? r.status)}</StatusPill>
          <span className="prow__d">{fmtDate(r.date)}</span>
        </li>
      ))}
    </ul>
  )
}

export function ProfilePage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const tab = (TABS.some((x) => x.key === params.get('tab')) ? params.get('tab') : 'general') as Tab
  const ov = useOverview()
  const [editing, setEditing] = useState(false)
  if (!user) return null

  return (
    <div className="setpg">
      <PageHead title={t('Profil')} sub={t("Shaxsiy ma'lumotlar, kirish va xavfsizlik")} />

      <section className="panel prof">
        <div className="prof__head">
          <Avatar name={user.name} photo={user.photo} className="prof__av" />
          <div className="prof__id">
            <h3 className="prof__nm">{user.name}</h3>
            <p className="prof__role">{t(ROLE_TITLE[user.role] ?? user.role)}</p>
            <p className="prof__tags">
              <RoleBadge user={user} />
              <span className="presence presence--on"><span className="presence__dot" aria-hidden="true" />{t('Faol')}</span>
            </p>
          </div>
          <button type="button" className="btn prof__edit" onClick={() => setEditing(true)}>{IC.edit} {t('Tahrirlash')}</button>
        </div>
        <div className="prof__meta">
          {user.phone && <span>{user.phone}</span>}
          <span>{user.email || user.username}</span>
          {user.bday && <span>{t("Tug'ilgan sana")}: {fmtDate(user.bday)}</span>}
          {ov.data?.joined && <span>{t("Qo'shilgan")}: {fmtDate(ov.data.joined)}</span>}
        </div>
      </section>

      <nav className="ptabs" aria-label={t('Profil bo\'limlari')}>
        {TABS.map((x) => (
          <button key={x.key} type="button" className={`ptab ${tab === x.key ? 'is-on' : ''}`}
            onClick={() => setParams(x.key === 'general' ? {} : { tab: x.key }, { replace: true })}>
            {IC[x.icon]} {t(x.label)}
          </button>
        ))}
      </nav>

      {tab === 'general' && <GeneralTab ov={ov.data} />}
      {tab === 'reports' && (
        <section className="panel">
          <h3 className="panel__title">{t('Hisobotlar tarixi')}</h3>
          <p className="prose prose--note">{t("Ma'muriyat dars hisobotlaringizga qo'ygan baholar va izohlar.")}</p>
          <ReportList rows={ov.data?.recent_reports ?? []} />
        </section>
      )}
      {tab === 'awards' && (
        <section className="panel">
          <h3 className="panel__title">{t("Rag'batlar")}</h3>
          {ov.data?.recent_awards?.length ? (
            <ul className="prow-list">
              {ov.data.recent_awards.map((a) => (
                <li key={a.id} className="prow">
                  <span className="prow__ic">🏆</span>
                  <span className="prow__txt"><span className="prow__t">{a.title}</span>{a.period && <span className="prow__s">{a.period}</span>}</span>
                  <span className="prow__d">{fmtDate(a.created_at)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="prose prose--note">{t("Hali rag'bat yo'q.")}</p>}
        </section>
      )}
      {tab === 'sessions' && <SessionsTab />}
      {tab === 'security' && <SecurityTab />}

      {editing && (
        <Modal title={t('Profilni tahrirlash')} onClose={() => setEditing(false)}>
          <ProfileCard />
        </Modal>
      )}
    </div>
  )
}
