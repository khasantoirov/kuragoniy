import { isAxiosError } from 'axios'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useToast } from '@/components/Toast'
import { fmtDate, fmtDateTime } from '@/features/portal/ui'
import { IC } from '@/icons'

import { useCreateGrant, useDecideGrant, useGrants, useGrantTeachers } from './api'
import { localToday } from './lock'
import type { EditGrant } from './types'

const DURATIONS = [
  { h: 1, label: '1 soat' },
  { h: 3, label: '3 soat' },
  { h: 24, label: '24 soat' },
  { h: 72, label: '3 kun' },
  { h: 168, label: '7 kun' },
]

const STATUS_LABEL: Record<string, string> = {
  pending: 'Kutilmoqda', approved: 'Ruxsat berilgan', rejected: 'Rad etilgan', revoked: 'Bekor qilingan',
}

const errText = (err: unknown) => (isAxiosError<{ detail?: string }>(err) ? err.response?.data?.detail : undefined)

function dates(g: EditGrant) {
  return g.date_from === g.date_to ? fmtDate(g.date_from) : `${fmtDate(g.date_from)} – ${fmtDate(g.date_to)}`
}

function DurationSelect({ value, onChange }: { value: number; onChange: (h: number) => void }) {
  const { t } = useTranslation()
  return (
    <select className="input jgrant__dur" value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={t('Muddat')}>
      {DURATIONS.map((d) => <option key={d.h} value={d.h}>{t(d.label)}</option>)}
    </select>
  )
}

function PendingRow({ g }: { g: EditGrant }) {
  const { t } = useTranslation()
  const toast = useToast()
  const decide = useDecideGrant()
  const [hours, setHours] = useState(24)

  const act = async (action: 'approve' | 'reject') => {
    try {
      await decide.mutateAsync({ id: g.id, action, hours })
      toast(action === 'approve' ? t('Ruxsat berildi') : t("So'rov rad etildi"))
    } catch (err) {
      toast(t(errText(err) ?? 'Xatolik yuz berdi'), 'error')
    }
  }

  return (
    <li className="jgrant">
      <span className="jgrant__ic">{IC.lock}</span>
      <span className="jgrant__txt">
        <b>{g.teacher_name}</b>
        <span>{g.class_label} · {dates(g)}</span>
        {g.reason && <q className="jgrant__reason">{g.reason}</q>}
        <small>{t("So'ralgan")}: {fmtDateTime(g.created_at)}</small>
      </span>
      <span className="jgrant__acts">
        <DurationSelect value={hours} onChange={setHours} />
        <button type="button" className="btn btn--sm btn--primary" onClick={() => act('approve')} disabled={decide.isPending}>
          {IC.unlock} {t('Ruxsat berish')}
        </button>
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => act('reject')} disabled={decide.isPending}>
          {t('Rad etish')}
        </button>
      </span>
    </li>
  )
}

