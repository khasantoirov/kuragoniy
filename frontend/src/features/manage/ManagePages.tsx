import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useConfirm } from '@/components/ConfirmProvider'
import { EmptyState } from '@/components/EmptyState'
import { Modal } from '@/components/Modal'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { AnalyticsDashboard, type AwardTarget } from '@/features/learning/AnalyticsDashboard'
import { useAwards, useInvalidateLearning, useReports, useTeachersList, type Award, type LessonReport } from '@/features/learning/api'
import { errText, fmtDate, fmtDateTime, PageHead, Segmented, Stars } from '@/features/portal/ui'
import { ReportCard } from '@/features/teacher/ReportsPage'
import { IC } from '@/icons'
import { api } from '@/lib/api/client'
import { isAdmin, useAuth } from '@/lib/auth/AuthContext'

import { AWARD_KINDS, AwardModal } from './AwardModal'

/** "Tahlil" — the administration's data-analysis view. */
export function ManageDashboard() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [award, setAward] = useState<AwardTarget | null>(null)
  return (
    <>
      <AnalyticsDashboard oversight canAward={isAdmin(user)} onAward={setAward}
        title={t("Ma'muriyat: tahlil")} sub={t("Eng yaxshi o'quvchilar va eng yaxshi dars o'tgan o'qituvchilar — ma'lumotlar asosida.")} />
      {award && <AwardModal target={award} onClose={() => setAward(null)} />}
    </>
  )
}

