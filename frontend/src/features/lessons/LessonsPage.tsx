import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { type CSSProperties, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { EmptyState } from '@/components/EmptyState'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { IC } from '@/icons'
import { isAdminInView, useAuth } from '@/lib/auth/AuthContext'
import { type Lang, useUIStore } from '@/store/uiStore'

import { useLessons, useQuarterLocks, useReorderLesson } from './api'
import { ExperimentRow } from './ExperimentRow'
import { LessonEditor } from './LessonEditor'
import { gradeLabel, lessonLabel, quarterLabel } from './labels'
import type { Lesson } from './types'

type ViewMode = 'grid' | 'list'

const dndIdOf = (id: number) => `lesson-${id}`
const chorakIdOf = (ch: number) => `ch-${ch}`

export function LessonsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const toast = useToast()
  const { user } = useAuth()
  const { grade, lang, viewMode: appViewMode } = useUIStore()
  const admin = isAdminInView(user, appViewMode)
  const { data, isLoading } = useLessons({ grade })
  const { data: locks, isLoading: locksLoading } = useQuarterLocks()
  const reorder = useReorderLesson()

  const [query, setQuery] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [viewMenuOpen, setViewMenuOpen] = useState(false)
  const [creatingForQuarter, setCreatingForQuarter] = useState<number | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return data ?? []
    return (data ?? []).filter((l) =>
      l.title.toLowerCase().includes(q) ||
      l.goal.toLowerCase().includes(q) ||
      l.experiments.some((e) => e.name.toLowerCase().includes(q) || e.desc.toLowerCase().includes(q)),
    )
  }, [data, query])

  const searching = !!query.trim()
  const canDrag = admin && !searching

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || !data || String(over.id) === String(active.id)) return

    const activeId = Number(String(active.id).replace('lesson-', ''))
    const moved = data.find((l) => l.id === activeId)
    if (!moved) return

    const rowsByChorak = (ch: number) => data.filter((l) => l.chorak === ch)

    const overIdStr = String(over.id)
    let toCh: number
    let index: number
    if (overIdStr.startsWith('ch-')) {
      toCh = Number(overIdStr.replace('ch-', ''))
      index = rowsByChorak(toCh).filter((l) => l.id !== activeId).length
    } else {
      const overId = Number(overIdStr.replace('lesson-', ''))
      const overLesson = data.find((l) => l.id === overId)
      if (!overLesson) return
      toCh = overLesson.chorak
      const targetList = rowsByChorak(toCh).filter((l) => l.id !== activeId)
      index = targetList.findIndex((l) => l.id === overId)
      if (index < 0) index = targetList.length
    }

    reorder.mutate(
      { id: activeId, chorak: toCh, index },
      { onError: () => toast(t("Ko'chirishda xatolik"), 'error') },
    )
  }

  if (isLoading || locksLoading) return <Skeleton lines={4} />

  if (!data?.length) {
    return (
      <>
        <EmptyState
          title={`${gradeLabel(grade, lang)} — ${t("hali dars yo'q")}`}
          hint={admin ? t("Birinchi darsni qo'shing.") : t("Administrator darslarni qo'shgach shu yerda ko'rinadi.")}
          action={admin ? <button className="btn btn--primary" onClick={() => setCreatingForQuarter(1)}>{t("Dars qo'shish")}</button> : undefined}
        />
        {creatingForQuarter !== null && (
          <LessonEditor lesson={null} presetChorak={creatingForQuarter} onClose={() => setCreatingForQuarter(null)} />
        )}
      </>
    )
  }

  return (
    <div>
      <div className="toolbar">
        <div className="search">
          <span className="search__ic" aria-hidden="true">{IC.search}</span>
          <input
            className="search__input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("Mavzu yoki amaliy topshiriq bo'yicha qidirish…")}
            autoComplete="off"
          />
          {query && (
            <button className="search__clear" onClick={() => setQuery('')} aria-label={t('Tozalash')}>
              {IC.close}
            </button>
          )}
        </div>
        <div className="chips chips--cat">
          <div className="viewpick">
            <button className="btn btn--sm viewpick__btn" onClick={() => setViewMenuOpen((v) => !v)}>
              {viewMode === 'list' ? IC.list : IC.grid}
              <span>{t("Ko'rinish")}</span>
              <span className="viewpick__cx" aria-hidden="true">▾</span>
            </button>
            {viewMenuOpen && (
              <div className="acct__pop viewpick__pop">
                <button
                  className={`acct__item ${viewMode === 'grid' ? 'is-on' : ''}`}
                  onClick={() => { setViewMode('grid'); setViewMenuOpen(false) }}
                >
                  {IC.grid} {t('Katak')}
                </button>
                <button
                  className={`acct__item ${viewMode === 'list' ? 'is-on' : ''}`}
                  onClick={() => { setViewMode('list'); setViewMenuOpen(false) }}
                >
                  {IC.list} {t("Ro'yxat")}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {!filtered.length ? (
        <div className="empty">
          <div className="empty__rule" />
          <h3 className="empty__title">{t('Hech narsa topilmadi')}</h3>
          <p className="empty__hint">{t("Qidiruv shartini o'zgartirib ko'ring.")}</p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          {[1, 2, 3, 4].map((ch) => {
            const rows = filtered.filter((l) => l.chorak === ch)
            const isOpen = !!locks?.[String(ch) as '1' | '2' | '3' | '4']
            const lockedForMe = !admin && !isOpen
            if (!rows.length && !lockedForMe && (searching || !admin)) return null

            return (
              <QuarterSection
                key={ch}
                ch={ch}
                rows={rows}
                admin={admin}
                canDrag={canDrag}
                searching={searching}
                viewMode={viewMode}
                lang={lang}
                locked={lockedForMe}
                onOpen={(l) => navigate(`/lessons/${l.id}`)}
                onAdd={() => setCreatingForQuarter(ch)}
              />
            )
          })}
        </DndContext>
      )}

      {creatingForQuarter !== null && (
        <LessonEditor lesson={null} presetChorak={creatingForQuarter} onClose={() => setCreatingForQuarter(null)} />
      )}
    </div>
  )
}

function QuarterSection({
  ch,
  rows,
  admin,
  canDrag,
  searching,
  viewMode,
  lang,
  locked,
  onOpen,
  onAdd,
}: {
  ch: number
  rows: Lesson[]
  admin: boolean
  canDrag: boolean
  searching: boolean
  viewMode: ViewMode
  lang: Lang
  locked: boolean
  onOpen: (lesson: Lesson) => void
  onAdd: () => void
}) {
  const { t } = useTranslation()
  const { setNodeRef } = useDroppable({ id: chorakIdOf(ch), disabled: !canDrag })
  const ids = rows.map((l) => dndIdOf(l.id))

  return (
    <section className="quarter">
      <div className="quarter__head">
        <span className="qwave" aria-hidden="true" />
        <h3 className="quarter__title">{quarterLabel(ch, lang)}</h3>
        <span className="quarter__count">{rows.length} {t('ta dars')}</span>
        <span className="qwave" aria-hidden="true" />
      </div>

      {locked ? (
        <div className="qlocked">
          {IC.lock}
          <p>{t("Bu chorak hali ochilmagan. Administrator ochgach shu yerda ko'rinadi.")}</p>
        </div>
      ) : (
        <SortableContext items={ids} strategy={viewMode === 'list' ? verticalListSortingStrategy : rectSortingStrategy}>
          <div ref={setNodeRef} className={viewMode === 'list' ? 'list' : 'grid'}>
            {rows.map((l) =>
              viewMode === 'list' ? (
                <LessonRow key={l.id} lesson={l} onOpen={() => onOpen(l)} canDrag={canDrag} />
              ) : (
                <LessonCard key={l.id} lesson={l} onOpen={() => onOpen(l)} canDrag={canDrag} />
              ),
            )}
            {admin && !searching && (
              <button className={viewMode === 'list' ? 'lrow lrow--add' : 'card card--add'} onClick={onAdd}>
                <span className="card--add__plus">+</span>
                <span>{t("Dars qo'shish")}</span>
              </button>
            )}
          </div>
        </SortableContext>
      )}
    </section>
  )
}

function LessonCard({ lesson, onOpen, canDrag = false }: { lesson: Lesson; onOpen: () => void; canDrag?: boolean }) {
  const { t } = useTranslation()
  const { lang } = useUIStore()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: dndIdOf(lesson.id),
    disabled: !canDrag,
  })
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <article ref={setNodeRef} style={style} className="card card--click" onClick={onOpen} tabIndex={0} role="button">
      <div className="card__meta">
        {canDrag && (
          <button
            type="button"
            className="card__grip"
            aria-label={t("Ko'chirish uchun ushlab torting")}
            onClick={(e) => e.stopPropagation()}
            {...attributes}
            {...listeners}
          >
            {IC.grip}
          </button>
        )}
        <span className="card__week">{lesson.hafta ? lessonLabel(lesson.hafta, lang) : ''}</span>
      </div>
      <h4 className="card__title">
        {lesson.title}
        {lesson.file_url && <span className="card__file" title={t('Dars fayli biriktirilgan')}>{IC.file}</span>}
      </h4>
      {lesson.goal && <p className="card__goal">{lesson.goal}</p>}
      {/* Har bir darsda bittadan amaliy topshiriq bo'ladi — ro'yxat emas,
          shuning uchun bor-yo'g'i shu bitta qatorcha ko'rsatiladi. */}
      {lesson.experiments[0] ? (
        <ul className="exps">
          <ExperimentRow exp={lesson.experiments[0]} />
        </ul>
      ) : (
        <p className="card__none">{t('Amaliy topshiriq kiritilmagan')}</p>
      )}
    </article>
  )
}

function LessonRow({ lesson, onOpen, canDrag = false }: { lesson: Lesson; onOpen: () => void; canDrag?: boolean }) {
  const { t } = useTranslation()
  const { lang } = useUIStore()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: dndIdOf(lesson.id),
    disabled: !canDrag,
  })
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <article ref={setNodeRef} style={style} className="lrow card--click" onClick={onOpen} tabIndex={0} role="button">
      {canDrag && (
        <button
          type="button"
          className="lrow__grip"
          aria-label={t("Ko'chirish uchun ushlab torting")}
          onClick={(e) => e.stopPropagation()}
          {...attributes}
          {...listeners}
        >
          {IC.grip}
        </button>
      )}
      <span className="lrow__week">{lesson.hafta ? lessonLabel(lesson.hafta, lang) : ''}</span>
      <h4 className="lrow__title">
        {lesson.title}
        {lesson.file_url && <span className="lrow__file" title={t('Dars fayli biriktirilgan')}>{IC.file}</span>}
      </h4>
      <span className="lrow__x">
        {lesson.experiments.length > 0 ? t('Amaliy topshiriq bor') : t("Amaliy topshiriq yo'q")}
      </span>
    </article>
  )
}
