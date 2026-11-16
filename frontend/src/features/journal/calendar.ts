import { type AcademicYear, useYears } from '@/features/schools/api'

import { localToday } from './lock'

/** The o'quv yili a date falls in, as its first calendar year — the
 * backend's schools.models.school_year_of (classes start in August). */
export const schoolYearOf = (iso: string) => {
  const [y, m] = iso.split('-').map(Number)
  return m >= 8 ? y : y - 1
}

/** Until the administration sets them — staffroom/calendar.py usual_quarters. */
const usualStarts = (y: number) => [`${y}-09-02`, `${y}-11-10`, `${y + 1}-01-11`, `${y + 1}-03-28`]

/** The chorak a journal day on `iso` is filed under — the backend's
 * staffroom.calendar.chorak_of, which has the last word: the chorak the
 * date falls in; in the holidays, the one that has just ended. */
export function chorakOf(iso: string, years: AcademicYear[] | undefined): number {
  const y = schoolYearOf(iso)
  const starts = years?.find((x) => x.start_year === y)?.quarters.map((q) => q.start) ?? usualStarts(y)
  let n = 1
  starts.forEach((s, i) => {
    if (iso >= s) n = i + 1
  })
  return n
}

/** Today's chorak by the calendar; null while the years load. */
export function useChorakNow(): number | null {
  const { data } = useYears()
  return data ? chorakOf(localToday(), data) : null
}

export type ChorakView = 1 | 2 | 3 | 4 | 'u'
type Pick = { q: ChorakView; asOf: number | null }
const PICK_KEY = 'afmd.chorak-pick'

/** The chorak picked by hand, with the calendar's chorak at that moment. */
export function readPick(): Pick | null {
  try {
    const v = JSON.parse(localStorage.getItem(PICK_KEY) || 'null')
    return v && (v.q === 'u' || [1, 2, 3, 4].includes(v.q)) ? (v as Pick) : null
  } catch {
    return null
  }
}

export function rememberPick(q: ChorakView, asOf: number | null): Pick {
  const v = { q, asOf }
  try {
    localStorage.setItem(PICK_KEY, JSON.stringify(v))
  } catch {
    // storage blocked: the pick lasts for this visit only
  }
  return v
}

/** What the journal shows: a hand-picked chorak holds only while the
 * calendar's chorak is the one it was picked in — once 2-chorak begins,
 * the journal opens on 2-chorak by itself. */
export function shownChorak(pick: Pick | null, now: number | null): ChorakView {
  if (pick && (now === null || pick.asOf === now)) return pick.q
  return (now ?? 1) as ChorakView
}
