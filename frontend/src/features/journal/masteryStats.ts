import type { Lang } from '@/store/uiStore'

import { asScale, avgLevel } from './scales'
import { computeStats } from './stats'
import { quarterLabel } from './labels'
import type { Grid, GridDay } from './types'

export type PeriodType = 'week' | 'month' | 'quarter' | 'year'

export interface Bucket {
  key: string
  sortKey: number
  period: PeriodType
  year: number
  week?: number
  month?: number
  quarter?: number
  days: GridDay[]
}

/** The five grading bands a pupil's period average falls into — the band
 * of the mark it rounds to (scales.ts), a'lo first. Keys match
 * dashboard/mastery.py's BANDS; colours are the journal's .gchip--<level>. */
export const BANDS = [
  { key: 'alo', level: 5, label: "A'lo" },
  { key: 'yaxshi', level: 4, label: 'Yaxshi' },
  { key: 'qoniqarli', level: 3, label: 'Qoniqarli' },
  { key: 'qoniqarsiz', level: 2, label: 'Qoniqarsiz' },
  { key: 'yomon', level: 1, label: 'Yomon' },
] as const

export type BandKey = (typeof BANDS)[number]['key']
export type BandCounts = Record<BandKey, number>

export const gradedOf = (c: BandCounts) => BANDS.reduce((n, b) => n + c[b.key], 0)

export interface BucketStats extends Bucket, BandCounts {
  label: string
  classPct: number | null
  ungraded: number
}

// ISO-8601 week number (Monday-start, week 1 = the week containing the
// year's first Thursday) — the standard definition, not a "days since
// Jan 1" approximation.
function isoWeek(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return { year: d.getUTCFullYear(), week }
}

export function bucketDays(days: GridDay[], period: PeriodType): Bucket[] {
  const buckets = new Map<string, Bucket>()
  for (const d of days) {
    const date = new Date(`${d.date}T00:00:00`)
    let key: string
    let meta: Partial<Bucket>
    if (period === 'week') {
      const { year, week } = isoWeek(date)
      key = `${year}-W${week}`
      meta = { sortKey: year * 100 + week, year, week }
    } else if (period === 'month') {
      const year = date.getFullYear()
      const month = date.getMonth()
      key = `${year}-${month}`
      meta = { sortKey: year * 100 + month, year, month }
    } else if (period === 'quarter') {
      key = `q${d.chorak}`
      meta = { sortKey: d.chorak, year: date.getFullYear(), quarter: d.chorak }
    } else {
      const year = date.getFullYear()
      key = `${year}`
      meta = { sortKey: year, year }
    }
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = { key, period, days: [], ...meta } as Bucket
      buckets.set(key, bucket)
    }
    bucket.days.push(d)
  }
  return [...buckets.values()].sort((a, b) => a.sortKey - b.sortKey)
}

/** Widened from Bucket to just the fields it reads: the org/school/class
 * mastery trend (features/statistics/masteryApi.ts) buckets server-side
 * and has no `days`/`key`/`sortKey` to hand back — every existing caller
 * (which does have a full Bucket) still satisfies this narrower type. */
export function bucketLabel(b: Pick<Bucket, 'period' | 'year' | 'week' | 'month' | 'quarter'>, lang: Lang): string {
  if (b.period === 'week') {
    if (lang === 'ru') return `${b.week}-я неделя`
    if (lang === 'en') return `Week ${b.week}`
    return `${b.week}-hafta`
  }
  if (b.period === 'month') {
    const locale = lang === 'ru' ? 'ru-RU' : lang === 'en' ? 'en-US' : 'uz-Latn'
    const label = new Date(b.year, b.month ?? 0, 1).toLocaleDateString(locale, { month: 'short', year: '2-digit' })
    return label.charAt(0).toUpperCase() + label.slice(1)
  }
  if (b.period === 'quarter') return quarterLabel(b.quarter ?? 1, lang)
  return String(b.year)
}

// A pupil's band is the mark their period average rounds to (4.5 → a'lo,
// 4.4 → yaxshi), not an arbitrary percentage cut.
export function bandOfAvg(avg: number): BandKey {
  const l = avgLevel(avg, 5)
  return BANDS.find((b) => l >= b.level)?.key ?? 'yomon'
}

export function computeMastery(grid: Pick<Grid, 'students' | 'scale'>, buckets: Bucket[], lang: Lang): BucketStats[] {
  // Bands go by colour level (0-5), so they mean the same on a 0-10 or 0-100 class.
  const scale = asScale(grid.scale)
  return buckets.map((b) => {
    const s = computeStats(grid, b.days, scale)
    const counts = Object.fromEntries(BANDS.map((x) => [x.key, 0])) as BandCounts
    let ungraded = 0
    for (const p of s.perStudent) {
      if (p.lvl === null) ungraded++
      else counts[bandOfAvg(p.lvl)]++
    }
    return { ...b, label: bucketLabel(b, lang), classPct: s.pct, ...counts, ungraded }
  })
}
