import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'

import type { Experiment } from './types'

function emptyExperiment(): Experiment {
  return { order: 0, name: '', desc: '', materials: [], steps: [], concepts: [], minutes: null, safety: '' }
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
  onSave: (exp: Experiment) => Promise<void>
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<Experiment>(exp ?? emptyExperiment())
  // materials/steps are edited as raw multi-line text, not the filtered
  // array directly — deriving the textarea's `value` from
  // materials.join('\n') after filtering out empty lines on every
  // keystroke stripped the blank line a lone Enter press had just
  // created (before any text followed it), so the cursor could never
  // move to a second line. Only split into a real array at submit time.
  const [materialsText, setMaterialsText] = useState((exp ?? emptyExperiment()).materials.join('\n'))
  const [stepsText, setStepsText] = useState((exp ?? emptyExperiment()).steps.join('\n'))
  const [conceptsText, setConceptsText] = useState((exp ?? emptyExperiment()).concepts.join('\n'))
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const isNew = !exp

  const submit = async () => {
    if (!draft.name.trim()) {
      toast(t('Tajriba nomini kiriting'), 'error')
      return
    }
    setBusy(true)
    try {
      await onSave({
        ...draft,
        materials: materialsText.split('\n').map((s) => s.trim()).filter(Boolean),
        steps: stepsText.split('\n').map((s) => s.trim()).filter(Boolean),
        concepts: conceptsText.split('\n').map((s) => s.trim()).filter(Boolean),
        image: toUrl(draft.image ?? ''),
        video: toUrl(draft.video ?? ''),
      })
      toast(isNew ? t("Tajriba qo'shildi") : t('Tajriba saqlandi'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={isNew ? t('Yangi tajriba') : t('Tajribani tahrirlash')}
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
        <span className="field__label">{t('Tajriba nomi')}</span>
        <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder={t("Masalan: Chizg'ich orqali reaksiya vaqti")} />
      </label>

      <label className="field">
        <span className="field__label">{t('Vaqti')} <span className="field__opt">{t('(daqiqa)')}</span></span>
        <input className="input" type="number" min={1} max={120} value={draft.minutes ?? ''} onChange={(e) => setDraft({ ...draft, minutes: e.target.value ? Number(e.target.value) : null })} placeholder="10" />
      </label>

      <label className="field">
        <span className="field__label">{t('Tavsif')} <span className="field__opt">({t("nima ko'rsatiladi")})</span></span>
        <textarea className="input" rows={2} value={draft.desc} onChange={(e) => setDraft({ ...draft, desc: e.target.value })} placeholder={t('Tajribaning mohiyati va kutilayotgan natija')} />
      </label>

      <label className="field">
        <span className="field__label">{t('Kerakli jihozlar')} <span className="field__opt">({t('har biri yangi qatorda')})</span></span>
        <textarea className="input" rows={6} value={materialsText} onChange={(e) => setMaterialsText(e.target.value)} placeholder={`${t("Chizg'ich")}\n${t('Sekundomer')}`} />
      </label>

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
