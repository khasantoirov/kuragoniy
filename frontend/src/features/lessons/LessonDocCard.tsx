import { useTranslation } from 'react-i18next'

import { IC } from '@/icons'

import type { Lesson } from './types'

function formatSize(bytes?: number | null): string {
  if (!bytes) return ''
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

function fileExt(name?: string | null): string {
  return (name ?? '').toLowerCase().split('.').pop() ?? ''
}

export function LessonDocCard({
  lesson,
  admin,
  onDelete,
}: {
  lesson: Lesson
  admin: boolean
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const url = lesson.file || lesson.file_url
  if (!url) return null

  const isUpload = !!lesson.file
  const ext = fileExt(lesson.file_name)
  const isWord = ext === 'doc' || ext === 'docx'
  const kindLabel = isUpload ? (isWord ? t('Word hujjat') : ext === 'pdf' ? t('PDF hujjat') : t('Hujjat')) : t('Havola')
  const name = isUpload ? lesson.file_name : url
  const meta = isUpload ? `${kindLabel} · ${formatSize(lesson.file_size)}` : kindLabel

  return (
    <section className="docsec">
      <h3 className="panel__title">{IC.file} {t('Dars hujjati')}</h3>
      <p className="prose--note">{t('Faylni ochish uchun bosing')}</p>
      <div className="doccard">
        <a className="doccard__open" href={url} target="_blank" rel="noreferrer" aria-label={t('Ochish')}>
          <span className={`doccard__ic ${isWord ? 'doccard__ic--word' : ''}`}>{IC.file}</span>
          <span className="doccard__body">
            <span className="doccard__name">{name}</span>
            <span className="doccard__meta">{meta}</span>
          </span>
        </a>
        {admin && (
          <span className="doccard__acts">
            {isUpload && (
              <a className="btn btn--sm btn--ghost doccard__act" href={url} download>
                {IC.download} {t('Yuklab olish')}
              </a>
            )}
            <button type="button" className="icon-btn icon-btn--danger" onClick={onDelete} title={t("O'chirish")} aria-label={t("O'chirish")}>
              {IC.trash}
            </button>
          </span>
        )}
      </div>
    </section>
  )
}
