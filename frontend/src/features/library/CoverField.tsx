import { useTranslation } from 'react-i18next'

import { IC } from '@/icons'

/** The editor's "Muqova" row: a book-shaped preview plus pick an image,
 * take the PDF's first page, or remove. */
export function CoverField({ preview, busy, canFromPdf, onImage, onPdf, onRemove }: {
  preview: string | null
  busy: boolean
  canFromPdf: boolean
  onImage: (file: File) => void
  onPdf: () => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="field">
      <span className="field__label">{t('Muqova')} <span className="field__opt">({t('ixtiyoriy')})</span></span>
      <div className="lcover">
        <div className={`lcover__thumb ${busy ? 'is-busy' : ''}`}>
          {preview ? <img src={preview} alt={t('Muqova')} /> : <span className="lcover__empty">{IC.image}</span>}
          {busy && <span className="lcover__spin" aria-label={t('Muqova tayyorlanmoqda…')} />}
        </div>
        <div className="lcover__side">
          <p className="prose prose--note">{t("Kitob yuzidagi rasm — JPG, PNG yoki WEBP. Javonda material shu muqova bilan turadi.")}</p>
          <div className="lcover__acts">
            <label className={`btn btn--sm ${busy ? 'is-disabled' : ''}`}>
              {IC.image} {t('Rasm tanlash')}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (f) onImage(f)
                }}
              />
            </label>
            {canFromPdf && (
              <button type="button" className="btn btn--sm" disabled={busy} onClick={onPdf}>
                {IC.book} {t('PDF 1-sahifasidan')}
              </button>
            )}
            {preview && (
              <button type="button" className="btn btn--sm btn--ghost" disabled={busy} onClick={onRemove}>
                {IC.trash} {t('Olib tashlash')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
