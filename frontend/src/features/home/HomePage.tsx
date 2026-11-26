import { lazy, Suspense, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { Skeleton } from '@/components/Skeleton'
import { subjectLabel } from '@/features/lessons/labels'
import { type DayPlan, type PlanSlot, useDayPlan } from '@/features/staffroom/api'
import { useTimetable } from '@/features/timetable/api'
import type { TimetableSlot } from '@/features/timetable/types'
import { IC } from '@/icons'
import { isAdminInView, useAuth } from '@/lib/auth/AuthContext'
import { routeOn, useModules } from '@/lib/modules'
import { useSubjects } from '@/lib/subjects'
import { useUIStore } from '@/store/uiStore'

import { TelegramNudge } from './TelegramNudge'
import './home.css'

// the administration's platform overview — its own chunk, never loaded for a teacher
const HomeMonitoring = lazy(() => import('@/features/monitoring/Monitoring').then((m) => ({ default: m.HomeMonitoring })))

const WEEK = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba']
const SCHOOL_DAYS = ['Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma']
const MONTHS = [
  'yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
  'iyul', 'avgust', 'sentyabr', 'oktyabr', 'noyabr', 'dekabr',
]

function firstName(name: string) {
  return (name || '').trim().split(/\s+/)[0] || name || ''
}
function greetingKey(h: number) {
  return h < 5 ? 'Xayrli tun' : h < 12 ? 'Xayrli tong' : h < 18 ? 'Xayrli kun' : 'Xayrli kech'
}

/** The everyday sections, each with its own colour (tone) so they're told
 * apart at a glance. */
const LINKS: { view: string; ic: keyof typeof IC; title: string; sub: string; tone: string; adminOnly?: boolean; fizikaOnly?: boolean }[] = [
  { view: '/lessons', ic: 'lessons', title: 'Darslar', sub: 'Mavzular va tajribalar', tone: 'blue' },
  { view: '/journal', ic: 'gradebook', title: 'Jurnal', sub: 'Baho va davomat', tone: 'green' },
  { view: '/timetable', ic: 'timetable', title: 'Jadval', sub: 'Haftalik dars jadvali', tone: 'orange' },
  { view: '/staffroom', ic: 'users', title: 'Ustozlar xonasi', sub: 'Ertangi darslarga tayyorgarlik', tone: 'violet' },
  { view: '/library', ic: 'book', title: 'Kutubxona', sub: "Kitob, qo'llanma, video", tone: 'brown' },
  { view: '/lab', ic: 'flask', title: 'Laboratoriya', sub: 'Tajribalar, jihozlar va videolar', tone: 'teal' },
  { view: '/statistics', ic: 'chart', title: 'Statistika', sub: "Ko'rsatkichlar va sinflar kesimi", tone: 'rose', adminOnly: true },
]

const hm = (v: string | null) => (v ? v.slice(0, 5) : '')
const minutesOf = (v: string | null) => {
  if (!v) return null
  const [h, m] = v.split(':').map(Number)
  return h * 60 + m
}
type Status = 'done' | 'now' | 'next' | 'later'

const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** The next day after `from` (within a week) on which this person has a
 * lesson in the timetable — not just the next school day. */
function nextLessonDate(week: TimetableSlot[] | undefined, from: Date): string | null {
  const days = new Set((week ?? []).filter((s) => !s.band && (s.maktab || s.sinf)).map((s) => s.day_index))
  for (let k = 1; k <= 7; k++) {
    const d = new Date(from)
    d.setDate(d.getDate() + k)
    if (days.has((d.getDay() + 6) % 7)) return isoOf(d)
  }
  return null
}

/** The clock the statuses and countdowns follow — ticks every half minute. */
function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(id)
  }, [])
  return now
}

function statusesOf(slots: PlanSlot[], nowMin: number, isToday: boolean): Status[] {
  let nextGiven = false
  return slots.map((s) => {
    if (!isToday) return 'later'
    const a = minutesOf(s.time_from)
    const b = minutesOf(s.time_to)
    if (a != null && b != null && nowMin >= a && nowMin < b) return 'now'
    if (b != null && nowMin >= b) return 'done'
    if (!nextGiven) {
      nextGiven = true
      return 'next'
    }
    return 'later'
  })
}

