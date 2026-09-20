import type { Lang } from '@/store/uiStore'

export const weekLabel = (n: number, lang: Lang = 'uz') => {
  if (lang === 'ru') return `${n}-я неделя`
  if (lang === 'en') return `Week ${n}`
  return `${n}-hafta`
}

export const quarterLabel = (n: number | string, lang: Lang = 'uz') => {
  if (lang === 'ru') return `${n} четверть`
  if (lang === 'en') return `Quarter ${n}`
  return `${n}-chorak`
}

export const GRADES = ['1-2', '3-4', '5-6', '7', '8-9'] as const
export type Grade = (typeof GRADES)[number]

const GRADE_LABELS: Record<Grade, Record<Lang, string>> = {
  '1-2': { uz: '1-2-sinf', ru: '1-2 класс', en: 'Grades 1-2' },
  '3-4': { uz: '3-4-sinf', ru: '3-4 класс', en: 'Grades 3-4' },
  '5-6': { uz: '5-6-sinf', ru: '5-6 класс', en: 'Grades 5-6' },
  '7': { uz: '7-sinf', ru: '7 класс', en: 'Grade 7' },
  '8-9': { uz: '8-9-sinf', ru: '8-9 класс', en: 'Grades 8-9' },
}

// Fallback: the DB is the source of truth for a lesson's grade, and a band
// that has been renamed/split (see uiStore v6) must not crash a chart on
// its way out — show the raw code instead.
export const gradeLabel = (grade: Grade, lang: Lang = 'uz') => GRADE_LABELS[grade]?.[lang] ?? String(grade)
