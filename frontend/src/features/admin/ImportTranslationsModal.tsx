import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'

import { useImportTranslations } from './api'
import { parseTranslationsImport } from './importLessons'

export function ImportTranslationsModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const importTranslations = useImportTranslations()

  const onSubmit = async () => {
    const file = fileRef.current?.files?.[0]
    if (!file) return toast(t('Faylni tanlang'), 'error')

    setBusy(true)
    try {
      const rows = parseTranslationsImport(await file.text())
      const { ok, skipped } = await importTranslations.mutateAsync(rows)
      toast(`${ok} ${t('ta dars tarjimasi yozildi')}${skipped ? ` (${skipped} ${t("ta o'tkazib yuborildi")})` : ''}`)
      onClose()
    } catch (e) {
      toast(t(e instanceof Error ? e.message : 'Import xatosi'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={t('Tarjimalarni import qilish')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={busy}>{t('Bekor qilish')}</button>
          <button className="btn btn--primary" onClick={onSubmit} disabled={busy}>
            {busy ? t('Yozilmoqda…') : t('Import qilish')}
          </button>
        </>
      }
    >
      <p className="prose prose--note">
        {t("Tayyor tarjima faylini tanlang (har bir qatorda id yoki sinf+chorak+hafta+nom bo'yicha moslashtiriladi).")}
      </p>
      <label className="field">
        <span className="field__label">{t('Fayl')}</span>
        <input ref={fileRef} className="input" type="file" accept="application/json,.json" />
      </label>
    </Modal>
  )
}
