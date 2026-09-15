import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useToast } from '@/components/Toast'
import { IC } from '@/icons'

import { useRemoveLessonFile } from './api'
import type { Lesson } from './types'

export const LESSON_FILE_ACCEPT = '.pdf,.doc,.docx'

/** Shared local state for the pending file upload — used by both
 * LessonEditor (full lesson form) and LessonFileModal (quick attach, opened
 * directly from the lesson detail page) so they stay in sync. */
export function useLessonFileField(_lesson: Lesson | null) {
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  return { pendingFile, setPendingFile }
}

export function LessonFileField({
  lesson,
  pendingFile,
  setPendingFile,
}: {
  lesson: Lesson | null
  pendingFile: File | null
  setPendingFile: (file: File | null) => void
}) {
  const { t } = useTranslation()
  const removeFile = useRemoveLessonFile()
  const toast = useToast()

  return (
    <div className="field">
      <span className="field__label">{t('Dars fayli')} <span className="field__opt">({t('ixtiyoriy')})</span></span>
      {lesson?.file && !pendingFile ? (
        <div className="row row--2">
          <a className="btn btn--sm" href={lesson.file} target="_blank" rel="noreferrer">
            {IC.file} {t('Joriy faylni ochish')}
          </a>
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            disabled={removeFile.isPending}
            onClick={async () => {
              await removeFile.mutateAsync(lesson.id)
              toast(t("Fayl o'chirildi"))
            }}
          >
            {t("O'chirish")}
          </button>
        </div>
      ) : (
        <>
          <input
            className="input"
            type="file"
            accept={LESSON_FILE_ACCEPT}
            onChange={(e) => setPendingFile(e.target.files?.[0] ?? null)}
          />
          <span className="field__opt">{pendingFile ? pendingFile.name : t('PDF, DOC yoki DOCX — 20MB gacha')}</span>
        </>
      )}
    </div>
  )
}
