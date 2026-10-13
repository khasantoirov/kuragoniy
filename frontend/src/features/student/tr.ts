import type { Lang } from '@/store/uiStore'

/** Lesson titles carry bot-translated _ru/_en copies — fall back to Uzbek. */
export function trTitle(l: { title: string; title_ru?: string; title_en?: string }, lang: Lang): string {
  if (lang === 'ru' && l.title_ru) return l.title_ru
  if (lang === 'en' && l.title_en) return l.title_en
  return l.title
}
