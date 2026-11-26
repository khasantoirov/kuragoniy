import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { useConfirm } from '@/components/ConfirmProvider'
import { EmptyState } from '@/components/EmptyState'
import { Modal } from '@/components/Modal'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { errText, fmtDate, Segmented, StatusPill } from '@/features/portal/ui'
import { IC } from '@/icons'
import { api } from '@/lib/api/client'
import { isAdmin, isObserver, useAuth } from '@/lib/auth/AuthContext'

import { REQUEST_TONE, som, useInvalidateKits, useKitRequests, useKits, type KitMeta, type KitRequest } from './api'
import './kits.css'

function NewKitModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const navigate = useNavigate()
  const invalidate = useInvalidateKits()
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const create = async () => {
    setBusy(true)
    try {
      const res = await api.post<KitMeta>('/kits/', { name, code })
      invalidate()
      navigate(`/kits/${res.data.id}`)
    } catch (err) {
      toast(t(errText(err)), 'error')
      setBusy(false)
    }
  }
  return (
    <Modal title={t('Yangi chamadon')} onClose={onClose} narrow
      footer={<><button className="btn" onClick={onClose}>{t('Bekor qilish')}</button>
        <button className="btn btn--primary" disabled={busy || !name.trim()} onClick={create}>{t('Yaratish')}</button></>}>
      <label className="field"><span className="field__label">{t('Nomi')}</span>
        <input className="input" autoFocus maxLength={200} value={name} placeholder={t('Masalan: Mexanika chamadoni (7-sinf)')}
          onChange={(e) => setName(e.target.value)} /></label>
      <label className="field"><span className="field__label">{t('Kodi (ixtiyoriy)')}</span>
        <input className="input" maxLength={32} value={code} placeholder="MEX-7" onChange={(e) => setCode(e.target.value)} /></label>
      <p className="form__note">{t("Keyingi sahifada tarkibni kiritasiz — qo'lda yoki darslar jihozlaridan avtomatik.")}</p>
    </Modal>
  )
}

function Catalogue() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const admin = isAdmin(user)
  const { data, isLoading } = useKits()
  const [creating, setCreating] = useState(false)
  return (
    <div>
      {admin && <div className="kbar"><button className="btn btn--primary" onClick={() => setCreating(true)}>+ {t('Yangi chamadon')}</button></div>}
      {isLoading && <Skeleton lines={4} />}
      {!isLoading && !data?.length && (
        <EmptyState title={t("Hozircha chamadonlar yo'q")}
          hint={admin ? t("«Yangi chamadon» bilan birinchisini yarating va tarkibini darslar jihozlaridan to'ldiring.") : t("Ma'muriyat chamadonlarni kiritganda shu yerda ko'rinadi.")} />
      )}
      <div className="kgrid">
        {data?.map((k) => {
          const ours = k.owned.reduce((n, o) => n + o.quantity, 0)
          return (
            <Link key={k.id} to={`/kits/${k.id}`} className={`kcard ${k.is_active ? '' : 'is-off'}`}>
              {k.cover_url ? <img className="kcard__img" src={k.cover_url} alt="" loading="lazy" referrerPolicy="no-referrer" />
                : <span className="kcard__ph">{IC.cards}</span>}
              <div className="kcard__body">
                <div className="kcard__pills">
                  {k.code && <span className="tag">{k.code}</span>}
                  {!k.is_active && <StatusPill tone="muted">{t('Yashirin')}</StatusPill>}
                  {ours > 0 && <StatusPill tone="ok">✓ {t('Maktabingizda')}{ours > 1 ? ` ×${ours}` : ''}</StatusPill>}
                </div>
                <h3 className="kcard__title">{k.name}</h3>
                {k.description && <p className="kcard__sum">{k.description}</p>}
                <p className="kcard__meta">{k.item_count} {t('xil jihoz')} · {k.pieces} {t('dona')} · {k.lessons_full} {t("ta darsga to'liq yetadi")}</p>
                {admin && k.price != null && <p className="kcard__meta">≈ {som(k.price)}{k.priced_items < k.item_count ? ` (${k.priced_items}/${k.item_count} ${t('narxi bor')})` : ''}</p>}
              </div>
            </Link>
          )
        })}
      </div>
      {creating && <NewKitModal onClose={() => setCreating(false)} />}
    </div>
  )
}

function RequestRow({ r, actions, showRequester }: { r: KitRequest; actions?: React.ReactNode; showRequester?: boolean }) {
  const { t } = useTranslation()
  return (
    <li className="linklist__row">
      <div className="linklist__info">
        <b>{r.kit_name ? `«${r.kit_name}» ×${r.quantity}` : `${r.items.length} ${t('xil jihoz')}`}{r.school_name ? ` · ${r.school_name}` : ''}</b>
        <small>{showRequester ? `${r.requester_name} · ` : ''}{fmtDate(r.created_at)}{r.lesson_title ? ` · ${r.lesson_title}` : ''}</small>
        {!r.kit_name && <small>{r.items.map((i) => `${i.name} ×${i.quantity}`).join(', ')}</small>}
        {r.note && <small>«{r.note}»</small>}
        {r.reply && <small>{t('Javob')}: {r.reply}</small>}
      </div>
      <div className="linklist__acts">
        <StatusPill tone={REQUEST_TONE[r.status]}>{t(r.status_label)}</StatusPill>
        {actions}
      </div>
    </li>
  )
}

