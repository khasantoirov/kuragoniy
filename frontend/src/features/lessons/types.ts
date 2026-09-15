import type { ReactElement } from 'react'

import { IC } from '@/icons'

export type ExperimentType = 'oddiy' | 'wow' | 'oyin'

export const EXP_TYPES: Record<ExperimentType, { label: string; icon: ReactElement }> = {
  oddiy: { label: 'Oddiy', icon: IC.atom },
  wow: { label: 'WOW', icon: IC.star },
  oyin: { label: "O'yin", icon: IC.dice },
}

export interface Experiment {
  id?: number
  order: number
  name: string
  name_ru?: string
  name_en?: string
  type: ExperimentType
  desc: string
  desc_ru?: string
  desc_en?: string
  materials: string[]
  steps: string[]
  minutes: number | null
  safety: string
  safety_ru?: string
  safety_en?: string
  image?: string
  video?: string
}

export type LessonCategory = 'mexanika' | 'termodinamika' | 'elektr' | 'optika' | 'boshqa'

export interface Lesson {
  id: number
  title: string
  title_ru?: string
  title_en?: string
  grade: 7 | 8 | 9
  chorak: 1 | 2 | 3 | 4
  hafta: number
  cat: LessonCategory
  goal: string
  goal_ru?: string
  goal_en?: string
  file_url?: string
  file?: string | null
  file_name?: string | null
  file_size?: number | null
  sim_id?: string
  updated_at: string
  translated_at: string | null
  experiments: Experiment[]
}

export const CATEGORY_LABELS: Record<LessonCategory, string> = {
  mexanika: 'Mexanika',
  termodinamika: 'Termodinamika',
  elektr: 'Elektromagnetizm',
  optika: 'Optika',
  boshqa: 'Boshqa',
}
