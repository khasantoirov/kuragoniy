import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { record } from '@/lib/history'

import { useBulkMarks } from './api'
import { fmtD } from './attendance'
import type { GridDay } from './types'

export function EditTopicModal({ classId, day, onClose }: { classId: number; day: GridDay; onClose: () => void }) {
  const { t } = useTranslation()
  const [topic, setTopic] = useState(day.topic)
  const bulkMarks = useBulkMarks(classId)
  const toast = useToast()

  const submit = async () => {
    const before = day.topic
    const after = topic
    const write = (tp: string) => bulkMarks.mutateAsync({ date: day.date, chorak: day.chorak, topic: tp, marks: [], attendance: [] })
    try {
      await write(after)
      if (before !== after) {
        record(t('Mavzu'), async () => { await write(before) }, async () => { await write(after) })
      }
      toast(after ? t('Mavzu saqlandi') : t('Mavzu olib tashlandi'))
      onClose()
    } catch {
      toast(t('Xatolik yuz berdi'), 'error')
    }
  }

  return (
    <Modal
      title={`${fmtD(day.date)} — ${t('Mavzu')}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>{t('Bekor qilish')}</button>
          <button className="btn btn--primary" onClick={submit} disabled={bulkMarks.isPending}>{t('Saqlash')}</button>
        </>
      }
    >
      <label className="field">
        <span className="field__label">{t('Dars mavzusi')}</span>
        <input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={t('Darslardan tanlang yoki yozing')} />
      </label>
      <p className="prose prose--note">{t("Bo'sh qoldirilsa mavzu olib tashlanadi.")}</p>
    </Modal>
  )
}
