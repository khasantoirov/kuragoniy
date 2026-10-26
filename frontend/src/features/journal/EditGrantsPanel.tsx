import { isAxiosError } from 'axios'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { useToast } from '@/components/Toast'
import { fmtDate, fmtDateTime } from '@/features/portal/ui'
import { IC } from '@/icons'

import { useCloseTeacher, useCreateGrant, useDecideGrant, useGrants, useGrantTeachers } from './api'
import { DURATIONS, isAllPast } from './lock'
import type { EditGrant, GrantTeacher } from './types'

const STATUS_LABEL: Record<string, string> = {
  pending: 'Kutilmoqda', approved: 'Ruxsat berilgan', rejected: 'Rad etilgan', revoked: 'Bekor qilingan',
}

const errText = (err: unknown) => (isAxiosError<{ detail?: string }>(err) ? err.response?.data?.detail : undefined)

function dates(g: { date_from: string; date_to: string }) {
  if (isAllPast(g)) return 'barcha o\'tgan kunlar'
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
        <span>{g.class_label} · {t(dates(g))}</span>
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

/** One teacher: open/closed at a glance, one button to open every past
 * day for a while (or close again), and a way into their journal to open
 * single days from the lock on them. */
function TeacherRow({ p }: { p: GrantTeacher }) {
  const { t } = useTranslation()
  const toast = useToast()
  const navigate = useNavigate()
  const create = useCreateGrant()
  const close = useCloseTeacher()
  const [hours, setHours] = useState(24)
  const isOpen = p.open.length > 0
  const until = p.open.reduce((m, g) => (g.expires_at > m ? g.expires_at : m), '')

  const openAll = async () => {
    try {
      await create.mutateAsync({ teacher: p.id, all_past: true, hours })
      toast(`${p.name}: ${t("o'tgan kunlar ochildi")}`)
    } catch (err) {
      toast(t(errText(err) ?? 'Xatolik yuz berdi'), 'error')
    }
  }
  const closeAll = async () => {
    try {
      await close.mutateAsync(p.id)
      toast(`${p.name}: ${t('jurnal yopildi')}`)
    } catch (err) {
      toast(t(errText(err) ?? 'Xatolik yuz berdi'), 'error')
    }
  }

  return (
    <li className="jteach">
      <span className="jteach__av" aria-hidden="true">{(p.name || '?').slice(0, 1).toUpperCase()}</span>
      <span className="jteach__txt">
        <b>
          {p.name}
          {(p.role === 'admin' || p.role === 'boshliq') && <span className="jteach__role">{t('Administrator')}</span>}
          {p.pending > 0 && <span className="chip__count" title={t("Kutilayotgan so'rovlar")}>{p.pending}</span>}
        </b>
        <small>{p.classes.length ? `${p.classes.length} ${t('ta sinf')}` : t("Jurnalida sinf yo'q")}</small>
        {isOpen && (
          <small className="jteach__open">
            {p.open.map((g) => `${g.class_label} · ${t(dates(g))}`).join('; ')} — {fmtDateTime(until)} {t('gacha')}
          </small>
        )}
      </span>
      <span className={`jteach__state ${isOpen ? 'is-open' : ''}`}>{isOpen ? IC.unlock : IC.lock} {isOpen ? t('Ochiq') : t('Yopiq')}</span>
      <span className="jgrant__acts">
        {isOpen ? (
          <button type="button" className="btn btn--sm" onClick={closeAll} disabled={close.isPending}>{IC.lock} {t('Yopish')}</button>
        ) : (
          <>
            <DurationSelect value={hours} onChange={setHours} />
            <button type="button" className="btn btn--sm btn--primary" onClick={openAll} disabled={create.isPending}
              title={t("Barcha o'tgan kunlarning baho va davomatini tanlangan muddatga ochadi")}>
              {IC.unlock} {t('Ruxsat berish')}
            </button>
          </>
        )}
        {p.classes.length > 0 && (
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => navigate(`/journal?teacher=${encodeURIComponent(p.id)}`)}>
            {IC.eye} {t('Jurnalini ochish')}
          </button>
        )}
      </span>
    </li>
  )
}

/** Jurnal → Ruxsatlar (administrators). */
export function EditGrantsPanel() {
  const { t } = useTranslation()
  const pending = useGrants('pending')
  const teachers = useGrantTeachers(true)
  const [q, setQ] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const history = useGrants('history', showHistory)
  const rows = (teachers.data ?? []).filter((p) => !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase()))

  return (
    <div className="jgrants">
      <p className="jlock__why">
        {IC.lock}
        <span>{t("Baho va davomat faqat dars kunining o'zida kiritiladi — hamma uchun, administratorlar ham. O'tgan kunni o'zgartirish uchun shu yerda o'qituvchiga ruxsat bering yoki uning jurnalini ochib, kerakli kun yonidagi qulfni bosing.")}</span>
      </p>

      {!!pending.data?.length && (
        <section className="panel">
          <h3 className="panel__title">{t("Kutilayotgan so'rovlar")} <span className="badge">{pending.data.length}</span></h3>
          <ul className="jgrant__list">{pending.data.map((g) => <PendingRow key={g.id} g={g} />)}</ul>
        </section>
      )}

      <section className="panel">
        <div className="thead">
          <h3 className="panel__title">{t("O'qituvchilar")} <span className="badge">{teachers.data?.length ?? 0}</span></h3>
          <input className="input jteach__q" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Qidirish…')} />
        </div>
        {teachers.isLoading ? (
          <p className="prose prose--note">{t('Yuklanmoqda…')}</p>
        ) : (
          <ul className="jgrant__list">{rows.map((p) => <TeacherRow key={p.id} p={p} />)}</ul>
        )}
      </section>

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
                    <span>{g.class_label} · {t(dates(g))}</span>
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
