import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'

import { EmptyState } from '@/components/EmptyState'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { errText, fmtDateTime, fmtMoney, PageHead, Segmented, StatusPill } from '@/features/portal/ui'
import { IC } from '@/icons'
import { api } from '@/lib/api/client'

import { KIND_LABEL, ORDER_STATUS, useOrders, usePurchases, useShopSettings, type Order } from './api'

function PayBox({ order }: { order: Order }) {
  const { t } = useTranslation()
  const toast = useToast()
  const qc = useQueryClient()
  const settings = useShopSettings()
  const [note, setNote] = useState(order.payment_note)
  const [receipt, setReceipt] = useState(order.payment_receipt_url)
  const [busy, setBusy] = useState(false)
  const s = settings.data

  const report = async () => {
    setBusy(true)
    try {
      await api.post(`/shop/orders/${order.id}/report-payment/`, { payment_note: note, payment_receipt_url: receipt })
      qc.invalidateQueries({ queryKey: ['shop'] })
      toast(t("Rahmat! Administrator to'lovni tekshirib, tasdiqlaydi."))
    } catch (err) {
      toast(t(errText(err)), 'error')
    } finally {
      setBusy(false)
    }
  }

  const cancel = async () => {
    try {
      await api.post(`/shop/orders/${order.id}/cancel/`)
      qc.invalidateQueries({ queryKey: ['shop'] })
    } catch (err) {
      toast(t(errText(err)), 'error')
    }
  }

  return (
    <div className="paybox">
      <p className="paybox__sum">{t("To'lov summasi")}: <b>{fmtMoney(order.total)}</b></p>
      {s?.card_number ? (
        <div className="paybox__card">
          <span className="mono">{s.card_number}</span>
          <button className="btn btn--sm btn--ghost" onClick={async () => { await navigator.clipboard.writeText(s.card_number.replace(/\s/g, '')).catch(() => {}); toast(t('Nusxalandi')) }}>{IC.copy}</button>
          <small>{s.card_holder}</small>
        </div>
      ) : <p className="form__note">{t("To'lov rekvizitlari hali kiritilmagan — administrator bilan bog'laning.")}</p>}
      {s?.payment_instructions && <p className="prose prose--note" style={{ whiteSpace: 'pre-wrap' }}>{s.payment_instructions}</p>}
      <p className="form__note">{t('Izohga buyurtma raqamini yozing')}: <b className="mono">{order.number}</b></p>
      <label className="field">
        <span className="field__label">{t("To'lov haqida (vaqt, summa, kartaning oxirgi 4 raqami)")}</span>
        <input className="input" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <label className="field">
        <span className="field__label">{t('Chek havolasi (ixtiyoriy)')}</span>
        <input className="input" type="url" placeholder="https://…" value={receipt} onChange={(e) => setReceipt(e.target.value)} />
      </label>
      <div className="panel__acts">
        <button className="btn btn--primary" disabled={busy} onClick={report}>{order.status === 'review' ? t("Ma'lumotni yangilash") : t("To'ladim")}</button>
        <button className="btn btn--ghost" onClick={cancel}>{t('Bekor qilish')}</button>
      </div>
      {(s?.contact_phone || s?.contact_telegram) && (
        <p className="form__note">{t('Savollar uchun')}: {s.contact_phone} {s.contact_telegram && `· ${s.contact_telegram}`}</p>
      )}
    </div>
  )
}

export function OrdersPage() {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const [tab, setTab] = useState<'orders' | 'purchases'>(params.get('tab') === 'purchases' ? 'purchases' : 'orders')
  const openId = Number(params.get('open')) || null
  const orders = useOrders()
  const purchases = usePurchases()

  return (
    <div>
      <Link to="/shop" className="backlink">← {t("Do'kon")}</Link>
      <PageHead title={t('Buyurtmalarim')} actions={<Segmented value={tab} onChange={setTab} options={[
        { value: 'orders', label: t('Buyurtmalar') }, { value: 'purchases', label: t('Xaridlarim') },
      ]} />} />
      {tab === 'purchases' ? (
        purchases.isLoading ? <Skeleton lines={4} /> : !purchases.data?.length ? <EmptyState title={t("Hali xarid yo'q")} /> : (
          <div className="rlist">
            {purchases.data.map((p) => (
              <article key={p.product} className="rcard">
                <header className="rcard__head">
                  <div><p className="rcard__meta">{t(KIND_LABEL[p.kind])} · {p.order}</p><h4 className="rcard__title">{p.title}</h4></div>
                </header>
                {p.content_note && <p className="rcard__sum" style={{ whiteSpace: 'pre-wrap' }}>{p.content_note}</p>}
                {p.content_url
                  ? <a className="btn btn--primary" href={p.content_url} target="_blank" rel="noopener noreferrer">{IC.external} {t('Materialni ochish')}</a>
                  : p.delivery === 'physical' && <p className="form__note">{t("Jismoniy mahsulot — yetkazib beriladi.")}</p>}
              </article>
            ))}
          </div>
        )
      ) : orders.isLoading ? <Skeleton lines={4} /> : !orders.data?.length ? <EmptyState title={t("Buyurtma yo'q")} /> : (
        <div className="rlist">
          {orders.data.map((o) => (
            <article key={o.id} className={`rcard ${openId === o.id ? 'is-focus' : ''}`}>
              <header className="rcard__head">
                <div>
                  <p className="rcard__meta">{o.number} · {fmtDateTime(o.created_at)}</p>
                  <h4 className="rcard__title">{o.items.map((i) => i.title).join(', ')}</h4>
                </div>
                <StatusPill tone={ORDER_STATUS[o.status].tone}>{t(ORDER_STATUS[o.status].label)}</StatusPill>
              </header>
              <p className="rcard__line"><span>{t('Jami')}:</span> {fmtMoney(o.total)}</p>
              {o.admin_note && <p className="rcard__line"><span>{t('Izoh')}:</span> {o.admin_note}</p>}
              {(o.status === 'pending' || o.status === 'review') && <PayBox order={o} />}
              {(o.status === 'paid' || o.status === 'delivered') && <button className="btn btn--sm" onClick={() => setTab('purchases')}>{t('Xaridlarimga o\'tish')}</button>}
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
