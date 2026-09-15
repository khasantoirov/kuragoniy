import type { Lang } from '@/store/uiStore'

export type LessonType = '' | 'nazariy' | 'amaliy' | 'engineering'

export interface TimetableSlot {
  id?: number
  day_index: number
  period_index: number
  time_from: string | null
  time_to: string | null
  maktab: string
  xona: string
  sinf: string
  span: number
  band: boolean
  lesson_type: LessonType
}

export const LESSON_TYPE_LABELS: Record<Exclude<LessonType, ''>, string> = {
  nazariy: 'Nazariy',
  amaliy: 'Amaliy',
  engineering: 'Engineering',
}

export const DAYS = ['Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma']
export const SOATLAR = 8
export const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8]

export const hourLabel = (h: number, lang: Lang = 'uz') => {
  if (lang === 'ru') return `${h}-й урок`
  if (lang === 'en') return `Period ${h}`
  return `${h}-soat`
}
