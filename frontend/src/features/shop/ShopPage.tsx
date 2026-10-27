import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'

import { EmptyState } from '@/components/EmptyState'
import { Modal } from '@/components/Modal'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { errText, fmtMoney, PageHead } from '@/features/portal/ui'
import { IC } from '@/icons'
import { api } from '@/lib/api/client'
import { isTeacherLike, useAuth } from '@/lib/auth/AuthContext'

import { KIND_LABEL, useCart, useProducts, useShopSettings, type Order, type Product, type ProductKind } from './api'
import { GRADES } from '@/features/lessons/labels'

function ProductModal({ p, onClose }: { p: Product; onClose: () => void }) {
  const { t } = useTranslation()
  const add = useCart((s) => s.add)
  const inCart = useCart((s) => !!s.items[p.id])
  const toast = useToast()
  return (
    <Modal title={p.title} onClose={onClose}
      footer={p.purchased && p.delivery === 'digital' ? (
        <Link className="btn btn--primary" to="/shop?bolim=orders&tab=purchases" onClick={onClose}>{t('Xaridlarimda ochish')}</Link>
      ) : (
        <button className="btn btn--primary" disabled={inCart && p.delivery === 'digital'} onClick={() => { add(p.id); toast(t("Savatga qo'shildi")); onClose() }}>
          {inCart && p.delivery === 'digital' ? t('Savatda') : `${t("Savatga qo'shish")} · ${fmtMoney(p.price)}`}
        </button>
      )}>
      {p.cover_url && <img className="pmodal__cover" src={p.cover_url} alt="" referrerPolicy="no-referrer" />}
      <p className="pmodal__meta">{t(KIND_LABEL[p.kind])}{p.grade ? ` · ${p.grade}-${t('sinf')}` : ''} · {p.delivery === 'digital' ? t('Elektron') : t('Yetkazib beriladi')}</p>
      <p className="prose" style={{ whiteSpace: 'pre-wrap' }}>{p.description || p.short}</p>
      {p.preview_url && <a className="btn btn--sm" href={p.preview_url} target="_blank" rel="noopener noreferrer">{IC.eye} {t('Namunani ko\'rish')}</a>}
      {p.stock != null && p.delivery === 'physical' && <p className="form__note">{t('Omborda')}: {p.stock}</p>}
    </Modal>
  )
}

