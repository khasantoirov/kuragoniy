import { isAxiosError } from 'axios'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { IC } from '@/icons'
import { record } from '@/lib/history'
import { useUIStore } from '@/store/uiStore'

import { useBulkMarks, useCreateGrant, useDropDay, useRequestGrant } from './api'
import { quarterLabel } from './labels'
import { canEditDay, DURATIONS, isPending, localToday } from './lock'
import type { GridLock } from './types'

export function AddDayModal({ classId, chorak, lock, onClose }: { classId: number; chorak: number; lock?: GridLock; onClose: () => void }) {
  const { t } = useTranslation()
  const { lang } = useUIStore()
  const [date, setDate] = useState(() => lock?.today ?? localToday())
  const [topic, setTopic] = useState('')
  const [reason, setReason] = useState('')
  const bulkMarks = useBulkMarks(classId)
  const dropDay = useDropDay(classId)
  const request = useRequestGrant()
  const createGrant = useCreateGrant()
  const [hours, setHours] = useState(1)
  const toast = useToast()
  // A teacher adds the lesson day itself; an earlier day needs permission.
  const locked = !!date && !canEditDay(lock, date)
  const future = locked && date > (lock?.today ?? localToday())
  const waiting = locked && isPending(lock, date)

  const ask = async () => {
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

  const submit = async () => {
    if (!date) return toast(t('Sanani tanlang'), 'error')
    if (locked && !lock?.can_grant) return ask()
    try {
      if (locked && lock) {
        await createGrant.mutateAsync({ teacher: lock.teacher, journal_class: classId, date_from: date, date_to: date, hours })
      }
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
          <button className="btn btn--primary" onClick={submit}
            disabled={bulkMarks.isPending || request.isPending || createGrant.isPending || future || (waiting && !lock?.can_grant)}>
            {!locked ? t("Qo'shish") : lock?.can_grant ? t('Kunni ochib qo\'shish') : t("Ruxsat so'rash")}
          </button>
        </>
      }
    >
      <label className="field">
        <span className="field__label">{t('Sana')}</span>
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      {locked ? (
        <>
          <p className="jlock__why">
            {IC.lock}{' '}
            {future
              ? t('Kelgusi kunlar uchun baho va davomat kiritilmaydi — dars kuni kelganda qo\'shing.')
              : lock?.can_grant
                ? t("Bu kun o'tib ketgan. Qo'shish uchun uni o'zingizga ochasiz — ochiq turish muddatini tanlang.")
                : waiting
                ? t("Bu kun uchun so'rov yuborilgan — administrator javobini kuting.")
                : t("Bu kun o'tib ketgan: baho va davomat faqat dars kunining o'zida kiritiladi. Qo'shish uchun administratordan ruxsat so'rang.")}
          </p>
          {!future && lock?.can_grant && (
            <div className="chips">
              {DURATIONS.map((d) => (
                <button key={d.h} type="button" className={`chip ${hours === d.h ? 'is-on' : ''}`} onClick={() => setHours(d.h)}>{t(d.label)}</button>
              ))}
            </div>
          )}
          {!future && !waiting && !lock?.can_grant && (
            <label className="field">
              <span className="field__label">{t('Sabab')}</span>
              <textarea className="input" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder={t("Masalan: dars kuni internet bo'lmagani uchun kirita olmadim.")} />
            </label>
          )}
        </>
      ) : (
        <>
          <label className="field">
            <span className="field__label">{t('Mavzu')} <span className="field__opt">({t('ixtiyoriy')})</span></span>
            <input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={t('Dars mavzusi')} />
          </label>
          <p className="prose prose--note">{quarterLabel(chorak, lang)} {t("jadvaliga qo'shiladi.")}</p>
        </>
      )}
    </Modal>
  )
}
