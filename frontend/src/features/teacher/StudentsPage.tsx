import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { useConfirm } from '@/components/ConfirmProvider'
import { EmptyState } from '@/components/EmptyState'
import { LoginEditModal } from '@/components/LoginEditModal'
import { Modal } from '@/components/Modal'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import {
  useClassStudents,
  useInvalidateLearning,
  useTeacherClasses,
  type Credential,
  type StudentAccountRow,
} from '@/features/learning/api'
import { downloadCsv } from '@/features/portal/csv'
import { Presence } from '@/features/portal/Presence'
import { errText, PageHead, StatusPill } from '@/features/portal/ui'
import { IC } from '@/icons'
import { api } from '@/lib/api/client'

/** Printable login sheet — one slip per student to cut out and hand over. */
function CredentialsModal({ creds, className, onClose }: { creds: Credential[]; className: string; onClose: () => void }) {
  const { t } = useTranslation()
  const site = window.location.origin
  return (
    <Modal
      title={t('Login va parollar')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={() => downloadCsv(`loginlar-${className}`, [t('Ism'), t('Login'), t('Parol')], creds.map((c) => [c.name, c.username, c.password]))}>
            {IC.download} CSV
          </button>
          <button className="btn" onClick={() => window.print()}>{IC.print} {t('Chop etish')}</button>
          <button className="btn btn--primary" onClick={onClose}>{t('Yopish')}</button>
        </>
      }
    >
      <p className="prose prose--note">
        {t("Parollar faqat hozir ko'rsatiladi — chop eting yoki saqlab oling. O'quvchi birinchi kirishda parolni o'zi almashtiradi.")}
      </p>
      <div className="slips printable">
        {creds.map((c) => (
          <div className="slip" key={c.id}>
            <p className="slip__name">{c.name}</p>
            <p><span>{t('Sayt')}:</span> {site}</p>
            <p><span>{t('Login')}:</span> <b className="mono">{c.username}</b></p>
            <p><span>{t('Parol')}:</span> <b className="mono">{c.password}</b></p>
            <p className="slip__hint">{t("«O'quvchi» oynasidan kiring")}</p>
          </div>
        ))}
      </div>
    </Modal>
  )
}

