import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { useConfirm } from '@/components/ConfirmProvider'
import { EmptyState } from '@/components/EmptyState'
import { Modal } from '@/components/Modal'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { errText, fmtDate, PageHead, StatusPill } from '@/features/portal/ui'
import { IC } from '@/icons'
import { api } from '@/lib/api/client'
import { isAdmin, isObserver, useAuth } from '@/lib/auth/AuthContext'

import { som, useInvalidateKits, useKit, type KitDetail, type KitItem } from './api'
import { RequestModal } from './RequestModal'
import './kits.css'

function Paragraphs({ text }: { text: string }) {
  return <div className="prose">{text.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}</div>
}

function EditModal({ kit, onClose }: { kit: KitDetail; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const invalidate = useInvalidateKits()
  const [f, setF] = useState({
    name: kit.name, code: kit.code, description: kit.description, instructions: kit.instructions,
    instructions_url: kit.instructions_url, cover_url: kit.cover_url, is_active: kit.is_active,
  })
  const [busy, setBusy] = useState(false)
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }))
  const save = async () => {
    setBusy(true)
    try {
      await api.patch(`/kits/${kit.id}/`, f)
      invalidate()
      onClose()
    } catch (err) {
      toast(t(errText(err)), 'error')
      setBusy(false)
    }
  }
  return (
    <Modal title={t('Chamadonni tahrirlash')} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>{t('Bekor qilish')}</button>
        <button className="btn btn--primary" disabled={busy || !f.name.trim()} onClick={save}>{t('Saqlash')}</button></>}>
      <div className="kform">
        <label className="field"><span className="field__label">{t('Nomi')}</span>
          <input className="input" maxLength={200} value={f.name} onChange={(e) => set({ name: e.target.value })} /></label>
        <label className="field"><span className="field__label">{t('Kodi')}</span>
          <input className="input" maxLength={32} value={f.code} onChange={(e) => set({ code: e.target.value })} /></label>
      </div>
      <label className="field"><span className="field__label">{t('Qisqacha tavsif')}</span>
        <textarea className="input" rows={2} maxLength={2000} value={f.description} onChange={(e) => set({ description: e.target.value })} /></label>
      <label className="field"><span className="field__label">{t("Yo'riqnoma")}</span>
        <textarea className="input" rows={6} maxLength={20000} value={f.instructions}
          placeholder={t("Chamadonni ochish, jihozlardan foydalanish, xavfsizlik va joyiga yig'ish")}
          onChange={(e) => set({ instructions: e.target.value })} /></label>
      <label className="field"><span className="field__label">{t("Yo'riqnoma havolasi (PDF yoki video, ixtiyoriy)")}</span>
        <input className="input" placeholder="https://…" value={f.instructions_url} onChange={(e) => set({ instructions_url: e.target.value })} /></label>
      <label className="field"><span className="field__label">{t('Rasm havolasi (ixtiyoriy)')}</span>
        <input className="input" placeholder="https://…" value={f.cover_url} onChange={(e) => set({ cover_url: e.target.value })} /></label>
      <label className="kcheck"><input type="checkbox" checked={f.is_active} onChange={(e) => set({ is_active: e.target.checked })} /> {t("O'qituvchilarga ko'rinadi")}</label>
    </Modal>
  )
}