function GrantForm() {
  const { t } = useTranslation()
  const toast = useToast()
  const teachers = useGrantTeachers(true)
  const create = useCreateGrant()
  const [teacher, setTeacher] = useState('')
  const [cls, setCls] = useState<number | ''>('')
  const [from, setFrom] = useState(localToday)
  const [to, setTo] = useState(localToday)
  const [hours, setHours] = useState(24)
  const [note, setNote] = useState('')
  const classes = teachers.data?.find((x) => x.id === teacher)?.classes ?? []

  const submit = async () => {
    if (!teacher) return toast(t("O'qituvchini tanlang"), 'error')
    try {
      await create.mutateAsync({ teacher, journal_class: cls || null, date_from: from, date_to: to < from ? from : to, hours, note })
      toast(t('Ruxsat berildi'))
      setNote('')
    } catch (err) {
      toast(t(errText(err) ?? 'Xatolik yuz berdi'), 'error')
    }
  }

  return (
    <section className="panel">
      <h3 className="panel__title">{IC.unlock} {t("Kunlarni ochib berish")}</h3>
      <p className="prose prose--note">{t("O'qituvchi so'ramasdan ham tanlangan kunlarning baho va davomatini tahrirlashga ruxsat bering.")}</p>
      <div className="jgrant__form">
        <label className="field">
          <span className="field__label">{t("O'qituvchi")}</span>
          <select className="input" value={teacher} onChange={(e) => { setTeacher(e.target.value); setCls('') }}>
            <option value="">{t('Tanlang…')}</option>
            {(teachers.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field__label">{t('Sinf')}</span>
          <select className="input" value={cls} onChange={(e) => setCls(e.target.value ? Number(e.target.value) : '')} disabled={!teacher}>
            <option value="">{t('Barcha sinflar')}</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field__label">{t('Sanadan')}</span>
          <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">{t('Sanagacha')}</span>
          <input className="input" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">{t('Ruxsat muddati')}</span>
          <DurationSelect value={hours} onChange={setHours} />
        </label>
        <label className="field">
          <span className="field__label">{t('Izoh')} <span className="field__opt">({t('ixtiyoriy')})</span></span>
          <input className="input" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
      <button type="button" className="btn btn--primary" onClick={submit} disabled={create.isPending}>{IC.unlock} {t('Ruxsat berish')}</button>
    </section>
  )
}

/** Jurnal → Ruxsatlar (administrators): teachers' requests to reopen past
 * days, permissions given directly, the open ones, and the history. */
export function EditGrantsPanel() {
  const { t } = useTranslation()
  const toast = useToast()
  const pending = useGrants('pending')
  const active = useGrants('active')
  const decide = useDecideGrant()
  const [showHistory, setShowHistory] = useState(false)
  const history = useGrants('history', showHistory)

  const revoke = async (id: number) => {
    try {
      await decide.mutateAsync({ id, action: 'revoke' })
      toast(t('Ruxsat bekor qilindi'))
    } catch (err) {
      toast(t(errText(err) ?? 'Xatolik yuz berdi'), 'error')
    }
  }

  return (
    <div className="jgrants">
      <p className="jlock__why">
        {IC.lock} {t("O'qituvchilar baho va davomatni faqat dars kunining o'zida kiritadi. Keyingi kunlarda o'zgartirish faqat shu yerda berilgan ruxsat bilan mumkin.")}
      </p>

      <section className="panel">
        <h3 className="panel__title">{t("Kutilayotgan so'rovlar")} {!!pending.data?.length && <span className="badge">{pending.data.length}</span>}</h3>
        {pending.data?.length ? (
          <ul className="jgrant__list">{pending.data.map((g) => <PendingRow key={g.id} g={g} />)}</ul>
        ) : (
          <p className="prose prose--note">{pending.isLoading ? t('Yuklanmoqda…') : t("Hozircha so'rov yo'q.")}</p>
        )}
      </section>

      <section className="panel">
        <h3 className="panel__title">{t('Faol ruxsatlar')} {!!active.data?.length && <span className="badge">{active.data.length}</span>}</h3>
        {active.data?.length ? (
          <ul className="jgrant__list">
            {active.data.map((g) => (
              <li key={g.id} className="jgrant">
                <span className="jgrant__ic jgrant__ic--on">{IC.unlock}</span>
                <span className="jgrant__txt">
                  <b>{g.teacher_name}</b>
                  <span>{g.class_label} · {dates(g)}</span>
                  <small>{fmtDateTime(g.expires_at)} {t('gacha')} · {g.decided_by_name}</small>
                </span>
                <span className="jgrant__acts">
                  <button type="button" className="btn btn--sm btn--ghost" onClick={() => revoke(g.id)} disabled={decide.isPending}>
                    {t('Bekor qilish')}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="prose prose--note">{t("Faol ruxsat yo'q — o'tgan kunlar yopiq.")}</p>
        )}
      </section>

      <GrantForm />

      <section className="panel">
        <button type="button" className="inbox__annhead" onClick={() => setShowHistory((v) => !v)} aria-expanded={showHistory}>
          {t('Tarix')} <span className={`inbox__chev ${showHistory ? 'is-open' : ''}`}>{IC.chevron}</span>
        </button>
        {showHistory && (
          history.data?.length ? (
            <ul className="jgrant__list">
              {history.data.map((g) => (
                <li key={g.id} className="jgrant">
                  <span className="jgrant__txt">
                    <b>{g.teacher_name}</b>
                    <span>{g.class_label} · {dates(g)}</span>
                    {g.reason && <q className="jgrant__reason">{g.reason}</q>}
                    <small>
                      {t(g.status === 'approved' ? 'Muddati tugagan' : STATUS_LABEL[g.status])}
                      {g.decided_by_name ? ` · ${g.decided_by_name}` : ''}{g.decided_at ? ` · ${fmtDateTime(g.decided_at)}` : ''}
                    </small>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="prose prose--note">{history.isLoading ? t('Yuklanmoqda…') : t("Tarix bo'sh.")}</p>
          )
        )}
      </section>
    </div>
  )
}
