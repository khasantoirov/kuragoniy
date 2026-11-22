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
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { type CSSProperties, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { EmptyState } from '@/components/EmptyState'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { IC } from '@/icons'
import { isAdminInView, useAuth } from '@/lib/auth/AuthContext'
import { usePageScrolled } from '@/lib/scroll'
import { type Lang, useUIStore } from '@/store/uiStore'

import { useLessons, useQuarterLocks, useReorderLesson } from './api'
import { ExperimentRow } from './ExperimentRow'
import { LessonEditor } from './LessonEditor'
import { useSubjects } from '@/lib/subjects'
import { chorakOf, useChorakNow } from '@/features/journal/calendar'
import { localToday } from '@/features/journal/lock'

import { gradeLabel, numberLabel, quarterLabel, subjectOfGrade } from './labels'
import { CATEGORY_LABELS, type Lesson, type LessonCategory } from './types'
import './quarters.css'

const dndIdOf = (id: number) => `lesson-${id}`
const chorakIdOf = (ch: number) => `ch-${ch}`
// the chorak switcher's buttons are drop targets too: a lesson dropped on
// one moves to the end of that chorak
const tabIdOf = (ch: number) => `tab-ch-${ch}`
const CHORAKS = [1, 2, 3, 4]
type Locks = Partial<Record<'1' | '2' | '3' | '4', boolean>> | undefined
const isOpenFor = (locks: Locks, ch: number) => !!locks?.[String(ch) as '1' | '2' | '3' | '4']

export function LessonsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const toast = useToast()
  const { user } = useAuth()
  const { grade: storedGrade, setGrade, lang, viewMode: appViewMode } = useUIStore()
  const fans = useSubjects()
  // the stored grade, kept inside the fan on show (AppShell's guard fixes the store itself)
  const grade = fans.grades.includes(storedGrade) ? storedGrade : fans.grades[0]
  const admin = isAdminInView(user, appViewMode)
  const { data, isLoading } = useLessons({ grade })
  const { data: locks, isLoading: locksLoading } = useQuarterLocks(fans.current)
  const reorder = useReorderLesson()
  const scrolled = usePageScrolled(4)
  // ?chorak=N — the chorak picked from the tabs; by default today's (by
  // the school calendar), or the nearest one this person may open
  const [params, setParams] = useSearchParams()
  const nowCh = useChorakNow() ?? chorakOf(localToday(), undefined)
  const openCh = (() => {
    const n = Number(params.get('chorak'))
    if (n >= 1 && n <= 4) return n
    if (admin || isOpenFor(locks, nowCh)) return nowCh
    const open = CHORAKS.filter((c) => isOpenFor(locks, c))
    return [...open].reverse().find((c) => c <= nowCh) ?? open[0] ?? nowCh
  })()
  const pickChorak = (ch: number) => {
    const next = new URLSearchParams(params)
    next.set('chorak', String(ch))
    setParams(next, { replace: true })
    window.scrollTo(0, 0)
  }

  const [query, setQuery] = useState('')
  // Amaliy fizika: lessons by bo'lim (Mexanika, Optika, ...), as on amaliyfizika.uz
  const fizika = fans.current === 'fizika'
  const [catPick, setCatFilter] = useState<LessonCategory | null>(null)
  const catFilter = fizika ? catPick : null
  const [creatingForQuarter, setCreatingForQuarter] = useState<number | null>(null)

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    data?.forEach((l) => { if (l.cat) c[l.cat] = (c[l.cat] ?? 0) + 1 })
    return c
  }, [data])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (data ?? []).filter((l) => {
      if (catFilter && l.cat !== catFilter) return false
      if (!q) return true
      return (
        l.title.toLowerCase().includes(q) ||
        l.goal.toLowerCase().includes(q) ||
        l.experiments.some((e) => e.name.toLowerCase().includes(q) || e.desc.toLowerCase().includes(q))
      )
    })
  }, [data, query, catFilter])

  const searching = !!(query.trim() || catFilter)
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
    if (overIdStr.startsWith('tab-ch-')) {
      toCh = Number(overIdStr.replace('tab-ch-', ''))
      if (toCh === moved.chorak) return
      index = rowsByChorak(toCh).length
    } else if (overIdStr.startsWith('ch-')) {
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

  // Fan (for whoever sees both) and Sinf — segmented controls at the head
  // of the one sticky bar.
  const grades = (
    <>
      <div className="seg ltbar__grades" role="group" aria-label={t('Sinf')}>
        {fans.grades.map((g) => (
          <button key={g} type="button" className={`seg__b ${g === grade ? 'is-on' : ''}`} aria-pressed={g === grade}
            onClick={() => setGrade(g)}>
            {gradeLabel(g, lang)}
          </button>
        ))}
      </div>
    </>
  )

  if (isLoading || locksLoading) return <><div className="ltbar">{grades}</div><Skeleton lines={4} /></>

  if (!data?.length) {
    return (
      <>
        <div className="ltbar">{grades}</div>
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

  const cats = fizika ? (Object.keys(CATEGORY_LABELS) as LessonCategory[]).filter((c) => counts[c]) : []

  return (
    <div>
      <div className={`ltbar ${cats.length ? '' : 'ltbar--nocats'} ${scrolled ? 'is-stuck' : ''}`}>
        {grades}
        <div className="search ltbar__search">
          <span className="search__ic" aria-hidden="true">{IC.search}</span>
          <input
            className="search__input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={fizika ? t("Mavzu yoki tajriba bo'yicha qidirish…") : t("Mavzu yoki amaliy topshiriq bo'yicha qidirish…")}
            autoComplete="off"
          />
          {query && (
            <button className="search__clear" onClick={() => setQuery('')} aria-label={t('Tozalash')}>
              {IC.close}
            </button>
          )}
        </div>
        {cats.length > 0 && (
          <>
            <div className="ltbar__cats" role="group" aria-label={t("Bo'lim")}>
              <button type="button" className={`lcat ${!catFilter ? 'is-on' : ''}`} aria-pressed={!catFilter} onClick={() => setCatFilter(null)}>
                {t('Hammasi')} <span className="lcat__n">{data.length}</span>
              </button>
              {cats.map((c) => (
                <button key={c} type="button" className={`lcat ${catFilter === c ? 'is-on' : ''}`} aria-pressed={catFilter === c}
                  onClick={() => setCatFilter(catFilter === c ? null : c)}>
                  {t(CATEGORY_LABELS[c])} <span className="lcat__n">{counts[c]}</span>
                </button>
              ))}
            </div>
            <select className="input ltbar__catsel" value={catFilter ?? ''} aria-label={t("Bo'lim")}
              onChange={(e) => setCatFilter((e.target.value || null) as LessonCategory | null)}>
              <option value="">{t('Hammasi')} ({data.length})</option>
              {cats.map((c) => <option key={c} value={c}>{t(CATEGORY_LABELS[c])} ({counts[c]})</option>)}
            </select>
          </>
        )}
      </div>

      {!filtered.length ? (
        <div className="empty">
          <div className="empty__rule" />
          <h3 className="empty__title">{t('Hech narsa topilmadi')}</h3>
          <p className="empty__hint">{t("Qidiruv shartini o'zgartirib ko'ring.")}</p>
        </div>
      ) : !searching ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <QuarterNav ch={openCh} locks={locks} admin={admin} canDrag={canDrag} lang={lang} onPick={pickChorak} />
          <QuarterSection
            ch={openCh}
            rows={filtered.filter((l) => l.chorak === openCh)}
            admin={admin}
            canDrag={canDrag}
            searching={false}
            lang={lang}
            locked={!admin && !isOpenFor(locks, openCh)}
            onOpen={(l) => navigate(`/lessons/${l.id}`)}
            onAdd={() => setCreatingForQuarter(openCh)}
          />
        </DndContext>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          {CHORAKS.map((ch) => {
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

/** The chorak tabs under the grade tabs (also drop targets: a lesson
 * dragged onto one moves to that chorak). */
function QuarterNav({ ch, locks, admin, canDrag, lang, onPick }: {
  ch: number
  locks: Locks
  admin: boolean
  canDrag: boolean
  lang: Lang
  onPick: (ch: number) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="qtrnav">
      <div className="seg qtrnav__tabs" role="group" aria-label={t('Chorak')}>
        {CHORAKS.map((n) => (
          <QuarterTab key={n} n={n} active={n === ch} locked={!admin && !isOpenFor(locks, n)} canDrag={canDrag}
            label={quarterLabel(n, lang)} onPick={() => onPick(n)} />
        ))}
      </div>
      {canDrag && <small className="qtrnav__hint">{t("Darsni boshqa chorakka o'tkazish uchun shu tugmalarga sudrang")}</small>}
    </div>
  )
}

function QuarterTab({ n, active, locked, canDrag, label, onPick }: {
  n: number
  active: boolean
  locked: boolean
  canDrag: boolean
  label: string
  onPick: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: tabIdOf(n), disabled: !canDrag || active })
  return (
    <button ref={setNodeRef} type="button" className={`seg__b ${active ? 'is-on' : ''} ${isOver ? 'is-over' : ''}`}
      aria-pressed={active} disabled={locked} onClick={onPick}>
      {locked && IC.lock} {label}
    </button>
  )
}

function QuarterSection({
  ch,
  rows,
  admin,
  canDrag,
  searching,
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
        <SortableContext items={ids} strategy={rectSortingStrategy}>
          <div ref={setNodeRef} className="grid">
            {rows.map((l) => (
              <LessonCard key={l.id} lesson={l} onOpen={() => onOpen(l)} canDrag={canDrag} />
            ))}
            {admin && !searching && (
              <button className="card card--add" onClick={onAdd}>
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

  const fizika = subjectOfGrade(lesson.grade) === 'fizika'
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
        <span className="card__week">{lesson.hafta ? numberLabel(lesson.hafta, lesson.grade, lang) : ''}</span>
        {lesson.cat ? <span className="tag">{t(CATEGORY_LABELS[lesson.cat])}</span> : null}
      </div>
      <h4 className="card__title">
        {lesson.title}
        {lesson.file_url && <span className="card__file" title={t('Dars fayli biriktirilgan')}>{IC.file}</span>}
      </h4>
      {lesson.goal && <p className="card__goal">{lesson.goal}</p>}
      {/* STEAM: har bir darsda bittadan amaliy topshiriq — bitta qatorcha.
          Amaliy fizika: darsning hamma tajribalari, turi bilan
          (amaliyfizika.uz'dagidek). */}
      {fizika ? (
        lesson.experiments.length ? (
          <ul className="exps">
            {lesson.experiments.map((e, i) => <ExperimentRow key={e.id ?? i} exp={e} typed />)}
          </ul>
        ) : (
          <p className="card__none">{t('Tajriba kiritilmagan')}</p>
        )
      ) : lesson.experiments[0] ? (
        <ul className="exps">
          <ExperimentRow exp={lesson.experiments[0]} />
        </ul>
      ) : (
        <p className="card__none">{t('Amaliy topshiriq kiritilmagan')}</p>
      )}
    </article>
  )
}
