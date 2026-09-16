import type { Lang } from '@/store/uiStore'

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

export interface BucketStats extends Bucket {
  label: string
  classPct: number | null
  good: number
  mid: number
  bad: number
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

export function bucketLabel(b: Bucket, lang: Lang): string {
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

// Bands follow the nearest whole grade a student's period average rounds
// to, not an arbitrary percentage cut: Yaxshi = rounds to 5, O'rtacha =
// rounds to 4, Past = rounds to 3 or below (2.5/1.5 aren't reachable
// bucket boundaries here since grades only go down to 1).
export function bandOfAvg(avg: number): 'good' | 'mid' | 'bad' {
  if (avg >= 4.5) return 'good'
  if (avg >= 3.5) return 'mid'
  return 'bad'
}

export function computeMastery(grid: Pick<Grid, 'students'>, buckets: Bucket[], lang: Lang): BucketStats[] {
  return buckets.map((b) => {
    const s = computeStats(grid, b.days)
    let good = 0
    let mid = 0
    let bad = 0
    let ungraded = 0
    for (const p of s.perStudent) {
      if (p.avg === null) {
        ungraded++
        continue
      }
      const band = bandOfAvg(p.avg)
      if (band === 'good') good++
      else if (band === 'mid') mid++
      else bad++
    }
    return { ...b, label: bucketLabel(b, lang), classPct: s.pct, good, mid, bad, ungraded }
  })
}
