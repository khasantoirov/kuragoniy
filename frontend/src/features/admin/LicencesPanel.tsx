import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { useConfirm } from '@/components/ConfirmProvider'
import { Modal } from '@/components/Modal'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { errText, fmtDate, StatusPill } from '@/features/portal/ui'
import { useLicences, useSchoolsMutation, type Licence, type LicencePlan, type LicenceRow } from '@/features/schools/api'
import { LICENCE_TONE, seats, som } from '@/features/schools/licence'
import { IS_ADMIN_HOST, siteUrl } from '@/lib/adminHost'
import { api } from '@/lib/api/client'
import { isAdmin, useAuth } from '@/lib/auth/AuthContext'

const iso = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (s: string, n: number) => {
  const d = new Date(`${s}T00:00:00`)
  d.setDate(d.getDate() + n)
  return iso(d)
}
/** a plan's usual length: Sinov two weeks, Standart a quarter, Premium a year */
const LENGTH: Record<LicencePlan, number> = { sinov: 14, standart: 91, premium: 365 }

/** Boshqaruv → Litsenziyalar: every partner school's subscription — the
 *  state, period, seats taken, payment — and the switch that makes an
 *  expired licence lock the journal (backend schools/licensing.py). */
export function LicencesPanel() {
  const { t } = useTranslation()
  const toast = useToast()
  const { user } = useAuth()
  const admin = isAdmin(user)
  const { data, isLoading } = useLicences()
  const [editing, setEditing] = useState<{ row: LicenceRow; licence: Licence | null } | null>(null)
  const enforce = useSchoolsMutation(async (on: boolean) => api.post('/schools/licenses/enforce/', { on }))
  const confirm = useConfirm()

  if (isLoading || !data) return <Skeleton lines={5} />
  const out = data.schools.filter((r) => r.school.is_active && !r.in_force)

  const toggle = async () => {
    const on = !data.enforced
    if (on && !(await confirm({
      title: t('Litsenziya talabini yoqish'),
      text: `${out.length} ${t("ta faol maktabning litsenziyasi amalda emas — ularning jurnallari darhol faqat ko'rish rejimiga o'tadi.")}`,
      danger: true,
    }))) return
    try {
      await enforce.mutateAsync(on)
      toast(t(on ? 'Litsenziya talabi yoqildi' : "Litsenziya talabi o'chirildi"))
    } catch (err) {
      toast(t(errText(err)), 'error')
    }
  }

  return (
    <div>
      <section className="panel modpanel">
        <h3 className="panel__title">{t('Litsenziyalar')}</h3>
        <ul className="modlist">
          <li className="modlist__row">
            <span className="modlist__txt">
              <b>{t('Litsenziya talabi')}</b>
              <small>{t("Yoqilganda litsenziyasi amalda bo'lmagan (yo'q yoki muddati tugagan) maktabning jurnali faqat ko'rish rejimiga o'tadi: baho, davomat va choraklik kiritilmaydi. O'chiq turganda faqat holatlar ko'rsatiladi.")}</small>
            </span>
            <button type="button" role="switch" aria-checked={data.enforced} aria-label={t('Litsenziya talabi')}
              className={`qswitch ${data.enforced ? 'is-on' : ''}`} disabled={!admin || enforce.isPending} onClick={() => void toggle()}>
              <span className="qswitch__dot" />
            </button>
          </li>
        </ul>
        <p className="prose prose--note">
          {t("Muddati tugashiga 14, 7, 3, 1 kun qolganda va oxirgi kuni ma'muriyatga hamda maktab ma'muriyatiga bildirishnoma boradi.")}
          {out.length > 0 && <> · <b>{out.length} {t("ta faol maktabda litsenziya amalda emas")}</b></>}
        </p>
      </section>

      <section className="panel">
        <div className="tablewrap">
          <table className="dtable">
            <thead>
              <tr>
                <th>{t('Maktab')}</th><th>{t('Holati')}</th><th>{t('Tarif')}</th><th>{t('Muddati')}</th>
                <th>{t("O'quvchilar")}</th><th>{t("O'qituvchilar")}</th><th>{t("To'lov")}</th>{admin && <th />}
              </tr>
            </thead>
            <tbody>
              {data.schools.map((r) => {
                const lic = r.licence
                return (
                  <tr key={r.school.id} className={r.school.is_active ? '' : 'is-muted'}>
                    <td>{IS_ADMIN_HOST
                      ? <a href={siteUrl(`/manage/schools/${r.school.id}`)}><b>{r.school.name}</b></a>
                      : <Link to={`/manage/schools/${r.school.id}`}><b>{r.school.name}</b></Link>}{r.school.district && <><br /><small className="muted">{r.school.district}</small></>}</td>
                    <td>
                      <StatusPill tone={LICENCE_TONE[r.state]}>{t(r.label)}</StatusPill>
                      {r.days_left != null && r.state === 'ending' && <><br /><small className="muted">{r.days_left} {t('kun qoldi')}</small></>}
                    </td>
                    <td>{lic ? t(lic.plan_label) : '—'}</td>
                    <td>{lic ? `${fmtDate(lic.starts_on)} — ${fmtDate(lic.ends_on)}` : '—'}</td>
                    <td className={lic?.pupil_seats != null && r.usage.pupils > lic.pupil_seats ? 'is-bad' : ''}>{seats(r.usage.pupils, lic?.pupil_seats)}</td>
                    <td className={lic?.teacher_seats != null && r.usage.teachers > lic.teacher_seats ? 'is-bad' : ''}>{seats(r.usage.teachers, lic?.teacher_seats)}</td>
                    <td>{lic ? <>{som(lic.amount)}<br /><small className="muted">{lic.paid ? `${t("to'langan")} ${lic.paid_on ? fmtDate(lic.paid_on) : ''}` : t("to'lanmagan")}</small></> : '—'}</td>
                    {admin && (
                      <td className="dtable__acts">
                        <button className="btn btn--sm" onClick={() => setEditing({ row: r, licence: null })}>+ {t('Yangi')}</button>
                        {lic && <button className="btn btn--sm btn--ghost" onClick={() => setEditing({ row: r, licence: lic })}>{t('Tahrirlash')}</button>}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {editing && <LicenceModal row={editing.row} licence={editing.licence} plans={data.plans} onClose={() => setEditing(null)} />}
    </div>
  )
}

function LicenceModal({ row, licence, plans, onClose }: {
  row: LicenceRow
  licence: Licence | null
  plans: { value: LicencePlan; label: string }[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  // a new one starts the day after the current one ends (or today)
  const last = row.licence && row.licence.ends_on >= iso(new Date()) ? addDays(row.licence.ends_on, 1) : iso(new Date())
  const [plan, setPlan] = useState<LicencePlan>(licence?.plan ?? 'standart')
  const [startsOn, setStartsOn] = useState(licence?.starts_on ?? last)
  const [endsOn, setEndsOn] = useState(licence?.ends_on ?? addDays(last, LENGTH.standart - 1))
  const [pupils, setPupils] = useState(licence?.pupil_seats != null ? String(licence.pupil_seats) : '')
  const [teachers, setTeachers] = useState(licence?.teacher_seats != null ? String(licence.teacher_seats) : '')
  const [amount, setAmount] = useState(licence?.amount != null ? String(licence.amount) : '')
  const [paid, setPaid] = useState(licence?.paid ?? false)
  const [paidOn, setPaidOn] = useState(licence?.paid_on ?? '')
  const [note, setNote] = useState(licence?.note ?? '')

  const save = useSchoolsMutation(async (body: Record<string, unknown>) => (licence
    ? api.patch(`/schools/licenses/${licence.id}/`, body)
    : api.post('/schools/licenses/', { ...body, school: row.school.id })))
  const remove = useSchoolsMutation(async (licenceId: number) => api.delete(`/schools/licenses/${licenceId}/`))

  const pickPlan = (p: LicencePlan) => {
    setPlan(p)
    if (!licence) setEndsOn(addDays(startsOn, LENGTH[p] - 1))
  }
  const num = (v: string) => (v.trim() ? Number(v.replace(/\s/g, '')) : null)

  const submit = async () => {
    try {
      await save.mutateAsync({
        plan, starts_on: startsOn, ends_on: endsOn, pupil_seats: num(pupils), teacher_seats: num(teachers),
        amount: num(amount), paid, paid_on: paid ? paidOn || null : null, note,
      })
      toast(t('Saqlandi'))
      onClose()
    } catch (err) {
      toast(t(errText(err)), 'error')
    }
  }
  const del = async () => {
    if (!(await confirm({ title: t("Litsenziyani o'chirish"), text: row.school.name, danger: true }))) return
    try {
      await remove.mutateAsync(licence!.id)
      onClose()
    } catch (err) {
      toast(t(errText(err)), 'error')
    }
  }

  return (
    <Modal
      title={`${licence ? t('Litsenziyani tahrirlash') : t('Yangi litsenziya')} — ${row.school.name}`}
      onClose={onClose}
      footer={<>
        {licence && <button className="btn btn--ghost ctl__del" onClick={() => void del()}>{t("O'chirish")}</button>}
        <button className="btn" onClick={onClose}>{t('Bekor qilish')}</button>
        <button className="btn btn--primary" disabled={save.isPending || !startsOn || !endsOn} onClick={() => void submit()}>{t('Saqlash')}</button>
      </>}
    >
      <label className="field">
        <span className="field__label">{t('Tarif')}</span>
        <select className="input" value={plan} onChange={(e) => pickPlan(e.target.value as LicencePlan)}>
          {plans.map((p) => <option key={p.value} value={p.value}>{t(p.label)}</option>)}
        </select>
      </label>
      <div className="row row--2">
        <label className="field">
          <span className="field__label">{t('Boshlanishi')}</span>
          <input className="input" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">{t('Tugashi')}</span>
          <input className="input" type="date" value={endsOn} min={startsOn} onChange={(e) => setEndsOn(e.target.value)} />
        </label>
      </div>
      <div className="row row--2">
        <label className="field">
          <span className="field__label">{t("O'quvchi o'rinlari")} <small className="muted">({t('hozir')} {row.usage.pupils})</small></span>
          <input className="input" inputMode="numeric" value={pupils} onChange={(e) => setPupils(e.target.value.replace(/[^\d]/g, ''))} placeholder={t('cheklanmagan')} />
        </label>
        <label className="field">
          <span className="field__label">{t("O'qituvchi o'rinlari")} <small className="muted">({t('hozir')} {row.usage.teachers})</small></span>
          <input className="input" inputMode="numeric" value={teachers} onChange={(e) => setTeachers(e.target.value.replace(/[^\d]/g, ''))} placeholder={t('cheklanmagan')} />
        </label>
      </div>
      <div className="row row--2">
        <label className="field">
          <span className="field__label">{t("Narxi (so'm)")}</span>
          <input className="input" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))} />
        </label>
        <label className="field">
          <span className="field__label">{t("To'langan sana")}</span>
          <input className="input" type="date" value={paidOn} disabled={!paid} onChange={(e) => setPaidOn(e.target.value)} />
        </label>
      </div>
      <label className="check">
        <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} /> {t("To'langan")}
      </label>
      <label className="field">
        <span className="field__label">{t('Izoh')} <small className="muted">({t('ixtiyoriy')})</small></span>
        <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("Shartnoma raqami, to'lov usuli…")} />
      </label>
    </Modal>
  )
}
