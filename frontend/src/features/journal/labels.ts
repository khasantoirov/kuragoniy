import type { Lang } from '@/store/uiStore'

export const quarterLabel = (n: number, lang: Lang = 'uz') => {
  if (lang === 'ru') return `${n} четверть`
  if (lang === 'en') return `Quarter ${n}`
  return `${n}-chorak`
}
