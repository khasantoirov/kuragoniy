import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { useConfirm } from '@/components/ConfirmProvider'
import { EmptyState } from '@/components/EmptyState'
import { Modal } from '@/components/Modal'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { errText, fmtDate, Meter, PageHead, Segmented, StatusPill } from '@/features/portal/ui'
import { IC } from '@/icons'
import { useUIStore } from '@/store/uiStore'
import { api } from '@/lib/api/client'
import { isAdmin, isOversight, useAuth } from '@/lib/auth/AuthContext'

import { AUDIENCES, useCertificates, useCourses, useInvalidateTraining, type CourseCard, type CourseMeta } from './api'
import { CertificateModal } from './CertificateView'
import './training.css'

function NewCourseModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const fan = useUIStore((s) => s.subject)
  const toast = useToast()
  const navigate = useNavigate()
  const invalidate = useInvalidateTraining()
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const create = async () => {
    setBusy(true)
    try {
      const res = await api.post<CourseMeta>('/training/courses/', { title })
      invalidate()
      navigate(`/training/${res.data.id}/edit`)
    } catch (err) {
      toast(t(errText(err)), 'error')
      setBusy(false)
    }
  }
  return (
    <Modal title={t('Yangi kurs')} onClose={onClose} narrow
      footer={<><button className="btn" onClick={onClose}>{t('Bekor qilish')}</button>
        <button className="btn btn--primary" disabled={busy || !title.trim()} onClick={create}>{t('Yaratish')}</button></>}>
      <label className="field">
        <span className="field__label">{t('Kurs nomi')}</span>
        <input className="input" autoFocus maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && title.trim() && create()} placeholder={fan === 'fizika' ? t("Masalan: Fizikadan tajriba darsini tashkil etish") : t('Masalan: STEAM darsini tashkil etish')} />
      </label>
      <p className="form__note">{t("Keyingi sahifada modullar, darslar va testlarni qo'shasiz. Kurs e'lon qilinmaguncha o'qituvchilarga ko'rinmaydi.")}</p>
    </Modal>
  )
}

function CourseTile({ c, oversight }: { c: CourseCard; oversight: boolean }) {
  const { t } = useTranslation()
  const action = oversight ? t('Ochish') : c.completed ? t("Ko'rish") : c.enrolled && c.percent > 0 ? t('Davom etish') : t('Boshlash')
  return (
    <Link to={`/training/${c.id}`} className={`tcourse ${c.completed ? 'is-done' : ''}`}>
      <div className="tcourse__top">
        <span className="tcourse__ic">{IC.book}</span>
        <div className="tcourse__pills">
          {!c.is_published && <StatusPill tone="muted">{t('Qoralama')}</StatusPill>}
          {oversight && c.audience !== 'all' && <StatusPill tone="info">{t(AUDIENCES.find((a) => a.value === c.audience)?.label ?? '')}</StatusPill>}
          {c.completed && <StatusPill tone="ok">✓ {t('Tugatilgan')}</StatusPill>}
          {!c.completed && c.due_on && <StatusPill tone={c.overdue ? 'bad' : 'mid'}>{t('Muddat')}: {fmtDate(c.due_on)}</StatusPill>}
        </div>
      </div>
      <h3 className="tcourse__title">{c.title}</h3>
      {c.summary && <p className="tcourse__sum">{c.summary}</p>}
      <p className="tcourse__meta">
        {c.module_count} {t('modul')} · {c.lessons_total} {t('dars')}{c.hours > 0 ? ` · ${c.hours} ${t('soat')}` : ''}
      </p>
      {oversight ? (
        <p className="tcourse__meta">{c.enrolled_count ?? 0} {t("ta o'qituvchi")} · {c.completed_count ?? 0} {t('ta sertifikat')}</p>
      ) : (
        <div className="tcourse__prog">
          <Meter value={c.percent} label={t('Kurs bo\'yicha')} />
          <span>{c.percent}%</span>
        </div>
      )}
      <span className="tcourse__go">{action} ›</span>
    </Link>
  )
}

