import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { api } from '@/lib/api/client'
import type { Paginated } from '@/lib/api/types'
import { record } from '@/lib/history'

import { useCreateClass, useUpdateClass } from './api'
import type { JournalClass } from './types'

export function ClassModal({ cls, onClose, onCreated }: { cls: JournalClass | null; onClose: () => void; onCreated?: (id: number) => void }) {
  const { t } = useTranslation()
  const [school, setSchool] = useState(cls?.school ?? '')
  const [partner, setPartner] = useState<number | 'other' | ''>(cls?.partner_school ?? (cls ? 'other' : ''))
  const [name, setName] = useState(cls?.name ?? '')
  // Partner-school registry (administration maintains it) — picking from
  // it keeps per-school statistics correct instead of one school showing up
  // under five different spellings.
  const { data: partners } = useQuery({
    queryKey: ['schools', 'brief'],
    queryFn: async () => (await api.get<Paginated<{ id: number; name: string }>>('/schools/')).data.results,
  })
  const usingOther = partner === 'other' || !partners?.length
  const create = useCreateClass()
  const update = useUpdateClass(cls?.id ?? 0)
  const toast = useToast()

  const submit = async () => {
    const chosen = !usingOther && partner !== '' ? partners?.find((p) => p.id === partner) : undefined
    const schoolName = chosen ? chosen.name : school.trim()
    if (!schoolName) return toast(t('Maktabni tanlang yoki nomini kiriting'), 'error')
    if (!name.trim()) return toast(t('Sinf nomini kiriting'), 'error')
    const partnerId = chosen ? chosen.id : null
    try {
      if (cls) {
        const before = { school: cls.school, name: cls.name, partner_school: cls.partner_school ?? null }
        const after = { school: schoolName, name, partner_school: partnerId }
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
        const created = await create.mutateAsync({ school: schoolName, name, partner_school: partnerId })
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
      {!!partners?.length && (
        <label className="field">
          <span className="field__label">{t('Maktab')}</span>
          <select className="input" value={partner} onChange={(e) => setPartner(e.target.value === 'other' ? 'other' : e.target.value ? Number(e.target.value) : '')}>
            <option value="">{t('Hamkor maktabni tanlang…')}</option>
            {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            <option value="other">{t("Ro'yxatda yo'q (qo'lda yozish)")}</option>
          </select>
        </label>
      )}
      {usingOther && (
        <label className="field">
          <span className="field__label">{t('Maktab nomi')}</span>
          <input className="input" value={school} onChange={(e) => setSchool(e.target.value)} placeholder={t('Masalan: 25-maktab')} />
        </label>
      )}
      <label className="field">
        <span className="field__label">{t('Sinf nomi')}</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('Masalan: 7-A')} />
      </label>
    </Modal>
  )
}