export function HomePage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const viewMode = useUIStore((s) => s.viewMode)
  const lang = useUIStore((s) => s.lang)
  const navigate = useNavigate()
  const now = useClock()
  const admin = isAdminInView(user, viewMode)
  const { on } = useModules()
  const fan = useSubjects().current
  const timetableOn = on('timetable')

  const { data: week } = useTimetable()
  const today = useDayPlan('today')
  const todayLessons = (today.data?.slots ?? []).filter((s) => !s.band)
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const lastEnd = Math.max(-1, ...todayLessons.map((s) => minutesOf(s.time_to) ?? -1))
  // today's are over (or there are none): the next school day's come in
  const needNext = !!today.data && (todayLessons.length === 0 || nowMin >= lastEnd)
  const nextDate = nextLessonDate(week, now)
  const next = useDayPlan(nextDate ?? undefined, needNext && !!nextDate)
  const nextData = needNext && nextDate ? next.data : undefined

  const showToday = todayLessons.length > 0
  const plan: DayPlan | undefined = showToday ? today.data : nextData
  const planSlots = plan?.slots ?? []
  const statuses = statusesOf(planSlots.filter((s) => !s.band), nowMin, showToday)

  const weekCount = (week ?? []).filter((s) => !s.band && (s.maktab || s.sinf)).length
  const where = today.data?.place
  const links = LINKS.filter((l) => (!l.adminOnly || admin) && (!l.fizikaOnly || fan === 'fizika') && routeOn(l.view, on))

  const fmtDate = `${t(WEEK[now.getDay()])}, ${now.getDate()}-${t(MONTHS[now.getMonth()])}`
  const planDay = plan ? `${t(SCHOOL_DAYS[plan.weekday] ?? '')}, ${Number(plan.date.slice(8, 10))}-${t(MONTHS[Number(plan.date.slice(5, 7)) - 1])}` : ''

  return (
    <section className="hh">
      <header className="hh-hero">
        <div className="hh-hero__main">
          <p className="hh-hero__date">
            {fmtDate}
            {where?.chorak ? <span> · {where.chorak}-{t('chorak')}{where.week ? `, ${where.week}-${t('hafta')}` : ''}</span> : null}
          </p>
          <h1 className="hh-hero__hi">{t(greetingKey(now.getHours()))}, {firstName(user?.name ?? '')}!</h1>
          <p className="hh-hero__fan">
            {IC[fan === 'fizika' ? 'atom' : 'robot']} {subjectLabel(fan, lang)}
          </p>
          {timetableOn && (
            <ul className="hh-stats">
              <li><b>{todayLessons.length}</b><span>{t('bugun dars')}</span></li>
              <li><b>{weekCount}</b><span>{t('bu hafta')}</span></li>
              <li><b>{statuses.filter((s) => s === 'done').length}/{showToday ? todayLessons.length : 0}</b><span>{t("o'tildi")}</span></li>
            </ul>
          )}
        </div>
        {timetableOn && (
          <Spotlight
            loading={today.isLoading || next.isLoading}
            today={today.data}
            todayLessons={todayLessons}
            statuses={showToday ? statuses : []}
            nextPlan={nextData}
            nowMin={nowMin}
            hasWeek={weekCount > 0}
            admin={admin}
            onOpen={(path) => navigate(path)}
          />
        )}
      </header>

      {timetableOn && <TelegramNudge hasLessons={(week ?? []).some((s) => !s.band)} />}

      {admin && <Suspense fallback={<Skeleton lines={4} />}><HomeMonitoring /></Suspense>}

      <div className={`hh-grid ${timetableOn ? '' : 'hh-grid--solo'}`}>
        {timetableOn && (
          <section className="hh-card hh-day">
            <header className="hh-card__head">
              <h2 className="hh-card__title">
                {showToday ? t('Bugungi darslar') : plan ? `${planDay} — ${t('darslar')}` : t('Bugungi darslar')}
              </h2>
              {planSlots.length > 0 && <span className="hh-chip">{planSlots.filter((s) => !s.band).length} {t('ta dars')}</span>}
              <button type="button" className="hh-card__more" onClick={() => navigate('/timetable')}>{t('Jadval')} ›</button>
            </header>
            {today.isLoading || next.isLoading ? (
              <Skeleton lines={3} />
            ) : planSlots.length ? (
              <DayTimeline slots={planSlots} statuses={statuses} date={plan!.date} isToday={showToday}
                onOpen={(path) => navigate(path)} />
            ) : (
              <div className="hh-empty">
                <span className="hh-empty__ic" aria-hidden="true">{IC.timetable}</span>
                <p>{weekCount ? t("Bu kunga dars yo'q.") : admin ? t("Jadvalingizda dars yo'q.") : t("Jadvalingiz hali bo'sh — darslaringizni kiriting, shunda bu yerda har kuni darslar va mavzular chiqadi.")}</p>
                {!weekCount && !admin && (
                  <button type="button" className="btn btn--sm btn--primary" onClick={() => navigate('/timetable')}>{t('Jadvalni ochish')}</button>
                )}
              </div>
            )}
          </section>
        )}

        <nav className="hh-quick" aria-label={t("Bo'limlar")}>
          {links.map((l) => (
            <button key={l.view} type="button" className={`hh-q hh-q--${l.tone}`} onClick={() => navigate(l.view)}>
              <span className="hh-q__ic" aria-hidden="true">{IC[l.ic]}</span>
              <span className="hh-q__tx">
                <span className="hh-q__t">{t(l.title)}</span>
                <span className="hh-q__s">{t(l.sub)}</span>
              </span>
              <span className="hh-q__go" aria-hidden="true">›</span>
            </button>
          ))}
        </nav>
      </div>
    </section>
  )
}

