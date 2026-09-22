/** GET /api/dashboard/mastery/ — the org -> school -> class mastery
 * breakdown behind "O'quv jarayoni"'s Maktab/Sinf filters. Mirrors
 * dashboard/mastery.py's class_metrics()/mastery_trend() shapes exactly;
 * see that file for the field definitions. */

export type MasteryPeriod = 'week' | 'month' | 'quarter'
export type MasteryLevel = 'org' | 'school' | 'class'
export type MasteryForm = 'distribution' | 'comparison' | 'trend'

/** A real, distinguishable query value for "school left blank" — never
 * '' or null, so it survives a round trip through a query string.
 * Mirrors journal/schools.py's BLANK_SCHOOL_KEY. */
export const BLANK_SCHOOL_KEY = '__none__'

export interface MasteryMetrics {
  good: number
  mid: number
  bad: number
  ungraded: number
  class_avg: number | null
  class_pct: number | null
  graded_students: number
  total_students: number
  coverage_pct: number | null
  lesson_days: number
  attendance_rate_pct: number | null
  /** Shaky-but-real average (very few graded, or low coverage of a
   * non-trivial roster) — flagged, never hidden or averaged away. */
  thin: boolean
}

export interface MasteryTotals extends MasteryMetrics {
  total_classes: number
}

export interface MasteryBreakdownRow extends MasteryMetrics {
  key: string
  /** null only for the blank-school bucket — render Maktab ko'rsatilmagan. */
  label: string | null
  sublabel: string
  classes: number
  /** >1 distinct raw spellings merged into this key (e.g. "25-maktab" /
   * "25 maktab") — surfaced, never merged silently. */
  variants: string[]
  selected: boolean
}

export interface MasteryTrendPoint {
  key: string
  period: MasteryPeriod
  year?: number
  week?: number
  month?: number
  quarter?: number
  good: number
  mid: number
  bad: number
  class_avg: number | null
  class_pct: number | null
  graded_students: number
  total_students: number
  thin: boolean
}

export interface SchoolFilterOption {
  key: string
  label: string | null
  classes: number
  variants: string[]
}

export interface ClassFilterOption {
  id: number
  name: string
  school: string
  teacher: string
}

export interface MasteryScope {
  level: MasteryLevel
  school: string | null
  school_label: string | null
  class_id: number | null
  class_name: string | null
}

export interface MasteryBreakdownResponse {
  chorak: string
  period: MasteryPeriod
  scope: MasteryScope
  filters: { schools: SchoolFilterOption[]; classes: ClassFilterOption[] }
  totals: MasteryTotals
  breakdown: { level: 'school' | 'class'; rows: MasteryBreakdownRow[] }
  trend: {
    period: MasteryPeriod
    points: MasteryTrendPoint[]
    reference: MasteryTrendPoint[] | null
    /** period='quarter' always covers all four choraks — true whenever a
     * specific chorak filter is also active, so the UI can caption the
     * chart rather than let the chip and the chart silently disagree. */
    ignores_chorak_filter: boolean
  }
}
