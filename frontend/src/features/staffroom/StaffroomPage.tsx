import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { useConfirm } from '@/components/ConfirmProvider'
import { EmptyState } from '@/components/EmptyState'
import { Modal } from '@/components/Modal'
import { PageTabs } from '@/components/PageTabs'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { useTeachersList } from '@/features/learning/api'
import { errText, fmtDate, PageHead, PercentPill, Segmented, StatusPill } from '@/features/portal/ui'
import { IC } from '@/icons'
import { api } from '@/lib/api/client'
import { isAdmin, useAuth } from '@/lib/auth/AuthContext'
import { useModules } from '@/lib/modules'

import { GUEST_TONE, useDayPlan, useGuestRequests, useInvalidateStaffroom, type DayPlan, type GuestRequest, type GuestStatus, type PlanSlot } from './api'
import './staffroom.css'

const WEEK = ['Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba', 'Yakshanba']

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : '')
const slotTime = (s: PlanSlot) => [hhmm(s.time_from), hhmm(s.time_to)].filter(Boolean).join('–')

interface GuestDraft { date: string; time: string; school_name: string; class_name: string; lesson: number | null; lesson_title?: string }

function GuestModal({ draft, onClose }: { draft: GuestDraft; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const invalidate = useInvalidateStaffroom()
  const [f, setF] = useState({ ...draft, topic: '', note: '' })
  const [busy, setBusy] = useState(false)
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }))
  const send = async () => {
    setBusy(true)
    try {
      await api.post('/staffroom/guests/', {
        date: f.date, time: f.time, school_name: f.school_name, class_name: f.class_name, lesson: f.lesson,
        topic: f.lesson ? '' : f.topic, note: f.note,
      })
      invalidate()
      toast(t("So'rov yuborildi — ma'muriyat javob beradi"))
      onClose()
    } catch (err) {
      toast(t(errText(err)), 'error')
      setBusy(false)
    }
  }
  return (
    <Modal title={t('Mehmon ustoz chaqirish')} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>{t('Bekor qilish')}</button>
        <button className="btn btn--primary" disabled={busy || !f.date || !(f.class_name || f.school_name)} onClick={send}>{t("So'rov yuborish")}</button></>}>
      <p className="form__note">{t("Muhandis D mutaxassisi darsingizga kelib, tajribani birga o'tkazadi. So'rov ma'muriyatga boradi, javobi bildirishnoma bo'lib keladi.")}</p>
      <div className="sroom__form">
        <label className="field"><span className="field__label">{t('Sana')}</span>
          <input className="input" type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} /></label>
        <label className="field"><span className="field__label">{t('Vaqt')}</span>
          <input className="input" maxLength={32} placeholder={t('Masalan: 3-soat, 10:00')} value={f.time} onChange={(e) => set({ time: e.target.value })} /></label>
        <label className="field"><span className="field__label">{t('Maktab')}</span>
          <input className="input" maxLength={255} value={f.school_name} onChange={(e) => set({ school_name: e.target.value })} /></label>
        <label className="field"><span className="field__label">{t('Sinf')}</span>
          <input className="input" maxLength={64} value={f.class_name} onChange={(e) => set({ class_name: e.target.value })} /></label>
      </div>
      {f.lesson ? (
        <p className="sroom__lessonline">{t('Mavzu')}: <b>{f.lesson_title}</b> <button className="linklike" onClick={() => set({ lesson: null })}>{t("O'zgartirish")}</button></p>
      ) : (
        <label className="field"><span className="field__label">{t('Mavzu')}</span>
          <input className="input" maxLength={255} value={f.topic} onChange={(e) => set({ topic: e.target.value })} /></label>
      )}
      <label className="field"><span className="field__label">{t('Izoh (ixtiyoriy)')}</span>
        <textarea className="input" rows={3} maxLength={2000} placeholder={t('Nimaga yordam kerak: tajriba, jihoz, metodika…')} value={f.note} onChange={(e) => set({ note: e.target.value })} /></label>
    </Modal>
  )
}

