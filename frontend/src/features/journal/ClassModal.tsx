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
  // picked from Hamkor maktablar only (the administration keeps the list)
  const [partner, setPartner] = useState<number | ''>(cls?.partner_school ?? '')
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
  // an old class whose school was typed by hand and not matched yet
  const typed = cls && !cls.partner_school ? cls.school : ''
  const create = useCreateClass()
  const update = useUpdateClass(cls?.id ?? 0)
  const toast = useToast()

  const submit = async () => {
    const chosen = partner !== '' ? partners?.find((p) => p.id === partner) : undefined
    if (!chosen) return toast(t("Maktabni ro'yxatdan tanlang"), 'error')
    if (!name.trim()) return toast(t('Sinf nomini kiriting'), 'error')
    const schoolName = chosen.name
    const partnerId = chosen.id
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
      <label className="field">
        <span className="field__label">{t('Maktab')}</span>
        <select className="input" value={partner} onChange={(e) => setPartner(e.target.value ? Number(e.target.value) : '')}>
          <option value="">{t('Hamkor maktabni tanlang…')}</option>
          {partners?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {typed && partner === '' && <small className="field__warn">⚠ «{typed}» {t("qo'lda yozilgan — ro'yxatdan maktabni tanlang.")}</small>}
        <small className="field__hint">{t("Maktabingiz ro'yxatda yo'q bo'lsa, ma'muriyatga ayting — ular «Hamkor maktablar» bo'limiga qo'shadi.")}</small>
      </label>
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