function Cart({ products, onClose }: { products: Product[]; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { items, setQty, remove, clear } = useCart()
  const settings = useShopSettings()
  const lines = Object.entries(items).map(([id, qty]) => ({ p: products.find((x) => x.id === Number(id)), qty })).filter((l) => l.p) as { p: Product; qty: number }[]
  const total = lines.reduce((s, l) => s + l.p.price * l.qty, 0)
  const physical = lines.some((l) => l.p.delivery === 'physical')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [busy, setBusy] = useState(false)

  const order = async () => {
    setBusy(true)
    try {
      const res = await api.post<Order>('/shop/orders/', {
        items: lines.map((l) => ({ product: l.p.id, quantity: l.qty })),
        phone, delivery_address: address,
      })
      clear()
      qc.invalidateQueries({ queryKey: ['shop'] })
      toast(res.data.status === 'paid' ? t('Tayyor! Xaridlaringizda.') : t('Buyurtma qabul qilindi — endi to\'lovni amalga oshiring.'))
      onClose()
      navigate(`/shop?bolim=orders&open=${res.data.id}`)
    } catch (err) {
      toast(t(errText(err)), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={t('Savat')} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>{t('Davom etish')}</button>
        <button className="btn btn--primary" disabled={!lines.length || busy || settings.data?.is_open === false} onClick={order}>{t('Buyurtma berish')} · {fmtMoney(total)}</button></>}>
      {settings.data?.is_open === false && <p className="form__note form__note--err">{t("Do'kon vaqtincha yopiq.")}</p>}
      {!lines.length ? <p className="prose">{t("Savat bo'sh.")}</p> : (
        <ul className="cart">
          {lines.map(({ p, qty }) => (
            <li key={p.id} className="cart__row">
              <span className="cart__title">{p.title}</span>
              {p.delivery === 'physical' ? (
                <input className="input input--sm cart__qty" type="number" min={1} max={50} value={qty} onChange={(e) => setQty(p.id, Number(e.target.value))} />
              ) : <span className="cart__qty">1</span>}
              <span className="cart__sum">{fmtMoney(p.price * qty)}</span>
              <button className="icon-btn" onClick={() => remove(p.id)} aria-label={t("O'chirish")}>{IC.close}</button>
            </li>
          ))}
        </ul>
      )}
      {physical && (
        <div className="row row--2">
          <label className="field"><span className="field__label">{t('Telefon')}</span>
            <input className="input" type="tel" placeholder="+998 90 123 45 67" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
          <label className="field"><span className="field__label">{t('Yetkazish manzili')}</span>
            <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} /></label>
        </div>
      )}
      <p className="form__note">{t("Buyurtmadan keyin karta orqali to'lov qilasiz; administrator tasdiqlagach, material «Xaridlarim»da ochiladi.")}</p>
    </Modal>
  )
}

export function ShopPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [kind, setKind] = useState<ProductKind | ''>('')
  const [grade, setGrade] = useState('')
  const [q, setQ] = useState('')
  const { data, isLoading } = useProducts({ kind: kind || undefined, grade: grade || undefined, q: q || undefined })
  const all = useProducts()
  const cartCount = useCart((s) => Object.keys(s.items).length)
  const [open, setOpen] = useState<Product | null>(null)
  const [cartOpen, setCartOpen] = useState(false)
  const canBuy = isTeacherLike(user)

  return (
    <div>
      <PageHead title={t("Do'kon")} sub={t("Tayyor dars ishlanmalari, tajriba qo'llanmalari va jihozlar to'plamlari.")}
        actions={<>
          <Link className="btn" to="/shop?bolim=orders">{IC.list} {t('Buyurtmalarim')}</Link>
          {canBuy && <button className="btn btn--primary" onClick={() => setCartOpen(true)}>🛒 {t('Savat')} {cartCount > 0 && <span className="badge">{cartCount}</span>}</button>}
        </>} />
      <div className="filters">
        <div className="chips">
          <button className={`chip ${kind === '' ? 'is-on' : ''}`} onClick={() => setKind('')}>{t('Hammasi')}</button>
          {(Object.keys(KIND_LABEL) as ProductKind[]).map((k) => (
            <button key={k} className={`chip ${kind === k ? 'is-on' : ''}`} onClick={() => setKind(k)}>{t(KIND_LABEL[k])}</button>
          ))}
        </div>
        <select className="input input--sm" value={grade} onChange={(e) => setGrade(e.target.value)}>
          <option value="">{t('Barcha sinflar')}</option>
          {GRADES.map((g) => <option key={g} value={g}>{g}-{t('sinf')}</option>)}
        </select>
        <input className="input input--sm" placeholder={t('Qidirish…')} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {isLoading && <Skeleton lines={6} />}
      {!isLoading && !data?.length && <EmptyState title={t("Mahsulot topilmadi")} hint={t("Tez orada yangi materiallar qo'shiladi.")} />}
      <div className="pgrid">
        {data?.map((p) => (
          <button key={p.id} type="button" className="pcard" onClick={() => setOpen(p)}>
            <span className="pcard__cover" style={p.cover_url ? { backgroundImage: `url("${encodeURI(p.cover_url)}")` } : undefined}>
              {!p.cover_url && <span className="pcard__ph">{IC.book}</span>}
              {p.purchased && <span className="pcard__owned">✓ {t('Sotib olingan')}</span>}
            </span>
            <span className="pcard__kind">{t(KIND_LABEL[p.kind])}{p.grade ? ` · ${p.grade}-${t('sinf')}` : ''}</span>
            <span className="pcard__title">{p.title}</span>
            {p.short && <span className="pcard__short">{p.short}</span>}
            <span className="pcard__price">
              {p.price ? fmtMoney(p.price) : t('Bepul')}
              {p.old_price && <s>{fmtMoney(p.old_price)}</s>}
            </span>
          </button>
        ))}
      </div>
      {open && <ProductModal p={open} onClose={() => setOpen(null)} />}
      {cartOpen && <Cart products={all.data ?? []} onClose={() => setCartOpen(false)} />}
    </div>
  )
}
