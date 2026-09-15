import { isAxiosError } from 'axios'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { record } from '@/lib/history'
import { useUIStore } from '@/store/uiStore'

import { useDeleteLesson, useSaveLesson, useUploadLessonFile } from './api'
import { quarterLabel } from './labels'
import { LessonFileField, useLessonFileField } from './LessonFileField'
import { CATEGORY_LABELS, type Lesson, type LessonCategory } from './types'

function emptyLesson(grade: number, chorak: number): Partial<Lesson> {
  return { title: '', grade: grade as Lesson['grade'], chorak: chorak as Lesson['chorak'], hafta: 1, cat: 'boshqa', goal: '', file_url: '', experiments: [] }
}

export function LessonEditor({
  lesson,
  presetChorak = 1,
  onClose,
}: {
  lesson: Lesson | null
  presetChorak?: number
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { grade, lang } = useUIStore()
  const [draft, setDraft] = useState<Partial<Lesson>>(lesson ?? emptyLesson(grade, presetChorak))
  const { pendingFile, setPendingFile } = useLessonFileField(lesson)
  const save = useSaveLesson()
  const del = useDeleteLesson()
  const upload = useUploadLessonFile()
  const toast = useToast()

  const submit = async () => {
    if (!draft.title?.trim()) {
      toast(t('Mavzu nomini kiriting'), 'error')
      return
    }
    const payload = { ...draft, grade: lesson ? draft.grade : (grade as Lesson['grade']) }
    try {
      const saved = await save.mutateAsync(payload)
      if (pendingFile) {
        await upload.mutateAsync({ id: saved.id, file: pendingFile })
      }
      if (lesson) {
        record(
          t('Dars tahrirlandi'),
          async () => { await save.mutateAsync(lesson) },
          async () => { await save.mutateAsync(payload) },
        )
      } else {
        // A redo after undo recreates the lesson under a fresh id, so the
        // next undo must target that new id.
        let currentId = saved.id
        record(
          t("Dars qo'shildi"),
          async () => { await del.mutateAsync(currentId) },
          async () => { const r = await save.mutateAsync({ ...payload, id: undefined }); currentId = r.id },
        )
      }
      toast(t('Saqlandi'))
      onClose()
    } catch (err) {
      const detail = isAxiosError<{ detail?: string }>(err) ? err.response?.data?.detail : undefined
      toast(t(detail ?? 'Saqlashda xatolik'), 'error')
    }
  }

  return (
    <Modal
      title={lesson ? t('Darsni tahrirlash') : t('Yangi dars')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>{t('Bekor qilish')}</button>
          <button className="btn btn--primary" onClick={submit} disabled={save.isPending}>{t('Saqlash')}</button>
        </>
      }
    >
      <label className="field">
        <span className="field__label">{t('Mavzu nomi')}</span>
        <input className="input" value={draft.title ?? ''} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder={t('Masalan: Tezlik va tezlanish')} />
      </label>
      <div className="row">
        <label className="field">
          <span className="field__label">{t('Chorak')}</span>
          <select className="input" value={draft.chorak} onChange={(e) => setDraft({ ...draft, chorak: Number(e.target.value) as Lesson['chorak'] })}>
            {[1, 2, 3, 4].map((c) => (
              <option key={c} value={c}>{quarterLabel(c, lang)}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">{t('Hafta')}</span>
          <input className="input" type="number" min={1} max={99} value={draft.hafta ?? ''} onChange={(e) => setDraft({ ...draft, hafta: Number(e.target.value) })} />
        </label>
        <label className="field">
          <span className="field__label">{t("Bo'lim")}</span>
          <select className="input" value={draft.cat} onChange={(e) => setDraft({ ...draft, cat: e.target.value as LessonCategory })}>
            {(Object.keys(CATEGORY_LABELS) as LessonCategory[]).map((c) => (
              <option key={c} value={c}>{t(CATEGORY_LABELS[c])}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        <span className="field__label">{t('Maqsad')} <span className="field__opt">({t('ixtiyoriy')})</span></span>
        <textarea className="input" rows={2} value={draft.goal ?? ''} onChange={(e) => setDraft({ ...draft, goal: e.target.value })} placeholder={t("O'quvchi nimani o'rganadi")} />
      </label>
      <LessonFileField
        lesson={lesson}
        pendingFile={pendingFile}
        setPendingFile={setPendingFile}
      />
    </Modal>
  )
}
