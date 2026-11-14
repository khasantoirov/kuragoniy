import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { errText } from '@/features/portal/ui'
import { api } from '@/lib/api/client'

import { useInvalidateKits, type Missing, type SchoolRef } from './api'

/** "Chamadon so'rash": a whole kit, or the pieces a lesson still lacks —
 * the request goes to the administration (no payment here). */
export function RequestModal({ kit, lesson, missing, schools, onClose }: {
  kit?: { id: number; name: string }
  lesson?: { id: number; title: string }
  missing?: Missing[]
  schools: SchoolRef[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const invalidate = useInvalidateKits()
  const [school, setSchool] = useState(schools.length === 1 ? String(schools[0].id) : '')
  const [quantity, setQuantity] = useState(1)
  const [items, setItems] = useState(() => (missing ?? []).map((m) => ({ name: m.name, quantity: m.short, on: true })))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const picked = items.filter((i) => i.on)

  const send = async () => {
    setBusy(true)
    try {
      await api.post('/kits/requests/', {
        kit: kit?.id ?? null, quantity, lesson: lesson?.id ?? null, school: school || null, note,
        items: kit ? [] : picked.map(({ name, quantity: q }) => ({ name, quantity: q })),
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
    <Modal title={kit ? `${t("Chamadon so'rash")}: ${kit.name}` : t("Yetishmagan jihozlarni so'rash")} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>{t('Bekor qilish')}</button>
        <button className="btn btn--primary" disabled={busy || (!kit && !picked.length)} onClick={send}>{t("So'rov yuborish")}</button></>}>
      <p className="form__note">{t("So'rov ma'muriyatga boradi; narx va yetkazib berishni ma'muriyat siz bilan kelishadi. Javob bildirishnoma bo'lib keladi.")}</p>
      {lesson && <p className="kreq__lesson">{t('Dars')}: <b>{lesson.title}</b></p>}
      {schools.length > 1 && (
        <label className="field"><span className="field__label">{t('Maktab')}</span>
          <select className="input" value={school} onChange={(e) => setSchool(e.target.value)}>
            <option value="">—</option>
            {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select></label>
      )}
      {schools.length === 1 && <p className="kreq__lesson">{t('Maktab')}: <b>{schools[0].name}</b></p>}
      {kit ? (
        <label className="field"><span className="field__label">{t('Soni')}</span>
          <input className="input" type="number" min={1} max={100} value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} /></label>
      ) : (
        <div className="field">
          <span className="field__label">{t('Jihozlar')}</span>
          <ul className="kreq__items">
            {items.map((it, i) => (
              <li key={it.name}>
                <label><input type="checkbox" checked={it.on} onChange={(e) => setItems(items.map((x, k) => (k === i ? { ...x, on: e.target.checked } : x)))} /> {it.name}</label>
                <input className="input input--sm" type="number" min={1} max={1000} value={it.quantity} aria-label={t('Soni')}
                  onChange={(e) => setItems(items.map((x, k) => (k === i ? { ...x, quantity: Math.max(1, Number(e.target.value) || 1) } : x)))} />
              </li>
            ))}
          </ul>
        </div>
      )}
      <label className="field"><span className="field__label">{t('Izoh (ixtiyoriy)')}</span>
        <textarea className="input" rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} /></label>
    </Modal>
  )
}
