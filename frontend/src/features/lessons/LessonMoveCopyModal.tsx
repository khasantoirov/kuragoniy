import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Modal } from '@/components/Modal'
import { useUIStore } from '@/store/uiStore'

import { GRADES, type Grade, gradeLabel, quarterLabel } from './labels'
import type { Lesson } from './types'

const CHORAKS = [1, 2, 3, 4]

export function LessonMoveCopyModal({
  lesson,
  mode,
  onClose,
  onConfirm,
}: {
  lesson: Lesson
  mode: 'move' | 'copy'
  onClose: () => void
  onConfirm: (grade: Grade, chorak: number) => Promise<void>
}) {
  const { t } = useTranslation()
  const { lang } = useUIStore()
  const isMove = mode === 'move'

  const [grade, setGrade] = useState<Grade>(lesson.grade)
  const [chorak, setChorak] = useState<number>(lesson.chorak)
  const [saving, setSaving] = useState(false)

  const unchanged = grade === lesson.grade && chorak === lesson.chorak

  const submit = async () => {
    setSaving(true)
    try {
      await onConfirm(grade, chorak)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={isMove ? t("Darsni ko'chirish") : t('Darsni nusxalash')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>{t('Bekor qilish')}</button>
          <button className="btn btn--primary" onClick={submit} disabled={saving || (isMove && unchanged)}>
            {isMove ? t("Ko'chirish") : t('Nusxalash')}
          </button>
        </>
      }
    >
      <p className="prose prose--note">
        "{lesson.title}" {isMove ? t("darsi qaysi sinf va chorakka ko'chirilsin?") : t('darsi qaysi sinf va chorakka nusxalansin?')}
      </p>
      <div className="row row--2">
        <label className="field">
          <span className="field__label">{t('Sinf')}</span>
          <select className="input" value={grade} onChange={(e) => setGrade(e.target.value as Grade)}>
            {GRADES.map((g) => (
              <option key={g} value={g}>{gradeLabel(g, lang)}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">{t('Chorak')}</span>
          <select className="input" value={chorak} onChange={(e) => setChorak(Number(e.target.value))}>
            {CHORAKS.map((c) => (
              <option key={c} value={c}>{quarterLabel(c, lang)}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="prose--note">
        {t("Dars tanlangan chorakning oxiriga qo'shiladi, hafta raqami avtomatik tartiblanadi.")}
      </p>
    </Modal>
  )
}
