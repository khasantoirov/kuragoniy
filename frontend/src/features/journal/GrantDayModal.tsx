import { isAxiosError } from 'axios'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { IC } from '@/icons'

import { useCreateGrant } from './api'
import { DURATIONS, isPending } from './lock'
import type { GridLock } from './types'

/** An administrator opening one closed day — from the lock on that day,
 * in a teacher's journal or their own. */
export function GrantDayModal({ lock, classId, classLabel, date, onClose }: {
  lock: GridLock
  classId: number
  classLabel: string
  date: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const create = useCreateGrant()
  const [hours, setHours] = useState(24)
  const asked = lock.pending.find((g) => g.date_from <= date && date <= g.date_to)
  const self = lock.owner
  const day = `${date.slice(8, 10)}.${date.slice(5, 7)}.${date.slice(0, 4)}`

  const submit = async () => {
    try {
      await create.mutateAsync({ teacher: lock.teacher, journal_class: classId, date_from: date, date_to: date, hours })
      toast(self ? t('Kun ochildi') : t("Kun o'qituvchiga ochildi"))
      onClose()
    } catch (err) {
      const detail = isAxiosError<{ detail?: string }>(err) ? err.response?.data?.detail : undefined
      toast(t(detail ?? 'Xatolik yuz berdi'), 'error')
    }
  }

  return (
    <Modal
      title={`${day} — ${t('kunni ochish')}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>{t('Bekor qilish')}</button>
          <button className="btn btn--primary" onClick={submit} disabled={create.isPending}>{IC.unlock} {t('Ochib berish')}</button>
        </>
      }
    >
      <p className="jlock__why">
        {IC.unlock}
        <span>
          {self
            ? t("Bu kunning baho va davomatini o'zingiz tahrirlashingiz uchun ochiladi.")
            : `${lock.teacher_name} · ${classLabel} — ${t("o'qituvchi shu kunning baho va davomatini tahrirlay oladi.")}`}
        </span>
      </p>
      {asked && isPending(lock, date) && (
        <p className="prose prose--note">{t("O'qituvchi so'ragan")}: <q>{asked.reason}</q></p>
      )}
      <div className="field">
        <span className="field__label">{t('Qancha vaqt ochiq tursin')}</span>
        <div className="chips">
          {DURATIONS.map((d) => (
            <button key={d.h} type="button" className={`chip ${hours === d.h ? 'is-on' : ''}`} onClick={() => setHours(d.h)}>{t(d.label)}</button>
          ))}
        </div>
      </div>
    </Modal>
  )
}
