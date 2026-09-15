import { closestCenter, DndContext, type DragEndEvent, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core'
import { rectSortingStrategy, SortableContext, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'

import { useConfirm } from '@/components/ConfirmProvider'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { IC } from '@/icons'
import { isAdminInView, useAuth } from '@/lib/auth/AuthContext'
import { record } from '@/lib/history'
import { useTranslationSocket } from '@/lib/ws/useTranslationSocket'
import { useUIStore } from '@/store/uiStore'

import { useDeleteLesson, useLesson, useMoveCopyLesson, useRemoveLessonFile, useSaveLesson } from './api'
import { ExperimentCard } from './ExperimentCard'
import { ExperimentEditor } from './ExperimentEditor'
import { quarterLabel, weekLabel } from './labels'
import { LessonDocCard } from './LessonDocCard'
import { LessonEditor } from './LessonEditor'
import { LessonFileModal } from './LessonFileModal'
import { LessonMoveCopyModal } from './LessonMoveCopyModal'
import { MoveCopyExperimentModal } from './MoveCopyExperimentModal'
import { CATEGORY_LABELS, type Experiment, type Lesson } from './types'

export function LessonDetail() {
  const { t } = useTranslation()
  const { lang, viewMode, setGrade } = useUIStore()
  const { id } = useParams()
  const lessonId = Number(id)
  const navigate = useNavigate()
  const { user } = useAuth()
  const admin = isAdminInView(user, viewMode)
  const { data: lesson, isLoading } = useLesson(lessonId)
  const save = useSaveLesson()
  const del = useDeleteLesson()
  const removeFile = useRemoveLessonFile()
  const moveCopy = useMoveCopyLesson()
  const confirm = useConfirm()
  const toast = useToast()

  const [editingLesson, setEditingLesson] = useState(false)
  const [attachingFile, setAttachingFile] = useState(false)
  const [editingExp, setEditingExp] = useState<Experiment | 'new' | null>(null)
  const [movingExp, setMovingExp] = useState<{ exp: Experiment; mode: 'copy' | 'move' } | null>(null)
  const [movingLesson, setMovingLesson] = useState<'copy' | 'move' | null>(null)

  const pending = !lesson?.translated_at || new Date(lesson.translated_at) < new Date(lesson.updated_at)
  useTranslationSocket(pending ? lessonId : null)

  // Must run unconditionally (before the early returns below) — hooks
  // can't be called only on some renders, and isLoading/!lesson both
  // change across renders of the same mounted component.
  const expSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  if (!id || Number.isNaN(lessonId)) return <Navigate to="/lessons" replace />
  if (isLoading) return <Skeleton lines={5} />
  if (!lesson) return <Navigate to="/lessons" replace />

  const saveExperiments = async (experiments: Experiment[], label?: string) => {
    const before = lesson.experiments
    try {
      await save.mutateAsync({ id: lesson.id, experiments })
      if (label) {
        record(
          label,
          async () => { await save.mutateAsync({ id: lesson.id, experiments: before }) },
          async () => { await save.mutateAsync({ id: lesson.id, experiments }) },
        )
      }
      toast(t('Saqlandi'))
    } catch {
      toast(t('Saqlashda xatolik'), 'error')
    }
  }

  const onDeleteExp = async (exp: Experiment) => {
    if (!(await confirm({ title: t("Tajribani o'chirish"), text: `"${exp.name}" ${t("o'chiriladi.")}`, danger: true }))) return
    await saveExperiments(lesson.experiments.filter((e) => e.id !== exp.id), t("Tajriba o'chirildi"))
  }

  const onExpDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || String(over.id) === String(active.id)) return
    const fromId = Number(String(active.id).replace('exp-', ''))
    const toId = Number(String(over.id).replace('exp-', ''))
    const fromIndex = lesson.experiments.findIndex((e) => e.id === fromId)
    const toIndex = lesson.experiments.findIndex((e) => e.id === toId)
    if (fromIndex < 0 || toIndex < 0) return

    const reordered = [...lesson.experiments]
    const [moved] = reordered.splice(fromIndex, 1)
    reordered.splice(toIndex, 0, moved)
    saveExperiments(
      reordered.map((e, i) => ({ ...e, order: i })),
      t("Tajriba tartibi o'zgartirildi"),
    )
  }

  const onMoveCopyExp = async (target: Lesson) => {
    if (!movingExp) return
    const { exp, mode } = movingExp
    const isMove = mode === 'move'
    const { id: _expId, ...expWithoutId } = exp
    const targetBefore = target.experiments
    const sourceBefore = lesson.experiments
    const targetAfter = [...target.experiments, { ...expWithoutId, order: target.experiments.length }]
    const sourceAfter = isMove ? lesson.experiments.filter((e) => e.id !== exp.id) : lesson.experiments

    const apply = async (targetExps: Experiment[], sourceExps: Experiment[]) => {
      await save.mutateAsync({ id: target.id, experiments: targetExps })
      if (isMove) await save.mutateAsync({ id: lesson.id, experiments: sourceExps })
    }

    try {
      await apply(targetAfter, sourceAfter)
      record(
        isMove ? t("Tajriba ko'chirildi") : t('Tajriba nusxalandi'),
        async () => apply(targetBefore, sourceBefore),
        async () => apply(targetAfter, sourceAfter),
      )
      toast(isMove ? t("Tajriba ko'chirildi") : t('Tajriba nusxalandi'))
    } catch {
      toast(t('Saqlashda xatolik'), 'error')
    }
  }

  const onDeleteDoc = async () => {
    if (!(await confirm({ title: t("Dars hujjatini o'chirish"), text: t("Dars hujjati o'chiriladi."), danger: true }))) return
    try {
      if (lesson.file) await removeFile.mutateAsync(lesson.id)
      else await save.mutateAsync({ id: lesson.id, file_url: '' })
      toast(t("Fayl o'chirildi"))
    } catch {
      toast(t('Saqlashda xatolik'), 'error')
    }
  }

  const onMoveCopyLesson = async (grade: number, chorak: number) => {
    if (!movingLesson) return
    const mode = movingLesson
    const isMove = mode === 'move'
    const originalGrade = lesson.grade
    const originalChorak = lesson.chorak

    try {
      const result = await moveCopy.mutateAsync({ id: lesson.id, mode, grade, chorak })
      if (isMove) {
        setGrade(grade)
        record(
          t("Dars ko'chirildi"),
          async () => { await moveCopy.mutateAsync({ id: lesson.id, mode: 'move', grade: originalGrade, chorak: originalChorak }) },
          async () => { await moveCopy.mutateAsync({ id: lesson.id, mode: 'move', grade, chorak }) },
        )
      } else {
        // Redo re-copies rather than restoring the exact same id — same
        // "recreate under a fresh id" tradeoff as undoing a lesson delete.
        record(
          t('Dars nusxalandi'),
          async () => { await del.mutateAsync(result.id) },
          async () => { await moveCopy.mutateAsync({ id: lesson.id, mode: 'copy', grade, chorak }) },
        )
      }
      toast(isMove ? t("Dars ko'chirildi") : t('Dars nusxalandi'))
    } catch {
      toast(t('Saqlashda xatolik'), 'error')
    }
  }

  const onDeleteLesson = async () => {
    if (!(await confirm({ title: t("Darsni o'chirish"), text: `"${lesson.title}" ${t("va undagi barcha tajribalar o'chiriladi.")}`, danger: true }))) return
    await del.mutateAsync(lesson.id)
    // Undo recreates the lesson under a fresh id (REST create can't reuse
    // the deleted one), so redo must delete THAT new id, not the original.
    let currentId = lesson.id
    const snapshot = { title: lesson.title, grade: lesson.grade, chorak: lesson.chorak, hafta: lesson.hafta, cat: lesson.cat, goal: lesson.goal, file_url: lesson.file_url, experiments: lesson.experiments }
    record(
      t("O'chirildi"),
      async () => { const r = await save.mutateAsync(snapshot); currentId = r.id },
      async () => { await del.mutateAsync(currentId) },
    )
    toast(t("O'chirildi"))
    navigate('/lessons')
  }

  return (
    <div>
      <button className="btn btn--sm" onClick={() => navigate('/lessons')}>
        {IC.back} {t('Barcha darslar')}
      </button>

      <header className="lhead">
        <div className="lhead__meta">
          <span className="tag">{t(CATEGORY_LABELS[lesson.cat])}</span>
          <span className="lhead__q">{quarterLabel(lesson.chorak, lang)}</span>
          {lesson.hafta ? <span className="lhead__q">{weekLabel(lesson.hafta, lang)}</span> : null}
        </div>
        <h2 className="lhead__title">{lesson.title}</h2>
        {lesson.goal && <p className="lhead__goal">{lesson.goal}</p>}
        <div className="lhead__tools">
          {lesson.sim_id && (
            <Link className="btn btn--sm" to={`/lab/${lesson.sim_id}`}>
              {IC.flask} {t('Simulyatsiya')}
            </Link>
          )}
          {admin && (
            <>
              <button className="btn btn--sm" onClick={() => setEditingLesson(true)}>
                {t('Darsni tahrirlash')}
              </button>
              <button className="btn btn--sm" onClick={() => setAttachingFile(true)}>
                {IC.file} {t('Fayl biriktirish')}
              </button>
              <button className="icon-btn" onClick={() => setMovingLesson('copy')} title={t('Nusxa olish')} aria-label={t('Nusxa olish')}>
                {IC.copy}
              </button>
              <button className="icon-btn" onClick={() => setMovingLesson('move')} title={t("Boshqa sinf/chorakka ko'chirish")} aria-label={t("Boshqa sinf/chorakka ko'chirish")}>
                {IC.move}
              </button>
              <button className="btn btn--sm btn--ghost" onClick={onDeleteLesson}>
                {t("O'chirish")}
              </button>
            </>
          )}
        </div>
      </header>

      <LessonDocCard lesson={lesson} admin={admin} onDelete={onDeleteDoc} />

      <div className="quarter__head">
        <h3 className="quarter__title">{t('Tajribalar')}</h3>
        <span className="quarter__count">{lesson.experiments.length} ta</span>
        <span className="qwave" aria-hidden="true" />
        {admin && (
          <button className="btn btn--sm btn--primary" onClick={() => setEditingExp('new')}>
            {t('+ Tajriba')}
          </button>
        )}
      </div>

      {lesson.experiments.length ? (
        <DndContext sensors={expSensors} collisionDetection={closestCenter} onDragEnd={onExpDragEnd}>
          <SortableContext items={lesson.experiments.map((e) => `exp-${e.id}`)} strategy={rectSortingStrategy}>
            <div className="xgrid">
              {lesson.experiments.map((e, i) => (
                <ExperimentCard
                  key={e.id ?? i}
                  exp={e}
                  admin={admin}
                  canDrag={admin && lesson.experiments.length > 1}
                  onEdit={() => setEditingExp(e)}
                  onDelete={() => onDeleteExp(e)}
                  onCopy={() => setMovingExp({ exp: e, mode: 'copy' })}
                  onMove={() => setMovingExp({ exp: e, mode: 'move' })}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="xgrid">
          <p className="prose">{t('Bu darsga hali tajriba kiritilmagan.')}</p>
        </div>
      )}

      {editingLesson && <LessonEditor lesson={lesson} onClose={() => setEditingLesson(false)} />}

      {attachingFile && <LessonFileModal lesson={lesson} onClose={() => setAttachingFile(false)} />}

      {movingLesson && (
        <LessonMoveCopyModal
          lesson={lesson}
          mode={movingLesson}
          onClose={() => setMovingLesson(null)}
          onConfirm={onMoveCopyLesson}
        />
      )}

      {movingExp && (
        <MoveCopyExperimentModal
          exp={movingExp.exp}
          mode={movingExp.mode}
          sourceLesson={lesson}
          onClose={() => setMovingExp(null)}
          onConfirm={onMoveCopyExp}
        />
      )}

      {editingExp && (
        <ExperimentEditor
          exp={editingExp === 'new' ? null : editingExp}
          onClose={() => setEditingExp(null)}
          onSave={async (exp) => {
            const next =
              editingExp === 'new'
                ? [...lesson.experiments, { ...exp, order: lesson.experiments.length }]
                : lesson.experiments.map((e) => (e.id === (editingExp as Experiment).id ? { ...exp, id: e.id } : e))
            await saveExperiments(next, editingExp === 'new' ? t("Tajriba qo'shildi") : t('Tajriba tahrirlandi'))
            setEditingExp(null)
          }}
        />
      )}
    </div>
  )
}
