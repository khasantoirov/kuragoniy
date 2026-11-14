import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'

import { useConfirm } from '@/components/ConfirmProvider'
import { EmptyState } from '@/components/EmptyState'
import { Modal } from '@/components/Modal'
import { PageTabs } from '@/components/PageTabs'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { errText, fmtDateTime, PageHead, Segmented, StatusPill } from '@/features/portal/ui'
import { IC } from '@/icons'
import { api } from '@/lib/api/client'
import { isAdmin, useAuth } from '@/lib/auth/AuthContext'

import { TICKET_TONE, useFaq, useInvalidateHelp, useTicket, useTickets, type FaqItem, type Ticket, type TicketDetail } from './api'
import './help.css'

function Paragraphs({ text }: { text: string }) {
  return <>{text.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}</>
}

function useOpenTicket() {
  const [params, setParams] = useSearchParams()
  const open = Number(params.get('t')) || null
  const set = (id: number | null, bolim?: string) => {
    const next = new URLSearchParams(params)
    if (id == null) next.delete('t')
    else next.set('t', String(id))
    if (bolim) next.set('bolim', bolim)
    setParams(next, { replace: true })
  }
  return [open, set] as const
}

function NewTicketModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const invalidate = useInvalidateHelp()
  const { data } = useFaq()
  const [f, setF] = useState({ category: 'umumiy', subject: '', body: '' })
  const [busy, setBusy] = useState(false)
  const send = async () => {
    setBusy(true)
    try {
      const res = await api.post<TicketDetail>('/help/tickets/', f)
      invalidate()
      toast(t("Murojaat yuborildi — javob bildirishnoma bo'lib keladi"))
      onCreated(res.data.id)
    } catch (err) {
      toast(t(errText(err)), 'error')
      setBusy(false)
    }
  }
  return (
    <Modal title={t('Murojaat yuborish')} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>{t('Bekor qilish')}</button>
        <button className="btn btn--primary" disabled={busy || !f.subject.trim() || !f.body.trim()} onClick={send}>{t('Yuborish')}</button></>}>
      <label className="field"><span className="field__label">{t("Bo'lim")}</span>
        <select className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
          {data?.categories.map((c) => <option key={c.value} value={c.value}>{t(c.label)}</option>)}
        </select></label>
      <label className="field"><span className="field__label">{t('Mavzu')}</span>
        <input className="input" maxLength={200} autoFocus value={f.subject} placeholder={t('Qisqacha: nima bo\'ldi?')}
          onChange={(e) => setF({ ...f, subject: e.target.value })} /></label>
      <label className="field"><span className="field__label">{t('Batafsil')}</span>
        <textarea className="input" rows={6} maxLength={5000} value={f.body}
          placeholder={t("Qaysi sahifada, nima qilganingizda va nima chiqqanini yozing.")}
          onChange={(e) => setF({ ...f, body: e.target.value })} /></label>
    </Modal>
  )
}