function SlotCard({ s, plan, onGuest }: { s: PlanSlot; plan: DayPlan; onGuest: (d: GuestDraft) => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const invalidate = useInvalidateStaffroom()
  const { on } = useModules()
  const l = s.lesson
  const options = s.lesson_grade != null ? plan.options[String(s.lesson_grade)] ?? [] : []

  const pick = async (value: string) => {
    try {
      await api.post('/staffroom/plan/', value === 'reset'
        ? { date: plan.date, period: s.period, reset: true }
        : { date: plan.date, period: s.period, lesson: value ? Number(value) : null })
      invalidate()
    } catch (err) {
      toast(t(errText(err)), 'error')
    }
  }

  return (
    <li className={`sroom__slot ${s.band ? 'is-band' : ''}`}>
      <div className="sroom__when">
        <span className="sroom__p">{s.period}</span>
        <small>{slotTime(s) || `${s.period}-${t('soat')}`}</small>
      </div>
      <div className="sroom__main">
        <p className="sroom__where">
          {s.band ? <>{IC.lock} {t('Band (boshqa ish)')}</> : <>
            <b>{s.class_name || t('Sinf ko\'rsatilmagan')}</b>
            {s.school && <span> · {s.school}</span>}
            {s.room && <span> · {t('Xona')} {s.room}</span>}
          </>}
        </p>
        {!s.band && (
          <>
            {l ? (
              <div className="sroom__lesson">
                <p className="sroom__meta">{l.chorak}-{t('chorak')} · {l.hafta}-{t('hafta')}{s.picked ? '' : ` · ${t('jadval bo\'yicha')}`}</p>
                <Link className="sroom__title" to={`/lessons/${l.id}`}>{l.title}</Link>
                {l.goal && <p className="sroom__goal">{l.goal}</p>}
                {!!l.experiments.length && (
                  <p className="sroom__exps">{IC.flask} {l.experiments.map((e) => e.name + (e.minutes ? ` (${e.minutes} ${t('daq')})` : '')).join(' · ')}</p>
                )}
                <div className="sroom__acts">
                  <Link className="btn btn--sm btn--primary" to={`/lessons/${l.id}`}>{t('Darsni ochish')}</Link>
                  {(l.file || l.file_url) && <a className="btn btn--sm" href={(l.file || l.file_url)!} target="_blank" rel="noreferrer noopener">{IC.download} {t('Dars fayli')}</a>}
                  {l.equipment_sheet && on('equipment') && <a className="btn btn--sm" href={l.equipment_sheet} target="_blank" rel="noreferrer noopener">{IC.image} {t('Jihozlar varag\'i')}</a>}
                  {l.poster && on('poster') && <a className="btn btn--sm" href={l.poster} target="_blank" rel="noreferrer noopener">{IC.image} {t('Dars rasmi')}</a>}
                  {on('readiness') && (l.readiness.best != null
                    ? <span className="sroom__ready">{t('Tayyorgarlik')}: <PercentPill value={l.readiness.best} />{l.readiness.passed && ' ✓'}</span>
                    : <Link className="btn btn--sm btn--ghost" to="/lessons?bolim=tayyorgarlik">{t('Darsga tayyorgarlikni tekshirish')}</Link>)}
                </div>
              </div>
            ) : (
              <p className="sroom__none">
                {s.lesson_grade == null ? t("Sinf darajasi aniqlanmadi — jadvalda sinfni «7-A» ko'rinishida yozing.")
                  : plan.place.chorak == null ? t("Ta'til kuni — chorak darsi yo'q.")
                    : s.picked ? t('Bu soatga mavzu tanlanmagan.')
                      : t("Jadval bo'yicha bu haftaga dars topilmadi — mavzuni o'zingiz tanlang.")}
              </p>
            )}
            <div className="sroom__tools">
              {options.length > 0 && (
                <select className="input input--sm" value="" onChange={(e) => pick(e.target.value)} aria-label={t('Mavzuni almashtirish')}>
                  <option value="">{t('Mavzuni almashtirish')}…</option>
                  {s.picked && <option value="reset">↺ {t("Jadval bo'yicha")}</option>}
                  {l && <option value="0">— {t('Mavzusiz')}</option>}
                  {options.map((o) => <option key={o.id} value={o.id}>{o.chorak}-{t('chorak')}, {o.hafta}-{t('hafta')}: {o.title}</option>)}
                </select>
              )}
              {s.journal_class && <Link className="btn btn--sm btn--ghost" to={`/journal?class=${s.journal_class.id}`}>{IC.clipboard} {t('Jurnal')}</Link>}
              <button className="btn btn--sm btn--ghost" onClick={() => onGuest({
                date: plan.date, time: [`${s.period}-${t('soat')}`, slotTime(s)].filter(Boolean).join(', '),
                school_name: s.school, class_name: s.class_name, lesson: l?.id ?? null, lesson_title: l?.title,
              })}>{IC.users} {t('Mehmon ustoz chaqirish')}</button>
            </div>
          </>
        )}
      </div>
    </li>
  )
}

function DayTab() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [which, setWhich] = useState<'next' | 'today' | 'pick'>('next')
  const [picked, setPicked] = useState('')
  const date = which === 'today' ? 'today' : which === 'pick' && picked ? picked : undefined
  const { data, isLoading } = useDayPlan(date)
  const [guest, setGuest] = useState<GuestDraft | null>(null)

  const head = data
    ? `${data.date === data.today ? t('Bugun') : t(WEEK[data.weekday])}, ${fmtDate(data.date)} · ${
      data.place.chorak ? `${data.place.chorak}-${t('chorak')}, ${data.place.week}-${t('hafta')}` : t("Ta'til")}`
    : ''

  return (
    <div>
      <div className="sroom__bar">
        <Segmented value={which} onChange={setWhich} options={[
          { value: 'next', label: t("Keyingi o'quv kuni") }, { value: 'today', label: t('Bugun') }, { value: 'pick', label: t('Sana') },
        ]} />
        {which === 'pick' && <input className="input input--sm" type="date" value={picked} onChange={(e) => setPicked(e.target.value)} />}
        {head && <b className="sroom__head">{head}</b>}
      </div>
      {data && !data.place.exact && isAdmin(user) && (
        <p className="form__note">{t("Chorak sanalari kiritilmagan — haftalar taxminiy sanalar bo'yicha hisoblanmoqda. Aniq sanalarni Boshqaruv → O'quv yillari'da kiriting.")}</p>
      )}
      {isLoading && <Skeleton lines={5} />}
      {data && !data.slots.length && (
        <EmptyState title={t("Bu kunga jadvalda dars yo'q")} hint={t('Darslar sizning haftalik jadvalingizdan olinadi.')}
          action={<Link className="btn" to="/timetable">{t('Jadvalni ochish')}</Link>} />
      )}
      {data && !!data.slots.length && (
        <ul className="sroom__list">
          {data.slots.map((s) => <SlotCard key={s.period} s={s} plan={data} onGuest={setGuest} />)}
        </ul>
      )}
      {guest && <GuestModal draft={guest} onClose={() => setGuest(null)} />}
    </div>
  )
}

