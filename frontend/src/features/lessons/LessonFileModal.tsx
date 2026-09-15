import { isAxiosError } from 'axios'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'

import { useUploadLessonFile } from './api'
import { LessonFileField, useLessonFileField } from './LessonFileField'
import type { Lesson } from './types'

/** Quick standalone "attach a file" action, opened directly from the
 * lesson detail page (between "Darsni tahrirlash" and "O'chirish") — same
 * data (file) as LessonEditor's own field, just without opening the full
 * edit form for title/chorak/goal/etc. */
export function LessonFileModal({ lesson, onClose }: { lesson: Lesson; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const upload = useUploadLessonFile()
  const { pendingFile, setPendingFile } = useLessonFileField(lesson)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!pendingFile) {
      toast(t('Faylni tanlang'), 'error')
      return
    }
    setBusy(true)
    try {
      await upload.mutateAsync({ id: lesson.id, file: pendingFile })
      toast(t('Saqlandi'))
      onClose()
    } catch (err) {
      const detail = isAxiosError<{ detail?: string }>(err) ? err.response?.data?.detail : undefined
      toast(t(detail ?? 'Saqlashda xatolik'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={t('Dars faylini biriktirish')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>{t('Bekor qilish')}</button>
          <button className="btn btn--primary" onClick={submit} disabled={busy}>{t('Saqlash')}</button>
        </>
      }
    >
      <LessonFileField
        lesson={lesson}
        pendingFile={pendingFile}
        setPendingFile={setPendingFile}
      />
    </Modal>
  )
}