function TicketModal({ id, onClose }: { id: number; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const { user } = useAuth()
  const invalidate = useInvalidateHelp()
  const { data, isLoading, isError } = useTicket(id)
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const run = async (fn: () => Promise<unknown>) => {
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
  const send = () => run(async () => {
    await api.post(`/help/tickets/${id}/messages/`, { body: reply })
    setReply('')
  })
  const setStatus = (status: 'hal' | 'yangi') => run(() => api.patch(`/help/tickets/${id}/`, { status }))
  const mine = data?.author === user?.id

  return (
    <Modal title={data ? `#${data.id} · ${data.subject}` : t('Murojaat')} onClose={onClose}
      footer={data && <>
        {data.status === 'hal'
          ? <button className="btn" disabled={busy} onClick={() => setStatus('yangi')}>{t('Qayta ochish')}</button>
          : <button className="btn" disabled={busy} onClick={() => setStatus('hal')}>✓ {t('Hal qilindi')}</button>}
        <button className="btn btn--primary" disabled={busy || !reply.trim()} onClick={send}>{t('Yuborish')}</button>
      </>}>
      {isLoading && <Skeleton lines={4} />}
      {isError && <p className="form__note form__note--err">{t('Murojaat topilmadi.')}</p>}
      {data && (
        <>
          <p className="hticket__meta">
            <StatusPill tone={TICKET_TONE[data.status]}>{t(data.status_label)}</StatusPill>
            <span>{t(data.category_label)}</span>
            {!mine && <span>{data.author_name} · {t(data.author_role)}</span>}
            {data.page && <span>{t('Sahifa')}: {data.page}</span>}
          </p>
          <ol className="hthread">
            {data.messages.map((m) => (
              <li key={m.id} className={`hmsg ${m.staff ? 'is-staff' : ''} ${m.author === user?.id ? 'is-me' : ''}`}>
                <small>{m.staff ? `${m.author_name} · ${t("Ma'muriyat")}` : m.author_name} · {fmtDateTime(m.created_at)}</small>
                <div className="hmsg__body"><Paragraphs text={m.body} /></div>
              </li>
            ))}
          </ol>
          <label className="field">
            <span className="field__label">{mine ? t('Javob yozish') : t("O'qituvchiga javob")}</span>
            <textarea className="input" rows={3} maxLength={5000} value={reply} onChange={(e) => setReply(e.target.value)} />
          </label>
        </>
      )}
    </Modal>
  )
}

function FaqModal({ item, categories, onClose }: { item: Partial<FaqItem>; categories: { value: string; label: string }[]; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const invalidate = useInvalidateHelp()
  const [f, setF] = useState({
    category: item.category ?? 'umumiy', question: item.question ?? '', answer: item.answer ?? '',
    is_published: item.is_published ?? true, order: item.order ?? 0,
  })
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      if (item.id) await api.patch(`/help/faq/${item.id}/`, f)
      else await api.post('/help/faq/', f)
      invalidate()
      onClose()
    } catch (err) {
      toast(t(errText(err)), 'error')
      setBusy(false)
    }
  }
  return (
    <Modal title={item.id ? t('Savolni tahrirlash') : t("Savol qo'shish")} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>{t('Bekor qilish')}</button>
        <button className="btn btn--primary" disabled={busy || !f.question.trim() || !f.answer.trim()} onClick={save}>{t('Saqlash')}</button></>}>
      <label className="field"><span className="field__label">{t("Bo'lim")}</span>
        <select className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
          {categories.map((c) => <option key={c.value} value={c.value}>{t(c.label)}</option>)}
        </select></label>
      <label className="field"><span className="field__label">{t('Savol')}</span>
        <input className="input" maxLength={300} value={f.question} onChange={(e) => setF({ ...f, question: e.target.value })} /></label>
      <label className="field"><span className="field__label">{t('Javob')}</span>
        <textarea className="input" rows={7} maxLength={10000} value={f.answer} onChange={(e) => setF({ ...f, answer: e.target.value })} /></label>
      <label className="hcheck">
        <input type="checkbox" checked={f.is_published} onChange={(e) => setF({ ...f, is_published: e.target.checked })} />
        {t("Hammaga ko'rinadi")}
      </label>
    </Modal>
  )
}

function FaqTab({ onAsk }: { onAsk: () => void }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const invalidate = useInvalidateHelp()
  const admin = isAdmin(user)
  const { data, isLoading } = useFaq()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [editing, setEditing] = useState<Partial<FaqItem> | null>(null)

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (data?.items ?? []).filter((i) => (!cat || i.category === cat)
      && (!needle || i.question.toLowerCase().includes(needle) || i.answer.toLowerCase().includes(needle)))
  }, [data, q, cat])
  const used = new Set((data?.items ?? []).map((i) => i.category))
  const groups = (data?.categories ?? []).filter((c) => shown.some((i) => i.category === c.value))

  const remove = async (i: FaqItem) => {
    if (!(await confirm({ title: t("Savolni o'chirish"), text: i.question, danger: true }))) return
    try {
      await api.delete(`/help/faq/${i.id}/`)
      invalidate()
    } catch (err) {
      toast(t(errText(err)), 'error')
    }
  }

  return (
    <div>
      <div className="hbar">
        <label className="hsearch">
          {IC.search}
          <input className="input" placeholder={t('Savolingizni yozing…')} value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        {admin && <button className="btn" onClick={() => setEditing({})}>+ {t("Savol qo'shish")}</button>}
      </div>
      <div className="hchips">
        <button className={`hchip ${cat === '' ? 'is-on' : ''}`} onClick={() => setCat('')}>{t('Hammasi')}</button>
        {data?.categories.filter((c) => used.has(c.value)).map((c) => (
          <button key={c.value} className={`hchip ${cat === c.value ? 'is-on' : ''}`} onClick={() => setCat(c.value)}>{t(c.label)}</button>
        ))}
      </div>
      {isLoading && <Skeleton lines={6} />}
      {data && !shown.length && (
        <EmptyState title={t('Bunday savol topilmadi')} hint={t("Savolingizni ma'muriyatga yozing — javob bildirishnoma bo'lib keladi.")}
          action={<button className="btn btn--primary" onClick={onAsk}>{t('Murojaat yuborish')}</button>} />
      )}
      {groups.map((g) => (
        <section key={g.value} className="panel hgroup">
          <h3 className="panel__title">{t(g.label)}</h3>
          {shown.filter((i) => i.category === g.value).map((i) => (
            <details key={i.id} className={`hfaq ${i.is_published ? '' : 'is-draft'}`} open={!!q.trim()}>
              <summary>
                <span>{i.question}</span>
                {!i.is_published && <StatusPill tone="muted">{t('Yashirin')}</StatusPill>}
              </summary>
              <div className="hfaq__a"><Paragraphs text={i.answer} /></div>
              {admin && (
                <div className="hfaq__acts">
                  <button className="btn btn--sm" onClick={() => setEditing(i)}>{IC.edit} {t('Tahrirlash')}</button>
                  <button className="btn btn--sm btn--ghost" onClick={() => remove(i)}>{IC.trash}</button>
                </div>
              )}
            </details>
          ))}
        </section>
      ))}
      {data && !!shown.length && (
        <p className="hfoot">{t('Javob topmadingizmi?')} <button className="linklike" onClick={onAsk}>{t('Murojaat yuborish')} ›</button></p>
      )}
      {editing && data && <FaqModal item={editing} categories={data.categories} onClose={() => setEditing(null)} />}
    </div>
  )
}

