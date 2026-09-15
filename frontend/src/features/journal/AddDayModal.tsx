import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { record } from '@/lib/history'
import { useUIStore } from '@/store/uiStore'

import { useBulkMarks, useDropDay } from './api'
import { quarterLabel } from './labels'

export function AddDayModal({ classId, chorak, onClose }: { classId: number; chorak: number; onClose: () => void }) {
  const { t } = useTranslation()
  const { lang } = useUIStore()
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [topic, setTopic] = useState('')
  const bulkMarks = useBulkMarks(classId)
  const dropDay = useDropDay(classId)
  const toast = useToast()

  const submit = async () => {
    if (!date) return toast(t('Sanani tanlang'), 'error')
    try {
      await bulkMarks.mutateAsync({ date, chorak, topic, marks: [], attendance: [] })
      record(
        t('Dars kuni'),
        async () => { await dropDay.mutateAsync(date) },
        async () => { await bulkMarks.mutateAsync({ date, chorak, topic, marks: [], attendance: [] }) },
      )
      toast(t("Dars kuni qo'shildi"))
      onClose()
    } catch {
      toast(t('Xatolik yuz berdi'), 'error')
    }
  }

  return (
    <Modal
      title={t('Dars kuni')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>{t('Bekor qilish')}</button>
          <button className="btn btn--primary" onClick={submit} disabled={bulkMarks.isPending}>{t("Qo'shish")}</button>
        </>
      }
    >
      <label className="field">
        <span className="field__label">{t('Sana')}</span>
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="field">
        <span className="field__label">{t('Mavzu')} <span className="field__opt">({t('ixtiyoriy')})</span></span>
        <input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={t('Dars mavzusi')} />
      </label>
      <p className="prose prose--note">{quarterLabel(chorak, lang)} {t("jadvaliga qo'shiladi.")}</p>
    </Modal>
  )
}