function RequestRow({ g, actions, showRequester }: { g: GuestRequest; actions?: React.ReactNode; showRequester?: boolean }) {
  const { t } = useTranslation()
  return (
    <li className="linklist__row">
      <div className="linklist__info">
        <b>{[g.school_name, g.class_name].filter(Boolean).join(' · ')} — {fmtDate(g.date)}{g.time ? `, ${g.time}` : ''}</b>
        <small>
          {showRequester && `${g.requester_name} · `}
          {g.lesson_title || g.topic || t('Mavzu ko\'rsatilmagan')}
          {g.guest_name && ` · ${t('Mehmon ustoz')}: ${g.guest_name}`}
        </small>
        {g.note && <small>«{g.note}»</small>}
        {g.reply && <small>{t('Javob')}: {g.reply}</small>}
      </div>
      <div className="linklist__acts">
        <StatusPill tone={GUEST_TONE[g.status]}>{t(g.status_label)}</StatusPill>
        {actions}
      </div>
    </li>
  )
}

function MyGuestsTab() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const invalidate = useInvalidateStaffroom()
  const { data, isLoading } = useGuestRequests()
  const [guest, setGuest] = useState<GuestDraft | null>(null)
  const cancel = async (g: GuestRequest) => {
    if (!(await confirm({ title: t("So'rovni bekor qilish"), text: `${g.class_name} — ${fmtDate(g.date)}` }))) return
    try {
      await api.patch(`/staffroom/guests/${g.id}/`, { status: 'bekor' })
      invalidate()
    } catch (err) {
      toast(t(errText(err)), 'error')
    }
  }
  const mine = data?.filter((g) => g.requester === user?.id) ?? []
  const visits = data?.filter((g) => g.guest === user?.id && g.requester !== user?.id) ?? []
  return (
    <div>
      <div className="sroom__bar">
        <button className="btn btn--primary" onClick={() => setGuest({ date: '', time: '', school_name: '', class_name: '', lesson: null })}>
          {IC.users} {t('Mehmon ustoz chaqirish')}
        </button>
      </div>
      {isLoading && <Skeleton lines={3} />}
      {!!visits.length && (
        <section className="panel">
          <h3 className="panel__title">{t('Sizni taklif qilishgan darslar')}</h3>
          <ul className="linklist">{visits.map((g) => <RequestRow key={g.id} g={g} showRequester />)}</ul>
        </section>
      )}
      {!isLoading && !mine.length && !visits.length && (
        <EmptyState title={t("Hali so'rov yo'q")} hint={t("Darsingizga Muhandis D mutaxassisini taklif qilish uchun «Mehmon ustoz chaqirish» tugmasini bosing.")} />
      )}
      {!!mine.length && (
        <section className="panel">
          <h3 className="panel__title">{t("Mening so'rovlarim")}</h3>
          <ul className="linklist">
            {mine.map((g) => <RequestRow key={g.id} g={g} actions={g.status === 'yangi' && (
              <button className="btn btn--sm btn--ghost" onClick={() => cancel(g)}>{t('Bekor qilish')}</button>
            )} />)}
          </ul>
        </section>
      )}
      {guest && <GuestModal draft={guest} onClose={() => setGuest(null)} />}
    </div>
  )
}

