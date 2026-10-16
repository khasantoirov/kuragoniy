import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useConfirm } from '@/components/ConfirmProvider'
import { EmptyState } from '@/components/EmptyState'
import { Modal } from '@/components/Modal'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { ColumnChart } from '@/features/portal/ColumnChart'
import { downloadCsv } from '@/features/portal/csv'
import { compact, errText, fmtDate, fmtDateTime, fmtMoney, PageHead, Segmented, StatTile, StatusPill } from '@/features/portal/ui'
import { IC } from '@/icons'
import { api } from '@/lib/api/client'
import { isAdmin, useAuth } from '@/lib/auth/AuthContext'

import { KIND_LABEL, ORDER_STATUS, useOrders, useProducts, useShopSettings, type Order, type Product, type ProductKind } from './api'
import { GRADES, type Grade } from '@/features/lessons/labels'

const EMPTY: Partial<Product> = { kind: 'ishlanma', delivery: 'digital', title: '', short: '', description: '', price: 0, old_price: null, cover_url: '', preview_url: '', content_url: '', content_note: '', stock: null, is_active: true, grade: null }

function ProductEditor({ initial, onClose }: { initial: Partial<Product>; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const qc = useQueryClient()
  const [p, setP] = useState<Partial<Product>>(initial)
  const set = (patch: Partial<Product>) => setP({ ...p, ...patch })
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setBusy(true)
    try {
      if (p.id) await api.patch(`/shop/products/${p.id}/`, p)
      else await api.post('/shop/products/', p)
      qc.invalidateQueries({ queryKey: ['shop'] })
      toast(t('Saqlandi'))
      onClose()
    } catch (err) {
      toast(t(errText(err)), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={p.id ? t('Mahsulotni tahrirlash') : t('Yangi mahsulot')} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>{t('Bekor qilish')}</button><button className="btn btn--primary" disabled={busy} onClick={save}>{t('Saqlash')}</button></>}>
      <label className="field"><span className="field__label">{t('Nomi')}</span>
        <input className="input" maxLength={200} value={p.title} onChange={(e) => set({ title: e.target.value })} /></label>
      <div className="row row--3">
        <label className="field"><span className="field__label">{t('Turi')}</span>
          <select className="input" value={p.kind} onChange={(e) => set({ kind: e.target.value as ProductKind })}>
            {(Object.keys(KIND_LABEL) as ProductKind[]).map((k) => <option key={k} value={k}>{t(KIND_LABEL[k])}</option>)}
          </select></label>
        <label className="field"><span className="field__label">{t('Yetkazish')}</span>
          <select className="input" value={p.delivery} onChange={(e) => set({ delivery: e.target.value as Product['delivery'] })}>
            <option value="digital">{t('Elektron (havola)')}</option><option value="physical">{t('Jismoniy')}</option>
          </select></label>
        <label className="field"><span className="field__label">{t('Sinf')}</span>
          <select className="input" value={p.grade ?? ''} onChange={(e) => set({ grade: (e.target.value || null) as Grade | null })}>
            <option value="">—</option>{GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
          </select></label>
      </div>
      <div className="row row--3">
        <label className="field"><span className="field__label">{t("Narx (so'm)")}</span>
          <input className="input" type="number" min={0} value={p.price ?? 0} onChange={(e) => set({ price: Number(e.target.value) })} /></label>
        <label className="field"><span className="field__label">{t('Eski narx (chegirma uchun)')}</span>
          <input className="input" type="number" min={0} value={p.old_price ?? ''} onChange={(e) => set({ old_price: e.target.value ? Number(e.target.value) : null })} /></label>
        {p.delivery === 'physical' && <label className="field"><span className="field__label">{t('Omborda (bo\'sh = cheksiz)')}</span>
          <input className="input" type="number" min={0} value={p.stock ?? ''} onChange={(e) => set({ stock: e.target.value ? Number(e.target.value) : null })} /></label>}
      </div>
      <label className="field"><span className="field__label">{t('Qisqa tavsif')}</span>
        <input className="input" maxLength={300} value={p.short} onChange={(e) => set({ short: e.target.value })} /></label>
      <label className="field"><span className="field__label">{t("To'liq tavsif")}</span>
        <textarea className="input" rows={4} value={p.description} onChange={(e) => set({ description: e.target.value })} /></label>
      <div className="row row--2">
        <label className="field"><span className="field__label">{t('Muqova rasmi havolasi')}</span>
          <input className="input" type="url" value={p.cover_url} onChange={(e) => set({ cover_url: e.target.value })} /></label>
        <label className="field"><span className="field__label">{t('Bepul namuna havolasi')}</span>
          <input className="input" type="url" value={p.preview_url} onChange={(e) => set({ preview_url: e.target.value })} /></label>
      </div>
      <fieldset className="secretbox">
        <legend>🔒 {t("Faqat xaridorga ko'rinadi")}</legend>
        <label className="field"><span className="field__label">{t('Material havolasi (Google Drive va h.k.)')}</span>
          <input className="input" type="url" value={p.content_url} onChange={(e) => set({ content_url: e.target.value })} /></label>
        <label className="field"><span className="field__label">{t("Xariddan keyingi ko'rsatma")}</span>
          <textarea className="input" rows={2} value={p.content_note} onChange={(e) => set({ content_note: e.target.value })} /></label>
      </fieldset>
      <label className="check"><input type="checkbox" checked={!!p.is_active} onChange={(e) => set({ is_active: e.target.checked })} /><span>{t("Do'konda ko'rinsin")}</span></label>
    </Modal>
  )
}

function OrdersTab({ admin }: { admin: boolean }) {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const [status, setStatus] = useState('review')
  const { data, isLoading } = useOrders({ all: '1', status: status === 'all' ? undefined : status })

  const act = async (o: Order, action: string) => {
    if (action !== 'confirm' && action !== 'deliver' && !(await confirm({ title: t('Tasdiqlang'), text: `${o.number} — ${action}`, danger: true }))) return
    try {
      await api.post(`/shop/orders/${o.id}/${action}/`)
      qc.invalidateQueries({ queryKey: ['shop'] })
      toast(t('Bajarildi'))
    } catch (err) {
      toast(t(errText(err)), 'error')
    }
  }

  return (
    <>
      <div className="filters">
        <Segmented value={status} onChange={setStatus} options={[
          { value: 'review', label: t('Tekshirish kerak') }, { value: 'pending', label: t("To'lov kutilmoqda") }, { value: 'paid', label: t("To'langan") },
          { value: 'delivered', label: t('Yetkazilgan') }, { value: 'all', label: t('Hammasi') },
        ]} />
      </div>
      {isLoading ? <Skeleton lines={4} /> : !data?.length ? <EmptyState title={t("Buyurtma yo'q")} /> : (
        <div className="tablewrap">
          <table className="dtable">
            <thead><tr><th>{t('Raqam')}</th><th>{t('Xaridor')}</th><th>{t('Mahsulot')}</th><th>{t('Summa')}</th><th>{t("To'lov ma'lumoti")}</th><th>{t('Holat')}</th><th /></tr></thead>
            <tbody>
              {data.map((o) => (
                <tr key={o.id}>
                  <td className="mono">{o.number}<br /><small>{fmtDateTime(o.created_at)}</small></td>
                  <td>{o.buyer_name}<br /><small>{o.phone || o.buyer_phone}</small></td>
                  <td>{o.items.map((i) => `${i.title}${i.quantity > 1 ? ` ×${i.quantity}` : ''}`).join(', ')}{o.delivery_address && <><br /><small>📦 {o.delivery_address}</small></>}</td>
                  <td>{fmtMoney(o.total)}</td>
                  <td className="dtable__wrap">{o.payment_note || '—'}{o.payment_receipt_url && <> <a href={o.payment_receipt_url} target="_blank" rel="noopener noreferrer">{IC.external} {t('chek')}</a></>}</td>
                  <td><StatusPill tone={ORDER_STATUS[o.status].tone}>{t(ORDER_STATUS[o.status].label)}</StatusPill></td>
                  <td className="dtable__acts">
                    {admin && (o.status === 'review' || o.status === 'pending') && <>
                      <button className="btn btn--sm btn--primary" onClick={() => act(o, 'confirm')}>{t('Tasdiqlash')}</button>
                      <button className="btn btn--sm btn--ghost" onClick={() => act(o, 'cancel')}>{t('Bekor')}</button>
                    </>}
                    {admin && o.status === 'paid' && o.delivery_address && <button className="btn btn--sm" onClick={() => act(o, 'deliver')}>{t('Yetkazildi')}</button>}
                    {admin && (o.status === 'paid' || o.status === 'delivered') && <button className="btn btn--sm btn--ghost" onClick={() => act(o, 'refund')}>{t('Qaytarish')}</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

function SettingsTab() {
  const { t } = useTranslation()
  const toast = useToast()
  const qc = useQueryClient()
  const { data } = useShopSettings()
  const [s, setS] = useState(data)
  useEffect(() => setS(data), [data])
  if (!s) return <Skeleton lines={4} />
  const save = async () => {
    try {
      await api.put('/shop/settings/', s)
      qc.invalidateQueries({ queryKey: ['shop', 'settings'] })
      toast(t('Saqlandi'))
    } catch (err) {
      toast(t(errText(err)), 'error')
    }
  }
  return (
    <section className="panel">
      <label className="check"><input type="checkbox" checked={s.is_open} onChange={(e) => setS({ ...s, is_open: e.target.checked })} /><span>{t("Do'kon ochiq (buyurtma qabul qilinadi)")}</span></label>
      <div className="row row--2">
        <label className="field"><span className="field__label">{t('Karta raqami')}</span><input className="input mono" value={s.card_number} onChange={(e) => setS({ ...s, card_number: e.target.value })} placeholder="8600 0000 0000 0000" /></label>
        <label className="field"><span className="field__label">{t('Karta egasi')}</span><input className="input" value={s.card_holder} onChange={(e) => setS({ ...s, card_holder: e.target.value })} /></label>
      </div>
      <label className="field"><span className="field__label">{t("To'lov bo'yicha ko'rsatma")}</span><textarea className="input" rows={3} value={s.payment_instructions} onChange={(e) => setS({ ...s, payment_instructions: e.target.value })} /></label>
      <div className="row row--2">
        <label className="field"><span className="field__label">{t('Aloqa telefoni')}</span><input className="input" value={s.contact_phone} onChange={(e) => setS({ ...s, contact_phone: e.target.value })} /></label>
        <label className="field"><span className="field__label">Telegram</span><input className="input" value={s.contact_telegram} onChange={(e) => setS({ ...s, contact_telegram: e.target.value })} placeholder="@..." /></label>
      </div>
      <button className="btn btn--primary" onClick={save}>{t('Saqlash')}</button>
      <p className="form__note">{t("Payme/Click orqali avtomatik to'lov uchun merchant hisob ochilgach ulanadi — hozircha to'lovni administrator qo'lda tasdiqlaydi.")}</p>
    </section>
  )
}

interface ShopStats {
  revenue: number
  orders_paid: number
  buyers: number
  by_status: Record<string, number>
  by_month: { month: string; revenue: number; orders: number }[]
  top_products: { product: number; title: string; qty: number; revenue: number }[]
}

function StatsTab() {
  const { t } = useTranslation()
  const { data } = useQuery({ queryKey: ['shop', 'stats'], queryFn: async () => (await api.get<ShopStats>('/shop/stats/')).data })
  if (!data) return <Skeleton lines={4} />
  return (
    <>
      <div className="stiles">
        <StatTile label={t('Jami tushum')} value={fmtMoney(data.revenue)} />
        <StatTile label={t("To'langan buyurtmalar")} value={data.orders_paid} />
        <StatTile label={t('Xaridorlar')} value={data.buyers} />
        <StatTile label={t('Tekshirish kutilmoqda')} value={data.by_status.review ?? 0} tone={(data.by_status.review ?? 0) ? 'warn' : undefined} />
      </div>
      {data.by_month.length > 0 && (
        <section className="panel">
          <h3 className="panel__title">{t("Oylik tushum, so'm")}</h3>
          <ColumnChart ariaLabel={t("Oylik tushum, so'm")} format={compact}
            data={data.by_month.map((m) => ({ label: fmtDate(m.month).slice(3), value: m.revenue, note: `${m.orders} ${t('buyurtma')}` }))} />
        </section>
      )}
      <section className="panel">
        <div className="thead">
          <h3 className="panel__title">{t('Eng ko\'p sotilganlar')}</h3>
          {data.top_products.length > 0 && <button className="btn btn--sm btn--ghost" onClick={() => downloadCsv('sotuvlar', [t('Mahsulot'), t('Soni'), t('Tushum')], data.top_products.map((p) => [p.title, p.qty, p.revenue]))}>{IC.download} CSV</button>}
        </div>
        <table className="dtable">
          <thead><tr><th>{t('Mahsulot')}</th><th>{t('Soni')}</th><th>{t('Tushum')}</th></tr></thead>
          <tbody>{data.top_products.map((p) => <tr key={p.product}><td>{p.title}</td><td>{p.qty}</td><td>{fmtMoney(p.revenue)}</td></tr>)}</tbody>
        </table>
      </section>
    </>
  )
}

/** "Sotuv bo'limi" — orders to confirm, catalogue, payment details, stats. */
export function ShopAdminPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const admin = isAdmin(user)
  const [tab, setTab] = useState<'orders' | 'products' | 'settings' | 'stats'>('orders')
  const products = useProducts({ all: '1' })
  const [editing, setEditing] = useState<Partial<Product> | null>(null)

  return (
    <div>
      <PageHead title={t("Sotuv bo'limi")} sub={t("Buyurtmalarni tasdiqlang, mahsulotlarni boshqaring, tushumni kuzating.")}
        actions={<Segmented value={tab} onChange={setTab} options={[
          { value: 'orders', label: t('Buyurtmalar') }, { value: 'products', label: t('Mahsulotlar') },
          ...(admin ? [{ value: 'settings' as const, label: t("To'lov sozlamalari") }] : []), { value: 'stats', label: t('Statistika') },
        ]} />} />
      {tab === 'orders' && <OrdersTab admin={admin} />}
      {tab === 'settings' && admin && <SettingsTab />}
      {tab === 'stats' && <StatsTab />}
      {tab === 'products' && (
        <>
          {admin && <div className="panel__acts" style={{ marginBottom: 12 }}><button className="btn btn--primary" onClick={() => setEditing(EMPTY)}>+ {t('Mahsulot')}</button></div>}
          {products.isLoading ? <Skeleton lines={4} /> : (
            <div className="tablewrap">
              <table className="dtable">
                <thead><tr><th>{t('Nomi')}</th><th>{t('Turi')}</th><th>{t('Narx')}</th><th>{t('Sotildi')}</th><th>{t('Holat')}</th><th /></tr></thead>
                <tbody>
                  {products.data?.map((p) => (
                    <tr key={p.id} className={p.is_active ? '' : 'is-dim'}>
                      <td>{p.title}</td><td>{t(KIND_LABEL[p.kind])}</td><td>{fmtMoney(p.price)}</td><td>{p.sales ?? 0}</td>
                      <td>{p.is_active ? <StatusPill tone="ok">{t('Sotuvda')}</StatusPill> : <StatusPill tone="muted">{t('Yashirin')}</StatusPill>}</td>
                      <td>{admin && <button className="btn btn--sm btn--ghost" onClick={() => setEditing(p)}>{IC.edit}</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {editing && <ProductEditor initial={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