function lessonWhere(s: PlanSlot) {
  const room = s.room?.trim()
  return [s.school, room ? (/^\d+$/.test(room) ? `${room}-xona` : room) : ''].filter(Boolean).join(' · ')
}

/** The hero's right side: the lesson on now, or the next one, with a countdown. */
function Spotlight({ loading, today, todayLessons, statuses, nextPlan, nowMin, hasWeek, admin, onOpen }: {
  loading: boolean
  today?: DayPlan
  todayLessons: PlanSlot[]
  statuses: Status[]
  nextPlan?: DayPlan
  nowMin: number
  hasWeek: boolean
  admin: boolean
  onOpen: (path: string) => void
}) {
  const { t } = useTranslation()
  if (loading) return <div className="hh-spot hh-spot--loading"><Skeleton lines={3} /></div>

  const nowIdx = statuses.indexOf('now')
  const nextIdx = statuses.indexOf('next')
  const pick = nowIdx >= 0 ? todayLessons[nowIdx] : nextIdx >= 0 ? todayLessons[nextIdx] : undefined
  const nextFirst = !pick ? (nextPlan?.slots ?? []).find((s) => !s.band) : undefined
  const slot = pick ?? nextFirst
  const date = pick ? today?.date : nextPlan?.date

  if (!slot) {
    return (
      <div className="hh-spot hh-spot--quiet">
        <span className="hh-spot__badge">{IC.timetable} {t('Dars jadvali')}</span>
        <p className="hh-spot__title">{todayLessons.length ? t('Bugungi darslar tugadi') : hasWeek ? t("Bu hafta boshqa dars yo'q") : admin ? t("Jadvalingizda dars yo'q") : t("Jadvalingiz hali bo'sh")}</p>
        {!hasWeek && !admin && (
          <button type="button" className="hh-spot__btn" onClick={() => onOpen('/timetable')}>{t('Jadvalni ochish')} ›</button>
        )}
      </div>
    )
  }

  const a = minutesOf(slot.time_from)
  const b = minutesOf(slot.time_to)
  let label = t('Keyingi dars')
  let when = ''
  if (pick && nowIdx >= 0) {
    label = t('Hozir dars')
    if (b != null) when = `${t('tugashiga')} ${b - nowMin} ${t('daqiqa')}`
  } else if (pick && a != null) {
    const left = a - nowMin
    when = left >= 60 ? `${Math.floor(left / 60)} ${t('soat')} ${left % 60} ${t('daqiqadan keyin')}` : `${left} ${t('daqiqadan keyin')}`
  } else if (nextPlan) {
    label = t('Keyingi dars kuni')
    when = `${t(SCHOOL_DAYS[nextPlan.weekday] ?? '')}${slot.time_from ? `, ${hm(slot.time_from)}` : ''}`
  }
  const journal = pick && slot.journal_class && date ? `/journal/${slot.journal_class.id}/day/${date}` : null

  return (
    <div className={`hh-spot ${nowIdx >= 0 && pick ? 'is-now' : ''}`}>
      <span className="hh-spot__badge">{nowIdx >= 0 && pick ? <i className="hh-pulse" aria-hidden="true" /> : IC.clock} {label}</span>
      <p className="hh-spot__when">{when}</p>
      <p className="hh-spot__title">
        {slot.class_name || t('Dars')}
        <small>{[slot.time_from ? `${hm(slot.time_from)}${slot.time_to ? `–${hm(slot.time_to)}` : ''}` : `${slot.period}-${t('soat')}`, lessonWhere(slot)].filter(Boolean).join(' · ')}</small>
      </p>
      {slot.lesson && (
        <button type="button" className="hh-spot__lesson" onClick={() => onOpen(`/lessons/${slot.lesson!.id}`)}>
          {IC.lessons} <span>{slot.lesson.title}</span>
        </button>
      )}
      {journal && (
        <button type="button" className="hh-spot__btn" onClick={() => onOpen(journal)}>{IC.gradebook} {t('Jurnalni ochish')}</button>
      )}
    </div>
  )
}

