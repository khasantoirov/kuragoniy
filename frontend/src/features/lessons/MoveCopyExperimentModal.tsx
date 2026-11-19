import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Modal } from '@/components/Modal'
import { useUIStore } from '@/store/uiStore'

import { useLessons } from './api'
import { type Grade, lessonLabel, quarterLabel, subjectOfGrade } from './labels'
import { useGradeOptions } from '@/lib/subjects'
import type { Experiment, Lesson } from './types'

export function MoveCopyExperimentModal({
  exp,
  mode,
  sourceLesson,
  onClose,
  onConfirm,
}: {
  exp: Experiment
  mode: 'copy' | 'move'
  sourceLesson: Lesson
  onClose: () => void
  onConfirm: (target: Lesson) => Promise<void>
}) {
  const { t } = useTranslation()
  const { lang } = useUIStore()
  const isMove = mode === 'move'
  const gradeOptions = useGradeOptions()

  const [grade, setGrade] = useState<Grade>(sourceLesson.grade)
  // Scoped to one grade at a time (rather than fetching every lesson
  // unfiltered) since the lessons list is paginated server-side — with
  // ~100 lessons across 3 grades, an unfiltered fetch would silently
  // truncate to the first page and drop grade 9 entirely.
  const { data, isLoading } = useLessons({ grade })

  // Har bir darsda bittadan amaliy topshiriq bo'lishi kerak — allaqachon
  // o'zining topshirig'i bor darsga yana bittasini ko'chirish/nusxalash
  // shu qoidani buzardi, shuning uchun ular ro'yxatdan chiqarib tashlanadi.
  const others = (data ?? [])
    // STEAM lessons hold one task; a physics lesson any number of experiments
    .filter((l) => l.id !== sourceLesson.id && (subjectOfGrade(l.grade) === 'fizika' || l.experiments.length === 0))
    .sort((a, b) => a.chorak - b.chorak || (a.hafta || 99) - (b.hafta || 99))

  const [targetId, setTargetId] = useState<number | ''>('')
  const [saving, setSaving] = useState(false)
  const selectedId = targetId || others[0]?.id || ''

  const submit = async () => {
    const target = others.find((l) => l.id === selectedId)
    if (!target) return
    setSaving(true)
    try {
      await onConfirm(target)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={isMove ? t("Amaliy topshiriqni ko'chirish") : t('Amaliy topshiriqni nusxalash')}
      onClose={onClose}
      footer={
        isLoading || others.length ? (
          <>
            <button className="btn" onClick={onClose}>{t('Bekor qilish')}</button>
            <button className="btn btn--primary" onClick={submit} disabled={saving || isLoading || !selectedId}>
              {isMove ? t("Ko'chirish") : t('Nusxalash')}
            </button>
          </>
        ) : (
          <button className="btn" onClick={onClose}>{t('Yopish')}</button>
        )
      }
    >
      <p className="prose prose--note">
        "{exp.name}" — {isMove ? t("bu amaliy topshiriqni qaysi darsga ko'chiramiz?") : t('bu amaliy topshiriqni qaysi darsga nusxalaymiz?')}
      </p>
      <div className="row row--2">
        <label className="field">
          <span className="field__label">{t('Sinf')}</span>
          <select
            className="input"
            value={grade}
            onChange={(e) => {
              setGrade(e.target.value as Grade)
              setTargetId('')
            }}
          >
            {gradeOptions.grades.map((g) => (
              <option key={g} value={g}>{gradeOptions.label(g)}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">{t('Dars')}</span>
          {isLoading ? (
            <select className="input" disabled>
              <option>{t('Yuklanmoqda…')}</option>
            </select>
          ) : others.length ? (
            <select className="input" value={selectedId} onChange={(e) => setTargetId(Number(e.target.value))}>
              {others.map((l) => (
                <option key={l.id} value={l.id}>
                  {quarterLabel(l.chorak, lang)}{l.hafta ? `, ${lessonLabel(l.hafta, lang)}` : ''} — {l.title}
                </option>
              ))}
            </select>
          ) : (
            <select className="input" disabled>
              <option>{t('Boshqa dars topilmadi')}</option>
            </select>
          )}
        </label>
      </div>
    </Modal>
  )
}