function ReviewModal({ report, onClose }: { report: LessonReport; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const invalidate = useInvalidateLearning()
  const [rating, setRating] = useState<number | null>(report.rating)
  const [comment, setComment] = useState(report.review_comment)
  const [busy, setBusy] = useState(false)

  const send = async (status: 'reviewed' | 'returned') => {
    setBusy(true)
    try {
      await api.post(`/learning/reports/${report.id}/review/`, { status, rating: status === 'reviewed' ? rating : null, review_comment: comment })
      invalidate()
      toast(status === 'reviewed' ? t('Baholandi') : t('Qaytarildi'))
      onClose()
    } catch (err) {
      toast(t(errText(err)), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={t('Hisobotni baholash')} onClose={onClose}
      footer={<>
        <button className="btn" disabled={busy} onClick={() => send('returned')}>{t('Qayta ishlashga qaytarish')}</button>
        <button className="btn btn--primary" disabled={busy || !rating} onClick={() => send('reviewed')}>{t('Baholash')}</button>
      </>}>
      <ReportCard r={report} />
      <div className="field">
        <span className="field__label">{t('Baho')}</span>
        <Stars value={rating} onChange={setRating} size={30} />
      </div>
      <label className="field">
        <span className="field__label">{t('Izoh (o\'qituvchiga yuboriladi)')}</span>
        <textarea className="input" rows={3} maxLength={4000} value={comment} onChange={(e) => setComment(e.target.value)} />
      </label>
    </Modal>
  )
}

export function ReviewReportsPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const canReview = isAdmin(user)
  const [status, setStatus] = useState('submitted')
  const [teacher, setTeacher] = useState('')
  const teachers = useTeachersList()
  const { data, isLoading } = useReports({ status: status === 'all' ? undefined : status, teacher: teacher || undefined })
  const [open, setOpen] = useState<LessonReport | null>(null)

  return (
    <div>
      <PageHead title={t('Hisobotlarni baholash')} sub={t("O'qituvchilar topshirgan darslar — baholang, izoh qoldiring.")}
        actions={<>
          <select className="input input--sm" value={teacher} onChange={(e) => setTeacher(e.target.value)}>
            <option value="">{t("Barcha o'qituvchilar")}</option>
            {teachers.data?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          <Segmented value={status} onChange={setStatus} options={[
            { value: 'submitted', label: t('Yangi') }, { value: 'reviewed', label: t('Baholangan') }, { value: 'returned', label: t('Qaytarilgan') }, { value: 'all', label: t('Hammasi') },
          ]} />
        </>} />
      {isLoading && <Skeleton lines={5} />}
      {!isLoading && !data?.length && <EmptyState title={t("Hisobot yo'q")} />}
      <div className="rlist">
        {data?.map((r) => (
          <ReportCard key={r.id} r={r} actions={canReview && r.teacher !== user?.id && (
            <button className="btn btn--sm btn--primary" onClick={() => setOpen(r)}>{r.status === 'submitted' ? t('Baholash') : t("Bahoni o'zgartirish")}</button>
          )} />
        ))}
      </div>
      {open && <ReviewModal report={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

/** Printable certificate — browser print (works for any script, unlike a
 * PDF library's built-in Latin-only fonts). */
function Certificate({ award, onClose }: { award: Award; onClose: () => void }) {
  const { t } = useTranslation()
  return (
    <Modal title={t('Sertifikat')} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>{t('Yopish')}</button><button className="btn btn--primary" onClick={() => window.print()}>{IC.print} {t('Chop etish / PDF')}</button></>}>
      <div className="cert printable">
        <img className="cert__logo" src="/logo.png" alt="" />
        <p className="cert__org">KO'RAGONIY EDU</p>
        <img className="cert__sign" src="/muhandis-d-on-light.png" alt="Muhandis D" />
        <h2 className="cert__h">{t('SERTIFIKAT')}</h2>
        <p className="cert__to">{t('Ushbu sertifikat')}</p>
        <p className="cert__name">{award.recipient_name}</p>
        <p className="cert__title">«{award.title}»</p>
        {award.reason && <p className="cert__reason">{award.reason}</p>}
        <div className="cert__foot">
          <span>{award.period || fmtDate(award.created_at)}</span>
          <span>{award.granted_by_name}</span>
        </div>
      </div>
    </Modal>
  )
}

export function AwardsPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const invalidate = useInvalidateLearning()
  const [role, setRole] = useState<'all' | 'student' | 'staff'>('all')
  const { data, isLoading } = useAwards(role === 'all' ? {} : { role })
  const [creating, setCreating] = useState(false)
  const [cert, setCert] = useState<Award | null>(null)
  const admin = isAdmin(user)

  const remove = async (a: Award) => {
    if (!(await confirm({ title: t("Rag'batni bekor qilish"), text: `${a.recipient_name} — ${a.title}`, danger: true }))) return
    try {
      await api.delete(`/learning/awards/${a.id}/`)
      invalidate()
    } catch (err) {
      toast(t(errText(err)), 'error')
    }
  }

  return (
    <div>
      <PageHead title={t("Rag'batlantirish")} sub={t("Eng yaxshi o'quvchi va o'qituvchilarni taqdirlang: sertifikat chop eting, tabrik Telegramga boradi.")}
        actions={<>
          <Segmented value={role} onChange={setRole} options={[{ value: 'all', label: t('Hammasi') }, { value: 'student', label: t("O'quvchilar") }, { value: 'staff', label: t("O'qituvchilar") }]} />
          {admin && <button className="btn btn--primary" onClick={() => setCreating(true)}>🏆 {t("Rag'bat berish")}</button>}
        </>} />
      {isLoading && <Skeleton lines={4} />}
      {!isLoading && !data?.length && <EmptyState title={t("Hali rag'bat berilmagan")} hint={t("«Tahlil» bo'limidagi reytinglardan to'g'ridan-to'g'ri rag'batlantirish mumkin.")} />}
      <ul className="awards awards--grid">
        {data?.map((a) => (
          <li key={a.id} className="award">
            <span className="award__kind">{t(AWARD_KINDS.find((k) => k.value === a.kind)?.label ?? a.kind)}</span>
            <strong>{a.recipient_name}</strong>
            <span>{a.title}</span>
            {a.reason && <small>{a.reason}</small>}
            <small className="muted">{a.period || fmtDate(a.created_at)} · {a.granted_by_name}</small>
            <span className="award__acts">
              <button className="btn btn--sm" onClick={() => setCert(a)}>{IC.print} {t('Sertifikat')}</button>
              {admin && <button className="btn btn--sm btn--ghost" onClick={() => remove(a)}>{IC.trash}</button>}
            </span>
          </li>
        ))}
      </ul>
      {creating && <AwardModal onClose={() => setCreating(false)} />}
      {cert && <Certificate award={cert} onClose={() => setCert(null)} />}
    </div>
  )
}

const ACTION_LABELS: Record<string, string> = {
  modules_changed: "Modullar o'zgartirildi",
  login_ok: 'Kirish',
  login_failed: "Noto'g'ri parol",
  login_locked: 'Hisob bloklandi',
  login_while_locked: 'Bloklangan hisobga urinish',
  logout_all: 'Barcha qurilmalardan chiqish',
  password_changed: "Parol o'zgartirildi",
  password_reset_requested: "Parol tiklash so'raldi",
  password_reset_done: 'Parol tiklandi',
  password_reset_bad_code: "Noto'g'ri tiklash kodi",
  password_reset_no_channel: "Tiklash kanali yo'q",
  password_reset_rate_limited: 'Tiklash cheklovi',
  register_teacher: "O'qituvchi ro'yxatdan o'tdi",
  register_student: "O'quvchi ro'yxatdan o'tdi",
  students_created: "O'quvchi hisoblari yaratildi",
  student_password_reset: "O'quvchi paroli tiklandi",
  student_approved: "O'quvchi tasdiqlandi",
  student_rejected: "O'quvchi rad etildi",
  student_active_changed: "O'quvchi holati o'zgardi",
  student_moved: "O'quvchi ko'chirildi",
  student_joined_class: "O'quvchi sinfga qo'shildi",
  telegram_unlinked: 'Telegram uzildi',
  admin_action: "Ma'muriyat amali",
}

interface AuditRow { id: number; created_at: string; action: string; actor: string; detail: string; ip: string | null; user_agent: string }

export function SecurityLogPage() {
  const { t } = useTranslation()
  const [action, setAction] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const { data, isLoading } = useQuery({
    queryKey: ['audit', action, q, page],
    queryFn: async () => (await api.get<{ count: number; next: string | null; results: AuditRow[] }>('/accounts/audit-log/', {
      params: { action: action || undefined, q: q || undefined, page },
    })).data,
  })

  const suspicious = (a: string) => ['login_locked', 'login_while_locked', 'password_reset_bad_code', 'login_failed'].includes(a)

  return (
    <div>
      <PageHead title={t('Xavfsizlik jurnali')} sub={t("Kim, qachon, qayerdan (IP) kirdi va nima o'zgartirdi. 400 kun saqlanadi.")}
        actions={<>
          <select className="input input--sm" value={action} onChange={(e) => { setAction(e.target.value); setPage(1) }}>
            <option value="">{t('Barcha hodisalar')}</option>
            {Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
          </select>
          <input className="input input--sm" placeholder={t('Ism, IP yoki matn…')} value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} />
        </>} />
      {isLoading ? <Skeleton lines={8} /> : (
        <section className="panel">
          <div className="tablewrap">
            <table className="dtable dtable--dense">
              <thead><tr><th>{t('Vaqt')}</th><th>{t('Hodisa')}</th><th>{t('Kim')}</th><th>IP</th><th>{t('Tafsilot')}</th></tr></thead>
              <tbody>
                {data?.results.map((r) => (
                  <tr key={r.id} className={suspicious(r.action) ? 'is-warn' : ''}>
                    <td>{fmtDateTime(r.created_at)}</td>
                    <td>{t(ACTION_LABELS[r.action] ?? r.action)}</td>
                    <td>{r.actor || '—'}</td>
                    <td className="mono">{r.ip || '—'}</td>
                    <td className="dtable__wrap" title={r.user_agent}>{r.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pager">
            <button className="btn btn--sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>←</button>
            <span>{page} · {data?.count ?? 0} {t('ta yozuv')}</span>
            <button className="btn btn--sm" disabled={!data?.next} onClick={() => setPage(page + 1)}>→</button>
          </div>
        </section>
      )}
    </div>
  )
}