function TicketList({ rows, onOpen, showAuthor }: { rows: Ticket[]; onOpen: (id: number) => void; showAuthor?: boolean }) {
  const { t } = useTranslation()
  return (
    <ul className="linklist">
      {rows.map((r) => (
        <li key={r.id} className="linklist__row hrow" onClick={() => onOpen(r.id)}>
          <div className="linklist__info">
            <b>#{r.id} · {r.subject}</b>
            <small>{showAuthor ? `${r.author_name} · ` : ''}{t(r.category_label)} · {fmtDateTime(r.updated_at)} · {r.messages_count} {t('xabar')}</small>
          </div>
          <div className="linklist__acts">
            <StatusPill tone={TICKET_TONE[r.status]}>{t(r.status_label)}</StatusPill>
            <span className="hrow__go">›</span>
          </div>
        </li>
      ))}
    </ul>
  )
}

function MyTicketsTab({ onAsk, onOpen }: { onAsk: () => void; onOpen: (id: number) => void }) {
  const { t } = useTranslation()
  const { data, isLoading } = useTickets()
  if (isLoading) return <Skeleton lines={3} />
  if (!data?.length) {
    return <EmptyState title={t("Hali murojaat yo'q")} hint={t("Savolingiz bo'lsa yoki nimadir ishlamasa, ma'muriyatga yozing.")}
      action={<button className="btn btn--primary" onClick={onAsk}>{t('Murojaat yuborish')}</button>} />
  }
  return <section className="panel"><TicketList rows={data} onOpen={onOpen} /></section>
}

function AllTicketsTab({ onOpen }: { onOpen: (id: number) => void }) {
  const { t } = useTranslation()
  const [status, setStatus] = useState('open')
  const { data, isLoading } = useTickets(true, status === 'all' ? '' : status)
  return (
    <div>
      <div className="hbar">
        <Segmented value={status} onChange={setStatus} options={[
          { value: 'open', label: t('Ochiq') }, { value: 'yangi', label: t('Javob kutilmoqda') }, { value: 'hal', label: t('Hal qilingan') }, { value: 'all', label: t('Hammasi') },
        ]} />
      </div>
      {isLoading && <Skeleton lines={4} />}
      {!isLoading && !data?.length && <EmptyState title={t("Murojaat yo'q")} />}
      {!!data?.length && <section className="panel"><TicketList rows={data} onOpen={onOpen} showAuthor /></section>}
    </div>
  )
}

/** Yordam markazi — answers to the usual questions, and writing to the
 * administration (a conversation per murojaat). */
export function HelpPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [open, setOpen] = useOpenTicket()
  const [asking, setAsking] = useState(false)
  return (
    <div>
      <PageHead title={t('Yordam markazi')}
        sub={t("Ko'p beriladigan savollarga javoblar. Javob topilmasa, ma'muriyatga murojaat yuboring.")}
        actions={<button className="btn btn--primary" onClick={() => setAsking(true)}>{IC.mail} {t('Murojaat yuborish')}</button>} />
      <PageTabs tabs={[
        { key: 'savollar', label: 'Savol-javob', element: <FaqTab onAsk={() => setAsking(true)} /> },
        { key: 'mening', label: 'Mening murojaatlarim', element: <MyTicketsTab onAsk={() => setAsking(true)} onOpen={(id) => setOpen(id)} /> },
        { key: 'murojaatlar', label: 'Murojaatlar', element: <AllTicketsTab onOpen={(id) => setOpen(id)} />, show: isAdmin(user) },
      ]} />
      {asking && <NewTicketModal onClose={() => setAsking(false)} onCreated={(id) => { setAsking(false); setOpen(id, 'mening') }} />}
      {open != null && <TicketModal id={open} onClose={() => setOpen(null)} />}
    </div>
  )
}
