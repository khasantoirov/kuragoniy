import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Modal } from '@/components/Modal'
import { useConfirm } from '@/components/ConfirmProvider'
import { useToast } from '@/components/Toast'
import { api } from '@/lib/api/client'
import type { Paginated } from '@/lib/api/types'
import { record } from '@/lib/history'

import { useCreateClass, useUpdateClass } from './api'
import { asScale, bandText, LEVELS, SCALES, type Scale } from './scales'
import type { JournalClass } from './types'

export function ClassModal({ cls, onClose, onCreated }: { cls: JournalClass | null; onClose: () => void; onCreated?: (id: number) => void }) {
  const { t } = useTranslation()
  const [school, setSchool] = useState(cls?.school ?? '')
  const [partner, setPartner] = useState<number | 'other' | ''>(cls?.partner_school ?? (cls ? 'other' : ''))
  const [name, setName] = useState(cls?.name ?? '')
  // The school's grading scale; a new class starts on the one used last.
  const [scale, setScale] = useState<Scale>(() => {
    if (cls) return asScale(cls.scale)
    try {
      return asScale(Number(localStorage.getItem('af-journal-scale')))
    } catch {
      return 5
    }
  })
  const confirm = useConfirm()
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
    if (cls && scale !== asScale(cls.scale) && !(await confirm({
      title: t('Baholash shkalasi'),
      text: t("Mavjud baholar yangi shkalaga o'tkaziladi — har birining rang toifasi saqlanadi."),
    }))) return
    try {
      try {
        localStorage.setItem('af-journal-scale', String(scale))
      } catch {
        // a remembered default is only a convenience
      }
      if (cls) {
        const before = { school: cls.school, name: cls.name, partner_school: cls.partner_school ?? null }
        const after = { school: schoolName, name, partner_school: partnerId }
        await update.mutateAsync(scale !== asScale(cls.scale) ? { ...after, scale } : after)
        if (before.school !== after.school || before.name !== after.name) {
          record(
            t('Sinf tahrirlandi'),
            async () => { await update.mutateAsync(before) },
            async () => { await update.mutateAsync(after) },
          )
        }
        toast(t('Sinf saqlandi'))
      } else {
        const created = await create.mutateAsync({ school: schoolName, name, partner_school: partnerId, scale })
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
      <div className="field">
        <span className="field__label">{t('Baholash shkalasi')}</span>
        <div className="scalepick" role="radiogroup" aria-label={t('Baholash shkalasi')}>
          {SCALES.map((o) => (
            <button key={o.v} type="button" role="radio" aria-checked={scale === o.v} className={`scalepick__o ${scale === o.v ? 'is-on' : ''}`} onClick={() => setScale(o.v)}>
              <b>{o.range}</b>
              <span>{t(o.label)}</span>
            </button>
          ))}
        </div>
        <div className="scalepick__bands">
          {LEVELS.map((l) => (
            <span key={l.l} className="scalepick__band"><span className={`gchip gchip--${l.l} gchip--wide`}>{bandText(l.l, scale)}</span> {t(l.label)}</span>
          ))}
        </div>
      </div>
    </Modal>
  )
}