function MyRequests() {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const invalidate = useInvalidateKits()
  const { data, isLoading } = useKitRequests()
  const cancel = async (r: KitRequest) => {
    if (!(await confirm({ title: t("So'rovni bekor qilish"), text: r.kit_name || r.items.map((i) => i.name).join(', ') }))) return
    try {
      await api.patch(`/kits/requests/${r.id}/`, { status: 'bekor' })
      invalidate()
    } catch (err) {
      toast(t(errText(err)), 'error')
    }
  }
  if (isLoading) return <Skeleton lines={3} />
  if (!data?.length) return <EmptyState title={t("Hali so'rov yo'q")} hint={t("Chamadon yoki yetishmagan jihozni dars sahifasidan yoki chamadon sahifasidan so'rash mumkin.")} />
  return (
    <section className="panel">
      <ul className="linklist">
        {data.map((r) => <RequestRow key={r.id} r={r} actions={r.status === 'yangi' && (
          <button className="btn btn--sm btn--ghost" onClick={() => cancel(r)}>{t('Bekor qilish')}</button>
        )} />)}
      </ul>
    </section>
  )
}

function AnswerModal({ r, onClose }: { r: KitRequest; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const invalidate = useInvalidateKits()
  const [status, setStatus] = useState<'qabul' | 'rad' | 'yetkazildi'>(r.status === 'qabul' ? 'yetkazildi' : 'qabul')
  const [reply, setReply] = useState(r.reply)
  const [busy, setBusy] = useState(false)
  const send = async () => {
    setBusy(true)
    try {
      await api.patch(`/kits/requests/${r.id}/`, { status, reply })
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
        <button className="btn btn--primary" disabled={busy} onClick={send}>{t('Saqlash')}</button></>}>
      <ul className="linklist"><RequestRow r={r} showRequester /></ul>
      <div className="field">
        <span className="field__label">{t('Javob')}</span>
        <Segmented value={status} onChange={setStatus} options={[
          { value: 'qabul', label: t('Qabul qilish') }, { value: 'rad', label: t('Rad etish') }, { value: 'yetkazildi', label: t('Yetkazildi') },
        ]} />
      </div>
      {status === 'yetkazildi' && r.kit && r.school && (
        <p className="form__note">{t("Chamadon maktabning chamadonlari ro'yxatiga qo'shiladi.")}</p>
      )}
      <label className="field"><span className="field__label">{t("Izoh (o'qituvchiga yuboriladi)")}</span>
        <textarea className="input" rows={3} maxLength={2000} value={reply} placeholder={t("Narx, to'lov va yetkazish sanasi…")}
          onChange={(e) => setReply(e.target.value)} /></label>
    </Modal>
  )
}

function AllRequests() {
  const { t } = useTranslation()
  const [status, setStatus] = useState('open')
  const { data, isLoading } = useKitRequests(true, status === 'all' ? '' : status)
  const [open, setOpen] = useState<KitRequest | null>(null)
  return (
    <div>
      <div className="kbar">
        <Segmented value={status} onChange={setStatus} options={[
          { value: 'open', label: t('Ochiq') }, { value: 'yetkazildi', label: t('Yetkazilgan') }, { value: 'all', label: t('Hammasi') },
        ]} />
      </div>
      {isLoading && <Skeleton lines={4} />}
      {!isLoading && !data?.length && <EmptyState title={t("So'rov yo'q")} />}
      {!!data?.length && (
        <section className="panel">
          <ul className="linklist">
            {data.map((r) => <RequestRow key={r.id} r={r} showRequester actions={(r.status === 'yangi' || r.status === 'qabul') && (
              <button className="btn btn--sm btn--primary" onClick={() => setOpen(r)}>{r.status === 'yangi' ? t('Javob berish') : t('Yangilash')}</button>
            )} />)}
          </ul>
        </section>
      )}
      {open && <AnswerModal r={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

/** Darslar › STEAM chamadonlar — the catalogue, one's requests, and for the
 * administration every request to answer. */
export function KitsPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const admin = isAdmin(user)
  const sub = params.get('sub') ?? 'katalog'
  const set = (v: string) => {
    const next = new URLSearchParams(params)
    if (v === 'katalog') next.delete('sub')
    else next.set('sub', v)
    setParams(next, { replace: true })
  }
  const options = [
    { value: 'katalog', label: t('Katalog') },
    ...(isObserver(user) ? [] : [{ value: 'mening', label: t("Mening so'rovlarim") }]),
    ...(admin ? [{ value: 'sorovlar', label: t("So'rovlar") }] : []),
  ]
  return (
    <div>
      <p className="prose prose--note">{t("Chamadon tarkibi darslar tajribalaridagi jihozlar bilan solishtiriladi: har darsda qaysi chamadon kerakligi va nima yetishmasligi ko'rinadi.")}</p>
      {options.length > 1 && <div className="kbar"><Segmented value={sub} onChange={set} options={options} /></div>}
      {sub === 'mening' ? <MyRequests /> : sub === 'sorovlar' && admin ? <AllRequests /> : <Catalogue />}
    </div>
  )
}
