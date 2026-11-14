import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { errText } from '@/features/portal/ui'
import type { AcademicYear } from '@/features/schools/api'
import { api } from '@/lib/api/client'

import '@/features/staffroom/staffroom.css'

/** O'quv yili's four chorak dates — Ustozlar xonasi counts the weeks
 * (which lesson is when) from them. */
export function QuartersModal({ year, onClose }: { year: AcademicYear; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const qc = useQueryClient()
  const [q, setQ] = useState(year.quarters.map((x) => ({ ...x })))
  const [busy, setBusy] = useState(false)
  const set = (i: number, key: 'start' | 'end', value: string) => setQ((list) => list.map((x, k) => (k === i ? { ...x, [key]: value } : x)))
  const save = async () => {
    setBusy(true)
    try {
      await api.patch(`/schools/years/${year.id}/`, { quarters: q })
      qc.invalidateQueries({ queryKey: ['schools', 'years'] })
      qc.invalidateQueries({ queryKey: ['staffroom'] })
      toast(t('Saqlandi'))
      onClose()
    } catch (err) {
      toast(t(errText(err)), 'error')
      setBusy(false)
    }
  }
  return (
    <Modal title={`${year.name}: ${t('chorak sanalari')}`} onClose={onClose} narrow
      footer={<><button className="btn" onClick={onClose}>{t('Bekor qilish')}</button>
        <button className="btn btn--primary" disabled={busy || q.some((x) => !x.start || !x.end)} onClick={save}>{t('Saqlash')}</button></>}>
      {!year.quarters_exact && <p className="form__note">{t("Hozir taxminiy sanalar turibdi — vazirlik tasdiqlagan sanalarni kiriting.")}</p>}
      <div className="qdates">
        {q.map((x, i) => (
          <div key={i} className="qdates__row">
            <b>{i + 1}-{t('chorak')}</b>
            <input className="input" type="date" aria-label={t('Boshlanishi')} value={x.start} onChange={(e) => set(i, 'start', e.target.value)} />
            <input className="input" type="date" aria-label={t('Tugashi')} value={x.end} onChange={(e) => set(i, 'end', e.target.value)} />
          </div>
        ))}
      </div>
      <p className="form__note">{t("Ustozlar xonasi shu sanalardan haftani hisoblab, o'qituvchiga shu haftaning mavzusini ko'rsatadi. Choraklar orasidagi kunlar ta'til hisoblanadi.")}</p>
    </Modal>
  )
}