function CertificatesList({ all }: { all: boolean }) {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const invalidate = useInvalidateTraining()
  const { user } = useAuth()
  const { data, isLoading } = useCertificates(all ? 'all' : undefined)
  const [open, setOpen] = useState<number | null>(null)
  const revoke = async (id: number, label: string) => {
    if (!(await confirm({ title: t('Sertifikatni bekor qilish'), text: label, danger: true }))) return
    try {
      await api.delete(`/training/certificates/${id}/`)
      invalidate()
    } catch (err) {
      toast(t(errText(err)), 'error')
    }
  }
  if (isLoading) return <Skeleton lines={3} />
  if (!data?.length) {
    return all ? <EmptyState title={t('Hali sertifikat berilmagan')} hint={t("O'qituvchi kursning barcha modullaridan o'tganda sertifikat avtomatik beriladi.")} /> : null
  }
  return (
    <section className="panel">
      <h3 className="panel__title">{all ? t('Berilgan sertifikatlar') : t('Mening sertifikatlarim')}</h3>
      <ul className="linklist">
        {data.map((c) => (
          <li key={c.id} className="linklist__row">
            <div className="linklist__info">
              <b>{all ? `${c.name} — ` : ''}«{c.course_title}»</b>
              <small>№ {c.number} · {fmtDate(c.issued_at)} · {Math.round(c.percent)}%{c.hours ? ` · ${c.hours} ${t('soat')}` : ''}</small>
            </div>
            <div className="linklist__acts">
              <button className="btn btn--sm" onClick={() => setOpen(c.id)}>{IC.print} {t('Sertifikat')}</button>
              {all && isAdmin(user) && (
                <button className="btn btn--sm btn--ghost" aria-label={t('Bekor qilish')} onClick={() => revoke(c.id, `№ ${c.number} · ${c.name}`)}>{IC.trash}</button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {open != null && <CertificateModal id={open} onClose={() => setOpen(null)} />}
    </section>
  )
}

/** Malaka oshirish — the courses a teacher may take (or, for the
 * administration, every course and the certificates given). */
export function TrainingPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const admin = isAdmin(user)
  const oversight = isOversight(user)
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState<'courses' | 'certs'>('courses')
  const [creating, setCreating] = useState(false)
  const { data, isLoading } = useCourses()
  const certParam = Number(params.get('cert')) || null

  return (
    <div>
      <PageHead title={t('Malaka oshirish')}
        sub={t("Kursni bosqichma-bosqich o'qing: modul darslarini o'qib, testidan o'tsangiz, keyingi modul ochiladi. Oxirida sertifikat beriladi.")}
        actions={<>
          {oversight && <Segmented value={tab} onChange={setTab} options={[{ value: 'courses', label: t('Kurslar') }, { value: 'certs', label: t('Sertifikatlar') }]} />}
          {admin && <button className="btn btn--primary" onClick={() => setCreating(true)}>+ {t('Yangi kurs')}</button>}
        </>} />
      {tab === 'certs' && oversight ? <CertificatesList all /> : (
        <>
          {isLoading && <Skeleton lines={5} />}
          {!isLoading && !data?.length && (
            <EmptyState title={t("Hozircha kurslar yo'q")}
              hint={admin ? t("«Yangi kurs» tugmasi bilan birinchi kursni yarating.") : t("Ma'muriyat kurs e'lon qilganda shu yerda ko'rinadi.")} />
          )}
          {!!data?.length && (
            <div className="tcourses">
              {data.map((c) => <CourseTile key={c.id} c={c} oversight={oversight} />)}
            </div>
          )}
          {!oversight && <CertificatesList all={false} />}
        </>
      )}
      {creating && <NewCourseModal onClose={() => setCreating(false)} />}
      {certParam != null && (
        <CertificateModal id={certParam} onClose={() => { params.delete('cert'); setParams(params, { replace: true }) }} />
      )}
    </div>
  )
}
