import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useToast } from '@/components/Toast'
import { errText } from '@/features/portal/ui'
import { IC } from '@/icons'

import { useContract, useOffers, useSaveOffers, type PlanOffer } from './api'
import './subscriptions.css'

/** Boshqaruv paneli › Litsenziyalar › Tariflar: each plan's price and what
 *  it gives, as the administration words them (the owner's choice: "Panelda
 *  o'zim kiritaman"), how to pay, and the contract template. Schools see
 *  them on Obunalar. */
export function OffersEditor() {
  const { t } = useTranslation()
  const toast = useToast()
  const { data } = useOffers()
  const save = useSaveOffers()
  const { upload, remove } = useContract()
  const [plans, setPlans] = useState<PlanOffer[]>([])
  const [note, setNote] = useState('')
  const file = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!data) return
    setPlans(data.plans)
    setNote(data.payment_note)
  }, [data])

  const set = (i: number, patch: Partial<PlanOffer>) => setPlans((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)))

  const onSave = async () => {
    try {
      await save.mutateAsync({
        plans: plans.map(({ plan, price, features, recommended, is_visible }) => ({ plan, price, features, recommended, is_visible })),
        payment_note: note,
      })
      toast(t('Tariflar saqlandi'))
    } catch (err) {
      toast(t(errText(err)), 'error')
    }
  }

  const onFile = async (f: File | undefined) => {
    if (!f) return
    try {
      await upload.mutateAsync(f)
      toast(t('Shartnoma namunasi yuklandi'))
    } catch (err) {
      toast(t(errText(err)), 'error')
    } finally {
      if (file.current) file.current.value = ''
    }
  }

  if (!data) return null
  return (
    <section className="panel">
      <h3 className="panel__title">{t("Tariflar va to'lov")}</h3>
      <p className="prose prose--note">{t("Maktablar «Obunalar» sahifasida shu narx va tavsiflarni ko'radi. Narx yozilmagan tarif ko'rsatilmaydi.")}</p>
      <div className="ofed__plans">
        {plans.map((p, i) => (
          <div key={p.plan} className="ofed__plan">
            <h4>{t(p.plan_label)}</h4>
            <label className="field">
              <span className="field__label">{t('Narxi')}</span>
              <input className="input" value={p.price} maxLength={120} onChange={(e) => set(i, { price: e.target.value })}
                placeholder={t("Masalan: 15 000 so'm / o'quvchi / chorak")} />
            </label>
            <label className="field">
              <span className="field__label">{t("Nimalar kiradi")} <span className="field__opt">({t('har qatorda bittadan')})</span></span>
              <textarea className="input" rows={4} value={p.features} onChange={(e) => set(i, { features: e.target.value })} />
            </label>
            <div className="ofed__checks">
              <label><input type="checkbox" checked={p.recommended} onChange={(e) => set(i, { recommended: e.target.checked })} /> {t('Tavsiya etiladi')}</label>
              <label><input type="checkbox" checked={p.is_visible} onChange={(e) => set(i, { is_visible: e.target.checked })} /> {t("Maktablarga ko'rinsin")}</label>
            </div>
          </div>
        ))}
      </div>
      <label className="field" style={{ marginTop: 12 }}>
        <span className="field__label">{t("To'lov tartibi")}</span>
        <textarea className="input" rows={3} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)}
          placeholder={t("Masalan: to'lov shartnoma asosida bank o'tkazmasi orqali; rekvizitlar shartnomada.")} />
      </label>
      <div className="panel__acts">
        <button className="btn btn--primary" onClick={onSave} disabled={save.isPending}>{t('Saqlash')}</button>
      </div>
      <div className="ofed__contract">
        <span className="field__label">{t('Shartnoma namunasi')}:</span>
        {data.contract_url
          ? <a href={data.contract_url} target="_blank" rel="noopener noreferrer">{IC.file} {data.contract_name}</a>
          : <span className="muted">{t('yuklanmagan')}</span>}
        <input ref={file} type="file" accept=".pdf,.doc,.docx" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
        <button className="btn btn--sm" onClick={() => file.current?.click()} disabled={upload.isPending}>{IC.upload} {t('Yuklash')}</button>
        {data.contract_url && (
          <button className="btn btn--sm btn--ghost" onClick={() => remove.mutate()} disabled={remove.isPending}>{t("O'chirish")}</button>
        )}
      </div>
    </section>
  )
}