export function StudentsPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const invalidate = useInvalidateLearning()
  const { data: classes, isLoading } = useTeacherClasses()
  const [classId, setClassId] = useState<number | null>(null)
  const { data, isLoading: loadingStudents } = useClassStudents(classId)
  const [creds, setCreds] = useState<Credential[] | null>(null)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<StudentAccountRow | null>(null)

  useEffect(() => {
    if (classId == null && classes?.length) setClassId(classes[0].id)
  }, [classes, classId])

  if (isLoading) return <Skeleton lines={5} />
  if (!classes?.length) {
    return (
      <div>
        <PageHead title={t("O'quvchilar")} />
        <EmptyState title={t("Avval jurnalda sinf yarating")} hint={t("O'quvchi hisoblari jurnaldagi sinf ro'yxatidan yaratiladi.")}
          action={<Link className="btn btn--primary" to="/journal">{t("Jurnalga o'tish")}</Link>} />
      </div>
    )
  }

  const cls = data?.class ?? classes.find((c) => c.id === classId)

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
      invalidate()
    } catch (err) {
      toast(t(errText(err)), 'error')
    } finally {
      setBusy(false)
    }
  }

  const invite = (body: Record<string, boolean>) => run(async () => { await api.post(`/learning/classes/${classId}/invite/`, body) })

  const createAll = () => run(async () => {
    const res = await api.post<{ created: Credential[] }>(`/learning/classes/${classId}/create-accounts/`, {})
    if (res.data.created.length) setCreds(res.data.created)
    else toast(t("Barcha o'quvchilarda allaqachon hisob bor"))
  })

  const addOne = () => run(async () => {
    const res = await api.post<{ created: Credential[] }>(`/learning/classes/${classId}/add-student/`, { full_name: newName })
    setNewName('')
    setCreds(res.data.created)
  })

  const act = (s: StudentAccountRow, action: string, body?: object) => run(async () => {
    if (action === 'reset-password') {
      if (!(await confirm({ title: t('Parolni tiklash'), text: `${s.name} — ${t("yangi vaqtinchalik parol yaratiladi.")}` }))) return
      const res = await api.post<{ username: string; password: string }>(`/learning/students/${s.id}/reset-password/`)
      setCreds([{ id: s.id, name: s.name, username: res.data.username, password: res.data.password }])
      return
    }
    if (action === 'reject' && !(await confirm({ title: t('Rad etish'), text: `${s.name} — ${t("hisob o'chiriladi.")}`, danger: true }))) return
    if (action === 'set-active' && body && !(body as { is_active: boolean }).is_active
      && !(await confirm({ title: t('Bloklash'), text: `${s.name} ${t('endi tizimga kira olmaydi.')}`, danger: true }))) return
    await api.post(`/learning/students/${s.id}/${action}/`, body ?? {})
    toast(t('Bajarildi'))
  })

  const pending = data?.accounts.filter((a) => !a.approved) ?? []
  const active = data?.accounts.filter((a) => a.approved) ?? []
  const joinLink = cls?.invite_code ? `${window.location.origin}/join?code=${cls.invite_code}` : ''

  return (
    <div>
      <PageHead title={t("O'quvchilar")} sub={t("O'quvchilarga login-parol bering, sinf kodini ulashing, unutilgan parolni shu yerda tiklang.")}
        actions={
          <select className="input" value={classId ?? ''} onChange={(e) => setClassId(Number(e.target.value))} aria-label={t('Sinf')}>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}{c.school ? ` — ${c.school}` : ''}</option>)}
          </select>
        } />

      {cls && (
        <div className="cols2">
          <section className="panel">
            <h3 className="panel__title">{t('Sinf kodi')}</h3>
            {cls.invite_code ? (
              <>
                <p className={`joincode ${cls.invite_active ? '' : 'is-off'}`}>{cls.invite_code}</p>
                <p className="form__note">{t("O'quvchilar «Ro'yxatdan o'tish → Sinf kodi» orqali shu kod bilan o'zlari hisob ochadi.")}</p>
                <div className="panel__acts">
                  <button className="btn btn--sm" onClick={async () => { await navigator.clipboard.writeText(joinLink).catch(() => {}); toast(t('Havola nusxalandi')) }}>{IC.copy} {t('Havolani nusxalash')}</button>
                  <button className="btn btn--sm btn--ghost" disabled={busy} onClick={() => invite({ is_active: !cls.invite_active })}>
                    {cls.invite_active ? t("O'chirish") : t('Yoqish')}
                  </button>
                  <button className="btn btn--sm btn--ghost" disabled={busy} onClick={() => invite({ regenerate: true })}>{t('Yangi kod')}</button>
                </div>
                <label className="check">
                  <input type="checkbox" checked={cls.auto_approve} onChange={(e) => invite({ auto_approve: e.target.checked })} />
                  <span>{t("Avtomatik tasdiqlash (darsda hammasi birga ro'yxatdan o'tayotganda qulay)")}</span>
                </label>
              </>
            ) : (
              <button className="btn btn--primary" disabled={busy} onClick={() => invite({})}>{t('Sinf kodini yaratish')}</button>
            )}
          </section>

          <section className="panel">
            <h3 className="panel__title">{t("Ro'yxatdan hisob yaratish")}</h3>
            <p className="prose prose--note">
              {t("Jurnaldagi ro'yxatda")} {cls.roster_count} {t("o'quvchi")}; {data?.roster_without_account.length ?? 0} {t('tasida hali hisob yo\'q.')}
            </p>
            <div className="panel__acts">
              <button className="btn btn--primary" disabled={busy || !data?.roster_without_account.length} onClick={createAll}>
                {t('Hammasiga login-parol yaratish')}
              </button>
            </div>
            <div className="row row--2" style={{ marginTop: 12 }}>
              <input className="input" placeholder={t("Yangi o'quvchi: Familiya Ism")} value={newName} onChange={(e) => setNewName(e.target.value)} />
              <button className="btn" disabled={busy || newName.trim().length < 3} onClick={addOne}>{t("Qo'shish")}</button>
            </div>
          </section>
        </div>
      )}

      {loadingStudents && <Skeleton lines={4} />}

      {pending.length > 0 && (
        <section className="panel panel--attention">
          <h3 className="panel__title">{t('Tasdiq kutmoqda')} <span className="badge">{pending.length}</span></h3>
          <ul className="people">
            {pending.map((s) => (
              <li key={s.id} className="person">
                <div>
                  <p className="person__name">{s.name}</p>
                  <p className="person__mail">{s.username}</p>
                </div>
                <div className="person__acts">
                  <button className="btn btn--sm btn--primary" disabled={busy} onClick={() => act(s, 'approve')}>{t('Tasdiqlash')}</button>
                  <button className="btn btn--sm btn--ghost" disabled={busy} onClick={() => act(s, 'reject')}>{t('Rad etish')}</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data && (
        <section className="panel">
          <h3 className="panel__title">{t('Hisoblar')} <span className="badge badge--soft">{active.length}</span></h3>
          {active.length ? (
            <div className="tablewrap">
              <table className="dtable">
                <thead>
                  <tr><th>{t('Ism')}</th><th>{t('Login')}</th><th>{t('Holat')}</th><th>{t('Faollik')}</th><th>{t('Urinishlar')}</th><th /></tr>
                </thead>
                <tbody>
                  {active.map((s) => (
                    <tr key={s.id} className={s.is_active ? '' : 'is-dim'}>
                      <td>{s.name}</td>
                      <td className="mono">{s.username}</td>
                      <td>
                        {!s.is_active ? <StatusPill tone="bad">{t('Bloklangan')}</StatusPill>
                          : s.locked ? <StatusPill tone="bad">{t('Vaqtincha qulflangan')}</StatusPill>
                          : s.must_change_password ? <StatusPill tone="mid">{t('Hali kirmagan')}</StatusPill>
                          : <StatusPill tone="ok">{t('Faol')}</StatusPill>}
                        {s.telegram_linked && <span title="Telegram"> {IC.telegram}</span>}
                      </td>
                      <td><Presence online={s.online} lastSeen={s.last_seen} /></td>
                      <td>{s.attempts}</td>
                      <td className="dtable__acts">
                        <button className="btn btn--sm btn--ghost" disabled={busy} onClick={() => act(s, 'reset-password')}>{t('Parolni tiklash')}</button>
                        <button className="btn btn--sm btn--ghost" disabled={busy} onClick={() => setEditing(s)}>{t("Loginni o'zgartirish")}</button>
                        <button className="btn btn--sm btn--ghost" disabled={busy} onClick={() => act(s, 'set-active', { is_active: !s.is_active })}>
                          {s.is_active ? t('Bloklash') : t('Blokdan chiqarish')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="prose prose--note">{t("Hali hisob yo'q. Yuqoridagi tugma bilan ro'yxatdan yarating yoki sinf kodini ulashing.")}</p>
          )}
        </section>
      )}

      {creds && <CredentialsModal creds={creds} className={cls?.name ?? ''} onClose={() => setCreds(null)} />}
      {editing && (
        <LoginEditModal name={editing.name} login={editing.username || ''} url={`/learning/students/${editing.id}/set-login/`}
          field="username" onSaved={invalidate} onClose={() => setEditing(null)} />
      )}
    </div>
  )
}
