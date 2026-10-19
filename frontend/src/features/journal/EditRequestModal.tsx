import { isAxiosError } from 'axios'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { IC } from '@/icons'

import { useRequestGrant } from './api'
import { fmtD } from './attendance'

/** A teacher asking an administrator to reopen a closed day. */
export function EditRequestModal({ classId, date, onClose }: { classId: number; date: string; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const request = useRequestGrant()
  const [reason, setReason] = useState('')

  const submit = async () => {
    if (!reason.trim()) return toast(t('Sababini yozing'), 'error')
    try {
      await request.mutateAsync({ journal_class: classId, date, reason: reason.trim() })
      toast(t("So'rov yuborildi. Administrator ruxsat bergach, shu kunni tahrirlay olasiz."))
      onClose()
    } catch (err) {
      const detail = isAxiosError<{ detail?: string }>(err) ? err.response?.data?.detail : undefined
      toast(t(detail ?? 'Xatolik yuz berdi'), 'error')
    }
  }

  return (
    <Modal
      title={`${fmtD(date)}.${date.slice(0, 4)} — ${t("Tahrirlashga ruxsat so'rash")}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>{t('Bekor qilish')}</button>
          <button className="btn btn--primary" onClick={submit} disabled={request.isPending}>{t("So'rov yuborish")}</button>
        </>
      }
    >
      <p className="jlock__why">
        {IC.lock} {t("Baho va davomat faqat dars kunining o'zida kiritiladi. O'tgan kunni o'zgartirish uchun administrator ruxsati kerak.")}
      </p>
      <label className="field">
        <span className="field__label">{t('Sabab')}</span>
        <textarea
          className="input"
          rows={3}
          maxLength={500}
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t("Masalan: dars kuni internet bo'lmagani uchun kirita olmadim.")}
        />
      </label>
    </Modal>
  )
}
