import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { useConfirm } from '@/components/ConfirmProvider'
import { useToast } from '@/components/Toast'
import { errText, fmtDate, StatusPill } from '@/features/portal/ui'
import { api } from '@/lib/api/client'
import type { User } from '@/lib/api/types'

import { useSchoolsMutation, type GroupRow, type ManagerPosition, type School } from './api'
import { LICENCE_TONE, POSITIONS, seats, som } from './licence'
import { MetricPill } from './shared'

/** A school's page: its licence — the state, period, seats taken. */
export function LicencePanel({ school, admin }: { school: School; admin: boolean }) {
  const { t } = useTranslation()
  const st = school.licence
  if (!st) return null
  const lic = st.licence
  const over = (used: number, limit: number | null | undefined) => limit != null && used > limit
  return (
    <section className="panel">
      <div className="thead">
        <h3 className="panel__title">{t('Litsenziya')}</h3>
        <StatusPill tone={LICENCE_TONE[st.state]}>{t(st.label)}{st.days_left != null && st.state === 'ending' ? ` · ${st.days_left} ${t('kun qoldi')}` : ''}</StatusPill>
        {admin && <Link className="btn btn--sm btn--ghost" to="/admin?bolim=litsenziya">{t('Litsenziyalar')} ›</Link>}
      </div>
      {lic ? (
        <ul className="kv kv--grid">
          <li><span>{t('Tarif')}</span><b>{t(lic.plan_label)}</b></li>
          <li><span>{t('Muddati')}</span><b>{fmtDate(lic.starts_on)} — {fmtDate(lic.ends_on)}</b></li>
          <li><span>{t("O'quvchilar")}</span><b className={over(st.usage.pupils, lic.pupil_seats) ? 'is-bad' : ''}>{seats(st.usage.pupils, lic.pupil_seats)}</b></li>
          <li><span>{t("O'qituvchilar")}</span><b className={over(st.usage.teachers, lic.teacher_seats) ? 'is-bad' : ''}>{seats(st.usage.teachers, lic.teacher_seats)}</b></li>
          {admin && <li><span>{t("To'lov")}</span><b>{som(lic.amount)} · {lic.paid ? `${t("to'langan")} ${lic.paid_on ? fmtDate(lic.paid_on) : ''}` : t("to'lanmagan")}</b></li>}
        </ul>
      ) : (
        <p className="prose prose--note">{t("Bu maktabga hali litsenziya berilmagan.")}</p>
      )}
      {!st.in_force && st.enforced && (
        <p className="form__note form__note--err">{t("Litsenziya amalda emas — bu maktab jurnallari faqat ko'rish rejimida.")}</p>
      )}
    </section>
  )
}

/** Muhandis D's teachers next to the school's own: the same figures. */
export function KindComparison({ rows }: { rows: (GroupRow & { teachers: number })[] }) {
  const { t } = useTranslation()
  if (!rows.some((r) => r.id === 'muhandis')) return null
  return (
    <section className="panel">
      <h3 className="panel__title">{t("Muhandis D ustozlari va maktab ustozlari")}</h3>
      <div className="kindcmp">
        {rows.map((r) => (
          <div key={r.id} className={`kindcmp__c ${r.id === 'muhandis' ? 'is-md' : ''}`}>
            <b>{t(r.name)}</b>
            <small>{r.teachers} {t("ta o'qituvchi")} · {r.classes} {t('ta sinf')} · {r.students} {t("ta o'quvchi")}</small>
            <span className="kindcmp__m"><span>{t("O'rtacha baho")}</span><MetricPill value={r.avg_mark} band="mark" suffix="" digits={2} /></span>
            <span className="kindcmp__m"><span>{t("O'zlashtirish")}</span><MetricPill value={r.uzlashtirish} band="pct" /></span>
            <span className="kindcmp__m"><span>{t('Davomat')}</span><MetricPill value={r.attendance} good={95} fair={85} /></span>
          </div>
        ))}
      </div>
    </section>
  )
}

/** A school's own ma'muriyat on the platform (role "Maktab ma'muriyati"):
 *  administrators add and remove them here. */
export function ManagersPanel({ school, staff, admin }: { school: School; staff: User[]; admin: boolean }) {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const [who, setWho] = useState('')
  const [position, setPosition] = useState<ManagerPosition>('direktor')
  const act = useSchoolsMutation(async ({ action, body }: { action: 'add-manager' | 'remove-manager'; body: Record<string, string> }) =>
    api.post(`/schools/${school.id}/${action}/`, body))
  const managers = school.managers ?? []
  const candidates = staff.filter((u) => u.role === 'maktab' && !managers.some((m) => m.id === u.id))
  if (!admin && !managers.length) return null

  const add = async () => {
    try {
      await act.mutateAsync({ action: 'add-manager', body: { user: who, position } })
      setWho('')
    } catch (err) {
      toast(t(errText(err)), 'error')
    }
  }
  const remove = async (id: string, name: string) => {
    if (!(await confirm({ title: t("Ma'muriyatdan chiqarish"), text: name, danger: true }))) return
    try {
      await act.mutateAsync({ action: 'remove-manager', body: { user: id } })
    } catch (err) {
      toast(t(errText(err)), 'error')
    }
  }

  return (
    <section className="panel">
      <h3 className="panel__title">{t("Maktab ma'muriyati")}</h3>
      {admin && <p className="prose prose--note">{t("Direktor va zavuch platformada faqat shu maktabning statistikasi, o'qituvchilari va jurnallarini ko'radi — hech narsani o'zgartira olmaydi.")}</p>}
      {managers.length > 0 && (
        <ul className="linklist">
          {managers.map((m) => (
            <li key={m.id} className="linklist__row">
              <span className="linklist__info"><b>{m.name}</b><small>{t(m.position_label)}{m.phone ? ` · ${m.phone}` : ''}</small></span>
              {admin && <span className="linklist__acts"><button className="btn btn--sm btn--ghost" onClick={() => void remove(m.id, m.name)}>{t('Chiqarish')}</button></span>}
            </li>
          ))}
        </ul>
      )}
      {admin && (
        <div className="assignrow">
          <select className="input" value={who} onChange={(e) => setWho(e.target.value)} aria-label={t("Maktab ma'muriyati")}>
            <option value="">{candidates.length ? t("Ma'muriyat xodimini tanlang…") : t("«Maktab ma'muriyati» rolidagi xodim yo'q — Boshqaruv › Yangi xodim")}</option>
            {candidates.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <select className="input" value={position} onChange={(e) => setPosition(e.target.value as ManagerPosition)} aria-label={t('Lavozim')}>
            {POSITIONS.map((p) => <option key={p.value} value={p.value}>{t(p.label)}</option>)}
          </select>
          <button className="btn" disabled={!who || act.isPending} onClick={() => void add()}>{t('Biriktirish')}</button>
        </div>
      )}
    </section>
  )
}