function ItemsModal({ kit, onClose }: { kit: KitDetail; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const invalidate = useInvalidateKits()
  const [items, setItems] = useState<KitItem[]>(kit.items.map(({ name, quantity }) => ({ name, quantity })))
  const [busy, setBusy] = useState(false)
  const set = (i: number, patch: Partial<KitItem>) => setItems((list) => list.map((x, k) => (k === i ? { ...x, ...patch } : x)))
  const save = async () => {
    setBusy(true)
    try {
      await api.put(`/kits/${kit.id}/items/`, { items: items.filter((i) => i.name.trim()) })
      invalidate()
      onClose()
    } catch (err) {
      toast(t(errText(err)), 'error')
      setBusy(false)
    }
  }
  return (
    <Modal title={t('Chamadon tarkibi')} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>{t('Bekor qilish')}</button>
        <button className="btn btn--primary" disabled={busy} onClick={save}>{t('Saqlash')}</button></>}>
      <p className="form__note">{t("Nomlar darslardagi jihoz nomlari bilan solishtiriladi (katta-kichik harf va tutuq belgisi farq qilmaydi).")}</p>
      <ul className="kitems">
        {items.map((it, i) => (
          <li key={i}>
            <input className="input" placeholder={t('Jihoz nomi')} maxLength={255} value={it.name} onChange={(e) => set(i, { name: e.target.value })} />
            <input className="input" type="number" min={1} max={1000} value={it.quantity} aria-label={t('Soni')}
              onChange={(e) => set(i, { quantity: Math.max(1, Number(e.target.value) || 1) })} />
            <button type="button" className="icon-btn" aria-label={t("O'chirish")} onClick={() => setItems(items.filter((_, k) => k !== i))}>{IC.trash}</button>
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn--sm" onClick={() => setItems([...items, { name: '', quantity: 1 }])}>+ {t("Jihoz qo'shish")}</button>
    </Modal>
  )
}

function FillModal({ kit, onClose }: { kit: KitDetail; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const qc = useQueryClient()
  const [grade, setGrade] = useState('')
  const [chorak, setChorak] = useState('')
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true)
    try {
      const res = await api.post<{ added: number }>(`/kits/${kit.id}/fill/`, { grade, chorak: chorak || null })
      qc.invalidateQueries({ queryKey: ['kits'] })
      toast(`${t("Qo'shildi")}: ${res.data.added}`)
      onClose()
    } catch (err) {
      toast(t(errText(err)), 'error')
      setBusy(false)
    }
  }
  return (
    <Modal title={t("Darslar jihozlaridan to'ldirish")} onClose={onClose} narrow
      footer={<><button className="btn" onClick={onClose}>{t('Bekor qilish')}</button>
        <button className="btn btn--primary" disabled={busy || !grade} onClick={run}>{t("To'ldirish")}</button></>}>
      <p className="form__note">{t("Tanlangan darslar tajribalarida ishlatiladigan barcha jihozlar qo'shiladi: har biri eng ko'p kerak bo'lgan darsdagi sonda. Bor jihozlar kamaymaydi.")}</p>
      <label className="field"><span className="field__label">{t('Sinf')}</span>
        <select className="input" value={grade} onChange={(e) => setGrade(e.target.value)}>
          <option value="">—</option>
          {kit.grades?.map((g) => <option key={g.value} value={g.value}>{t(g.label)}</option>)}
        </select></label>
      <label className="field"><span className="field__label">{t('Chorak (ixtiyoriy)')}</span>
        <select className="input" value={chorak} onChange={(e) => setChorak(e.target.value)}>
          <option value="">{t('Butun yil')}</option>
          {[1, 2, 3, 4].map((c) => <option key={c} value={c}>{c}-{t('chorak')}</option>)}
        </select></label>
    </Modal>
  )
}

/** One STEM chamadon: what is inside, how to use it, which lessons it
 * serves, which schools have it — and asking for one. */
export function KitPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const invalidate = useInvalidateKits()
  const { user } = useAuth()
  const admin = isAdmin(user)
  const { data: kit, isLoading, isError } = useKit(id)
  const [modal, setModal] = useState<'edit' | 'items' | 'fill' | 'ask' | null>(null)

  if (isLoading) return <Skeleton lines={6} />
  if (isError || !kit) return <EmptyState title={t('Chamadon topilmadi')} action={<Link className="btn" to="/lessons?bolim=chamadonlar">{t('STEM chamadonlar')}</Link>} />

  const ours = kit.owned.reduce((n, o) => n + o.quantity, 0)
  const total = kit.items.reduce((s, i) => s + (i.price != null ? i.price * i.quantity : 0), 0)
  // the price column only once the equipment catalogue has prices
  const priced = admin && kit.items.some((i) => i.price != null)
  const remove = async () => {
    if (!(await confirm({ title: t("Chamadonni o'chirish"), text: kit.name, danger: true }))) return
    try {
      await api.delete(`/kits/${kit.id}/`)
      invalidate()
      navigate('/lessons?bolim=chamadonlar')
    } catch (err) {
      toast(t(errText(err)), 'error')
    }
  }

  return (
    <div>
      <Link className="backlink" to="/lessons?bolim=chamadonlar">← {t('STEM chamadonlar')}</Link>
      <PageHead title={kit.name} sub={kit.description || undefined}
        actions={<>
          {!isObserver(user) && <button className="btn btn--primary" onClick={() => setModal('ask')}>{t("Chamadon so'rash")}</button>}
          {admin && <button className="btn" onClick={() => setModal('edit')}>{IC.edit} {t('Tahrirlash')}</button>}
          {admin && <button className="btn btn--ghost" onClick={remove}>{IC.trash}</button>}
        </>} />
      <div className="kpills">
        {kit.code && <span className="tag">{kit.code}</span>}
        {!kit.is_active && <StatusPill tone="muted">{t('Yashirin')}</StatusPill>}
        {kit.owned.map((o) => <StatusPill key={o.id} tone="ok">✓ {o.name}{o.quantity > 1 ? ` ×${o.quantity}` : ''}</StatusPill>)}
        {!ours && kit.my_schools.length > 0 && <StatusPill tone="mid">{t("Maktabingizda yo'q")}</StatusPill>}
      </div>

      {(kit.instructions || kit.instructions_url) && (
        <section className="panel">
          <h3 className="panel__title">{t("Yo'riqnoma")}</h3>
          {kit.instructions && <Paragraphs text={kit.instructions} />}
          {kit.instructions_url && <a className="btn btn--sm" href={kit.instructions_url} target="_blank" rel="noreferrer noopener">{IC.external} {t("Yo'riqnomani ochish")}</a>}
        </section>
      )}

      <section className="panel">
        <div className="thead">
          <h3 className="panel__title">{t('Tarkibi')} · {kit.items.length} {t('xil jihoz')}</h3>
          {admin && <span className="kacts">
            <button className="btn btn--sm" onClick={() => setModal('fill')}>{t("Darslardan to'ldirish")}</button>
            <button className="btn btn--sm btn--primary" onClick={() => setModal('items')}>{IC.edit} {t('Tarkibni tahrirlash')}</button>
          </span>}
        </div>
        {!kit.items.length ? <p className="prose prose--note">{t("Tarkib hali kiritilmagan.")}</p> : (
          <div className="tablewrap">
            <table className="dtable">
              <thead><tr><th /><th>{t('Jihoz')}</th><th>{t('Soni')}</th>{priced && <th>{t('Narxi')}</th>}</tr></thead>
              <tbody>
                {kit.items.map((i) => (
                  <tr key={i.id ?? i.name}>
                    <td className="kitem__img">{i.image ? <img src={i.image} alt="" loading="lazy" /> : null}</td>
                    <td>{i.name}</td>
                    <td>{i.quantity}</td>
                    {priced && <td>{i.price != null ? som(i.price * i.quantity) : '—'}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {admin && total > 0 && <p className="kcard__meta">{t('Jami (narxi kiritilgan jihozlar)')}: <b>{som(total)}</b></p>}
      </section>

      <section className="panel">
        <h3 className="panel__title">{t('Qaysi darslarga yetadi')}</h3>
        {!kit.lessons.length ? <p className="prose prose--note">{t("Tarkib hech bir dars jihozlariga mos kelmadi.")}</p> : (
          <ul className="klessons">
            {kit.lessons.map((l) => (
              <li key={l.id}>
                <Link to={`/lessons/${l.id}`}>{l.grade}-{t('sinf')} · {l.chorak}-{t('chorak')} · {l.hafta}-{t('hafta')}: {l.title}</Link>
                {l.percent === 100 ? <StatusPill tone="ok">✓ {t("to'liq")}</StatusPill>
                  : <StatusPill tone="mid">{l.percent}% · {l.missing} {t('xil yetishmaydi')}</StatusPill>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {admin && kit.schools && (
        <section className="panel">
          <h3 className="panel__title">{t('Qaysi maktablarda bor')}</h3>
          {!kit.schools.length ? <p className="prose prose--note">{t("Hali hech bir maktabga berilmagan. Maktab sahifasidan qo'shiladi yoki so'rov «yetkazildi» bo'lganda o'zi qo'shiladi.")}</p> : (
            <ul className="klessons">
              {kit.schools.map((s) => (
                <li key={s.id}><Link to={`/manage/schools/${s.id}`}>{s.name}</Link><span>×{s.quantity}{s.received_on ? ` · ${fmtDate(s.received_on)}` : ''}</span></li>
              ))}
            </ul>
          )}
        </section>
      )}

      {modal === 'edit' && <EditModal kit={kit} onClose={() => setModal(null)} />}
      {modal === 'items' && <ItemsModal kit={kit} onClose={() => setModal(null)} />}
      {modal === 'fill' && <FillModal kit={kit} onClose={() => setModal(null)} />}
      {modal === 'ask' && <RequestModal kit={{ id: kit.id, name: kit.name }} schools={kit.my_schools} onClose={() => setModal(null)} />}
    </div>
  )
}