/** The day as a timeline: time, status, class and place, the week's topic
 * and the journal for the class. */
function DayTimeline({ slots, statuses, date, isToday, onOpen }: {
  slots: PlanSlot[]
  statuses: Status[]
  date: string
  isToday: boolean
  onOpen: (path: string) => void
}) {
  const { t } = useTranslation()
  const STATUS: Record<Status, string> = { done: "O'tildi", now: 'Hozir', next: 'Keyingi', later: '' }
  let i = -1
  return (
    <ol className="hh-tl">
      {slots.map((s) => {
        if (s.band) {
          return (
            <li key={`b${s.period}`} className="hh-tl__row is-band">
              <div className="hh-tl__time"><b>{hm(s.time_from) || `${s.period}-${t('soat')}`}</b>{s.time_to && <small>{hm(s.time_to)}</small>}</div>
              <span className="hh-tl__dot" aria-hidden="true" />
              <div className="hh-tl__body"><span className="hh-tl__band">{t('Band')} · {s.school || t('boshqa joyda')}</span></div>
            </li>
          )
        }
        i += 1
        const st = statuses[i] ?? 'later'
        return (
          <li key={s.period} className={`hh-tl__row is-${st}`}>
            <div className="hh-tl__time">
              <b>{hm(s.time_from) || `${s.period}-${t('soat')}`}</b>
              <small>{s.time_to ? hm(s.time_to) : s.time_from ? `${s.period}-${t('soat')}` : ''}</small>
            </div>
            <span className="hh-tl__dot" aria-hidden="true" />
            <div className="hh-tl__body">
              <div className="hh-tl__top">
                <b className="hh-tl__cls">{s.class_name || t('Dars')}</b>
                <span className="hh-tl__where">{lessonWhere(s)}</span>
                {STATUS[st] && <span className={`hh-tl__st hh-tl__st--${st}`}>{t(STATUS[st])}</span>}
              </div>
              {s.lesson ? (
                <button type="button" className="hh-tl__lesson" onClick={() => onOpen(`/lessons/${s.lesson!.id}`)}>
                  <span className="hh-tl__lic" aria-hidden="true">{IC.lessons}</span>
                  <span className="hh-tl__ltx">
                    <span className="hh-tl__lt">{s.lesson.title}</span>
                    <small>{s.lesson.hafta ? `${s.lesson.hafta}-${t('hafta')} · ` : ''}{s.lesson.experiments.length} {t('ta tajriba')}</small>
                  </span>
                </button>
              ) : (
                <span className="hh-tl__none">{t("Mavzu jadvaldan topilmadi — Ustozlar xonasida tanlang")}</span>
              )}
              {isToday && s.journal_class && (
                <div className="hh-tl__acts">
                  <button type="button" className="btn btn--sm" onClick={() => onOpen(`/journal/${s.journal_class!.id}/day/${date}`)}>
                    {IC.gradebook} {t('Jurnal')}
                  </button>
                </div>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
