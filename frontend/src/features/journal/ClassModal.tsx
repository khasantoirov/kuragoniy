import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { record } from '@/lib/history'

import { useCreateClass, useUpdateClass } from './api'
import type { JournalClass } from './types'

export function ClassModal({ cls, onClose, onCreated }: { cls: JournalClass | null; onClose: () => void; onCreated?: (id: number) => void }) {
  const { t } = useTranslation()
  const [school, setSchool] = useState(cls?.school ?? '')
  const [name, setName] = useState(cls?.name ?? '')
  const create = useCreateClass()
  const update = useUpdateClass(cls?.id ?? 0)
  const toast = useToast()

  const submit = async () => {
    if (!school.trim()) return toast(t('Maktab nomini kiriting'), 'error')
    if (!name.trim()) return toast(t('Sinf nomini kiriting'), 'error')
    try {
      if (cls) {
        const before = { school: cls.school, name: cls.name }
        const after = { school, name }
        await update.mutateAsync(after)
        if (before.school !== after.school || before.name !== after.name) {
          record(
            t('Sinf tahrirlandi'),
            async () => { await update.mutateAsync(before) },
            async () => { await update.mutateAsync(after) },
          )
        }
        toast(t('Sinf saqlandi'))
      } else {
        const created = await create.mutateAsync({ school, name })
        toast(t("Sinf qo'shildi"))
        onCreated?.(created.id)
      }
      onClose()
    } catch {
      toast(t('Xatolik yuz berdi'), 'error')
    }
  }

  return (
    <Modal
      title={cls ? t('Sinfni tahrirlash') : t('Yangi sinf')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>{t('Bekor qilish')}</button>
          <button className="btn btn--primary" onClick={submit}>{cls ? t('Saqlash') : t("Qo'shish")}</button>
        </>
      }
    >
      <label className="field">
        <span className="field__label">{t('Maktab nomi')}</span>
        <input className="input" value={school} onChange={(e) => setSchool(e.target.value)} placeholder={t('Masalan: 25-maktab')} />
      </label>
      <label className="field">
        <span className="field__label">{t('Sinf nomi')}</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('Masalan: 7-A')} />
      </label>
    </Modal>
  )
}