function AnswerModal({ g, onClose }: { g: GuestRequest; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const invalidate = useInvalidateStaffroom()
  const teachers = useTeachersList()
  const [status, setStatus] = useState<GuestStatus>(g.status === 'qabul' ? 'otkazildi' : 'qabul')
  const [guestId, setGuestId] = useState(g.guest ? String(g.guest) : '')
  const [reply, setReply] = useState(g.reply)
  const [busy, setBusy] = useState(false)
  const send = async () => {
    setBusy(true)
    try {
      await api.patch(`/staffroom/guests/${g.id}/`, { status, guest: status === 'qabul' ? guestId : undefined, reply })
      invalidate()
      onClose()
    } catch (err) {
      toast(t(errText(err)), 'error')
      setBusy(false)
    }
  }
  return (
    <Modal title={t("So'rovga javob")} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>{t('Bekor qilish')}</button>
        <button className="btn btn--primary" disabled={busy || (status === 'qabul' && !guestId)} onClick={send}>{t('Saqlash')}</button></>}>
      <ul className="linklist"><RequestRow g={g} showRequester /></ul>
      <div className="field">
        <span className="field__label">{t('Javob')}</span>
        <Segmented value={status} onChange={setStatus} options={[
          { value: 'qabul', label: t('Qabul qilish') }, { value: 'rad', label: t('Rad etish') }, { value: 'otkazildi', label: t("O'tkazildi") },
        ]} />
      </div>
      {status === 'qabul' && (
        <label className="field"><span className="field__label">{t('Mehmon ustoz')}</span>
          <select className="input" value={guestId} onChange={(e) => setGuestId(e.target.value)}>
            <option value="">—</option>
            {teachers.data?.filter((x) => x.id !== g.requester).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </label>
      )}
      <label className="field"><span className="field__label">{t("Izoh (o'qituvchiga yuboriladi)")}</span>
        <textarea className="input" rows={3} maxLength={2000} value={reply} onChange={(e) => setReply(e.target.value)} /></label>
    </Modal>
  )
}

function RequestsTab() {
  const { t } = useTranslation()
  const [status, setStatus] = useState('open')
  const { data, isLoading } = useGuestRequests(true, status === 'all' ? '' : status)
  const [open, setOpen] = useState<GuestRequest | null>(null)
  return (
    <div>
      <div className="sroom__bar">
        <Segmented value={status} onChange={setStatus} options={[
          { value: 'open', label: t('Ochiq') }, { value: 'yangi', label: t('Yangi') }, { value: 'otkazildi', label: t("O'tkazilgan") }, { value: 'all', label: t('Hammasi') },
        ]} />
      </div>
      {isLoading && <Skeleton lines={4} />}
      {!isLoading && !data?.length && <EmptyState title={t("So'rov yo'q")} />}
      {!!data?.length && (
        <section className="panel">
          <ul className="linklist">
            {data.map((g) => <RequestRow key={g.id} g={g} showRequester actions={(g.status === 'yangi' || g.status === 'qabul') && (
              <button className="btn btn--sm btn--primary" onClick={() => setOpen(g)}>{g.status === 'yangi' ? t('Javob berish') : t('Yangilash')}</button>
            )} />)}
          </ul>
        </section>
      )}
      {open && <AnswerModal g={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

/** Ustozlar xonasi — the teacher's next school day from the timetable
 * (each hour's lesson and what it needs), guest teachers, and for the
 * administration the guest requests to answer. */
export function StaffroomPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  return (
    <div>
      <PageHead title={t('Ustozlar xonasi')}
        sub={t("Jadvalingizdagi darslar, har biriga shu haftaning mavzusi, fayli va jihozlari. Kerak bo'lsa, darsga mehmon ustoz chaqiring.")} />
      <PageTabs tabs={[
        { key: 'kun', label: 'Darslarim', element: <DayTab /> },
        { key: 'mehmon', label: 'Mehmon ustoz', element: <MyGuestsTab /> },
        { key: 'sorovlar', label: "So'rovlar", element: <RequestsTab />, show: isAdmin(user) },
      ]} />
    </div>
  )
}
