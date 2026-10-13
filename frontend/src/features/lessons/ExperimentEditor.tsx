import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { IC } from '@/icons'

import { useRemoveEquipmentImage, useUploadEquipmentImage } from './api'
import type { EquipmentItem, Experiment } from './types'

function emptyExperiment(): Experiment {
  return { order: 0, name: '', desc: '', equipment_items: [], steps: [], concepts: [], minutes: null, safety: '' }
}

function emptyEquipmentItem(): EquipmentItem {
  return { order: 0, name: '', quantity: 1 }
}

function toUrl(v: string) {
  v = v.trim()
  if (v && !/^https?:\/\//i.test(v)) v = 'https://' + v
  return v
}

export function ExperimentEditor({
  exp,
  onClose,
  onSave,
}: {
  exp: Experiment | null
  onClose: () => void
  onSave: (exp: Experiment) => Promise<Experiment>
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<Experiment>(exp ?? emptyExperiment())
  // steps is edited as raw multi-line text, not the filtered array
  // directly — deriving the textarea's `value` from steps.join('\n')
  // after filtering out empty lines on every keystroke stripped the
  // blank line a lone Enter press had just created (before any text
  // followed it), so the cursor could never move to a second line. Only
  // split into a real array at submit time.
  const [stepsText, setStepsText] = useState((exp ?? emptyExperiment()).steps.join('\n'))
  const [conceptsText, setConceptsText] = useState((exp ?? emptyExperiment()).concepts.join('\n'))
  // Equipment rows don't get a real id until the whole Lesson PATCH
  // round-trips (see onSave below), so a newly-picked image file is held
  // here and only uploaded once the row has one.
  const [equipment, setEquipment] = useState<EquipmentItem[]>(
    (exp ?? emptyExperiment()).equipment_items.map((it) => ({ ...it })),
  )
  const [pendingImages, setPendingImages] = useState<(File | null)[]>(equipment.map(() => null))
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const uploadImage = useUploadEquipmentImage()
  const removeImage = useRemoveEquipmentImage()
  const isNew = !exp

  const addEquipmentRow = () => {
    setEquipment((rows) => [...rows, emptyEquipmentItem()])
    setPendingImages((files) => [...files, null])
  }
  const removeEquipmentRow = (i: number) => {
    setEquipment((rows) => rows.filter((_, idx) => idx !== i))
    setPendingImages((files) => files.filter((_, idx) => idx !== i))
  }
  const setEquipmentField = (i: number, patch: Partial<EquipmentItem>) =>
    setEquipment((rows) => rows.map((row, idx) => (idx === i ? { ...row, ...patch } : row)))

  const submit = async () => {
    if (!draft.name.trim()) {
      toast(t('Amaliy topshiriq nomini kiriting'), 'error')
      return
    }
    setBusy(true)
    try {
      const saved = await onSave({
        ...draft,
        equipment_items: equipment.map((item, i) => ({ ...item, order: i })),
        steps: stepsText.split('\n').map((s) => s.trim()).filter(Boolean),
        concepts: conceptsText.split('\n').map((s) => s.trim()).filter(Boolean),
        image: toUrl(draft.image ?? ''),
        video: toUrl(draft.video ?? ''),
      })
      await Promise.all(
        pendingImages.map((file, i) => {
          const id = saved.equipment_items[i]?.id
          return file && id ? uploadImage.mutateAsync({ id, file }) : Promise.resolve()
        }),
      )
      toast(isNew ? t("Amaliy topshiriq qo'shildi") : t('Amaliy topshiriq saqlandi'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={isNew ? t('Yangi amaliy topshiriq') : t('Amaliy topshiriqni tahrirlash')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>{t('Bekor qilish')}</button>
          <button className="btn btn--primary" onClick={submit} disabled={busy}>
            {isNew ? t("Qo'shish") : t('Saqlash')}
          </button>
        </>
      }
    >
      <label className="field">
        <span className="field__label">{t('Amaliy topshiriq nomi')}</span>
        <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder={t("Masalan: Chizg'ich orqali reaksiya vaqti")} />
      </label>

      <label className="field">
        <span className="field__label">{t('Vaqti')} <span className="field__opt">{t('(daqiqa)')}</span></span>
        <input className="input" type="number" min={1} max={120} value={draft.minutes ?? ''} onChange={(e) => setDraft({ ...draft, minutes: e.target.value ? Number(e.target.value) : null })} placeholder="10" />
      </label>

      <label className="field">
        <span className="field__label">{t('Tavsif')} <span className="field__opt">({t("nima ko'rsatiladi")})</span></span>
        <textarea className="input" rows={2} value={draft.desc} onChange={(e) => setDraft({ ...draft, desc: e.target.value })} placeholder={t('Amaliy topshiriqning mohiyati va kutilayotgan natija')} />
      </label>

      <div className="field">
        <span className="field__label">{t('Kerakli jihozlar')}</span>
        <div className="su-list">
          {equipment.map((item, i) => (
            <div key={i} className="su-row eq-row">
              <input
                className="input"
                value={item.name}
                onChange={(e) => setEquipmentField(i, { name: e.target.value })}
                placeholder={t('Jihoz nomi')}
              />
              <input
                className="input eq-row__qty"
                type="number"
                min={1}
                value={item.quantity}
                onChange={(e) => setEquipmentField(i, { quantity: Number(e.target.value) || 1 })}
                placeholder={t('Soni')}
              />
              {item.id && item.image && !pendingImages[i] ? (
                <>
                  <a href={item.image} target="_blank" rel="noreferrer" className="btn btn--sm">
                    {IC.image} {t('Rasm')}
                  </a>
                  <button
                    type="button"
                    className="icon-btn icon-btn--danger"
                    onClick={async () => {
                      await removeImage.mutateAsync(item.id!)
                      setEquipmentField(i, { image: null })
                    }}
                    title={t("Rasmni o'chirish")}
                  >
                    {IC.trash}
                  </button>
                </>
              ) : (
                <input
                  className="input eq-row__file"
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null
                    setPendingImages((files) => files.map((f, idx) => (idx === i ? file : f)))
                  }}
                />
              )}
              <button type="button" className="icon-btn icon-btn--danger" onClick={() => removeEquipmentRow(i)} title={t("O'chirish")}>
                {IC.trash}
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="btn btn--sm" onClick={addEquipmentRow}>+ {t("Jihoz qo'shish")}</button>
      </div>

      <label className="field">
        <span className="field__label">{t('Bajarish tartibi')} <span className="field__opt">({t('har bir qadam yangi qatorda')})</span></span>
        <textarea className="input" rows={8} value={stepsText} onChange={(e) => setStepsText(e.target.value)} placeholder={`${t("O'quvchi qo'lini stol chetiga qo'yadi")}\n${t("Chizg'ich tushiriladi")}`} />
      </label>

      <label className="field">
        <span className="field__label">{t('O\'rganiladigan tushunchalar')} <span className="field__opt">({t('har biri yangi qatorda, ixtiyoriy')})</span></span>
        <textarea className="input" rows={4} value={conceptsText} onChange={(e) => setConceptsText(e.target.value)} placeholder={`${t('Om qonuni')}\n${t('Elektr qarshiligi')}`} />
      </label>

      <label className="field">
        <span className="field__label">{t('Xavfsizlik')} <span className="field__opt">({t('ixtiyoriy')})</span></span>
        <input className="input" value={draft.safety} onChange={(e) => setDraft({ ...draft, safety: e.target.value })} placeholder={t("Masalan: himoya ko'zoynagi majburiy")} />
      </label>

      <p className="prose prose--note">{t("Rasm yoki videoni Google Drive, Telegram kanal yoki YouTube'ga joylang, keyin shu yerga havolasini kiriting.")}</p>
      <div className="row row--2">
        <label className="field">
          <span className="field__label">{t('Rasm')} <span className="field__opt">({t('havola, ixtiyoriy')})</span></span>
          <input className="input" value={draft.image ?? ''} onChange={(e) => setDraft({ ...draft, image: e.target.value })} placeholder="https://drive.google.com/..." />
        </label>
        <label className="field">
          <span className="field__label">{t('Video')} <span className="field__opt">({t('havola, ixtiyoriy')})</span></span>
          <input className="input" value={draft.video ?? ''} onChange={(e) => setDraft({ ...draft, video: e.target.value })} placeholder="https://youtube.com/..." />
        </label>
      </div>
    </Modal>
  )
}
