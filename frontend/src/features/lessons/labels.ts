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

export const gradeLabel = (n: number, lang: Lang = 'uz') => {
  if (lang === 'ru') return `${n} класс`
  if (lang === 'en') return `Grade ${n}`
  return `${n}-sinf`
}
