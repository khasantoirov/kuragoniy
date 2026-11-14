import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { useConfirm } from '@/components/ConfirmProvider'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { errText, fmtDate } from '@/features/portal/ui'
import { IC } from '@/icons'
import { api } from '@/lib/api/client'
import { useModules } from '@/lib/modules'

import { useInvalidateKits, useKits, useSchoolKits } from './api'
import './kits.css'

function AddModal({ schoolId, onClose }: { schoolId: number; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const invalidate = useInvalidateKits()
  const kits = useKits()
  const [kit, setKit] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [received, setReceived] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      await api.post(`/kits/schools/${schoolId}/`, { kit: Number(kit), quantity, received_on: received || null })
      invalidate()
      onClose()
    } catch (err) {
      toast(t(errText(err)), 'error')
      setBusy(false)
    }
  }
  return (
    <Modal title={t('Maktabga chamadon qo\'shish')} onClose={onClose} narrow
      footer={<><button className="btn" onClick={onClose}>{t('Bekor qilish')}</button>
        <button className="btn btn--primary" disabled={busy || !kit} onClick={save}>{t('Saqlash')}</button></>}>
      <label className="field"><span className="field__label">{t('Chamadon')}</span>
        <select className="input" value={kit} onChange={(e) => setKit(e.target.value)}>
          <option value="">—</option>
          {kits.data?.map((k) => <option key={k.id} value={k.id}>{k.name}{k.code ? ` (${k.code})` : ''}</option>)}
        </select></label>
      <label className="field"><span className="field__label">{t('Soni')}</span>
        <input className="input" type="number" min={1} max={500} value={quantity} onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))} /></label>
      <label className="field"><span className="field__label">{t('Berilgan sana (ixtiyoriy)')}</span>
        <input className="input" type="date" value={received} onChange={(e) => setReceived(e.target.value)} /></label>
    </Modal>
  )
}

/** A school's page: the STEM chamadonlar it has. */
export function SchoolKitsPanel({ schoolId, admin }: { schoolId: number; admin: boolean }) {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const invalidate = useInvalidateKits()
  const { on } = useModules()
  const { data } = useSchoolKits(on('kits') ? schoolId : undefined)
  const [adding, setAdding] = useState(false)
  if (!data || (!data.length && !admin)) return null
  const remove = async (kit: number, name: string) => {
    if (!(await confirm({ title: t('Chamadonni maktabdan olib tashlash'), text: name }))) return
    try {
      await api.delete(`/kits/schools/${schoolId}/`, { params: { kit } })
      invalidate()
    } catch (err) {
      toast(t(errText(err)), 'error')
    }
  }
  return (
    <section className="panel">
      <div className="thead">
        <h3 className="panel__title">{t('STEM chamadonlar')}</h3>
        {admin && <button className="btn btn--sm" onClick={() => setAdding(true)}>+ {t("Qo'shish")}</button>}
      </div>
      {!data.length ? <p className="prose prose--note">{t("Bu maktabga hali chamadon berilmagan.")}</p> : (
        <ul className="klessons">
          {data.map((k) => (
            <li key={k.kit}>
              <Link to={`/kits/${k.kit}`}>{k.name}{k.code ? ` · ${k.code}` : ''}</Link>
              <span>×{k.quantity}{k.received_on ? ` · ${fmtDate(k.received_on)}` : ''}
                {admin && <button className="icon-btn" aria-label={t("O'chirish")} onClick={() => remove(k.kit, k.name)}>{IC.close}</button>}</span>
            </li>
          ))}
        </ul>
      )}
      {adding && <AddModal schoolId={schoolId} onClose={() => setAdding(false)} />}
    </section>
  )
}
