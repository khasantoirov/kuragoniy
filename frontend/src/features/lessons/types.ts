import type { ReactElement } from 'react'

import { IC } from '@/icons'

import type { Grade } from './labels'

/** Amaliy fizika's experiment kinds (amaliyfizika.uz); STEAM's practical
 *  tasks keep the default and don't show it. */
export type ExperimentType = 'oddiy' | 'wow' | 'oyin'

export const EXP_TYPES: Record<ExperimentType, { label: string; icon: ReactElement }> = {
  oddiy: { label: 'Oddiy', icon: IC.atom },
  wow: { label: 'WOW', icon: IC.star },
  oyin: { label: "O'yin", icon: IC.dice },
}

/** Amaliy fizika's bo'limlar; '' for STEAM lessons. */
export type LessonCategory = 'mexanika' | 'termodinamika' | 'elektr' | 'optika' | 'boshqa'

export const CATEGORY_LABELS: Record<LessonCategory, string> = {
  mexanika: 'Mexanika',
  termodinamika: 'Termodinamika',
  elektr: 'Elektromagnetizm',
  optika: 'Optika',
  boshqa: 'Boshqa',
}

export interface EquipmentItem {
  id?: number
  order: number
  name: string
  name_ru?: string
  name_en?: string
  quantity: number
  image?: string | null
  image_name?: string | null
  image_size?: number | null
}

export interface Experiment {
  id?: number
  order: number
  name: string
  name_ru?: string
  name_en?: string
  type?: ExperimentType
  desc: string
  desc_ru?: string
  desc_en?: string
  equipment_items: EquipmentItem[]
  steps: string[]
  concepts: string[]
  minutes: number | null
  safety: string
  safety_ru?: string
  safety_en?: string
  image?: string
  video?: string
}

export interface Lesson {
  id: number
  title: string
  title_ru?: string
  title_en?: string
  grade: Grade
  chorak: 1 | 2 | 3 | 4
  hafta: number
  cat?: LessonCategory | ''
  sim_id?: string
  goal: string
  goal_ru?: string
  goal_en?: string
  file_url?: string
  file?: string | null
  file_name?: string | null
  file_size?: number | null
  updated_at: string
  translated_at: string | null
  experiments: Experiment[]
}
