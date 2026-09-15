import { GRADES, type Grade } from '@/features/lessons/labels'
import type { Experiment, ExperimentType } from '@/features/lessons/types'

const EXP_TYPE_OK: ExperimentType[] = ['oddiy', 'wow', 'oyin']

export interface ImportLessonRow {
  title: string
  grade: Grade
  chorak: 1 | 2 | 3 | 4
  hafta: number
  goal: string
  experiments: Omit<Experiment, 'id'>[]
}

function normalizeExp(e: unknown, order: number): Omit<Experiment, 'id'> {
  if (typeof e === 'string') {
    return { order, name: e, type: 'oddiy', desc: '', materials: [], steps: [], minutes: null, safety: '' }
  }
  const x = (e ?? {}) as Record<string, unknown>
  return {
    order,
    name: typeof x.name === 'string' ? x.name : '',
    type: EXP_TYPE_OK.includes(x.type as ExperimentType) ? (x.type as ExperimentType) : 'oddiy',
    desc: typeof x.desc === 'string' ? x.desc : '',
    materials: Array.isArray(x.materials) ? x.materials : [],
    steps: Array.isArray(x.steps) ? x.steps : [],
    minutes: Number.isFinite(Number(x.minutes)) && x.minutes ? Number(x.minutes) : null,
    safety: typeof x.safety === 'string' ? x.safety : '',
    image: typeof x.image === 'string' ? x.image : '',
    video: typeof x.video === 'string' ? x.video : '',
  }
}

/** Mirrors the old js/import.js parse() — same tolerant field coercion,
 * so JSON files exported from the old exportLessons() admin tool still
 * import cleanly. `hafta` defaults to 1 since it's non-nullable on the
 * Lesson model here (Firestore allowed a null week). */
export function parseLessonsImport(text: string): ImportLessonRow[] {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('Fayl JSON emas yoki buzilgan')
  }

  const arr = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { data?: unknown }).data)
      ? (raw as { data: unknown[] }).data
      : null
  if (!arr) throw new Error("Faylda darslar ro'yxati topilmadi")

  return (arr as Record<string, unknown>[])
    .map((l) => ({
      title: String(l.title ?? '').trim(),
      grade: (GRADES.includes(l.grade as Grade) ? (l.grade as Grade) : GRADES[0]),
      chorak: ([1, 2, 3, 4].includes(Number(l.chorak)) ? Number(l.chorak) : 1) as 1 | 2 | 3 | 4,
      hafta: Number(l.hafta) || 1,
      goal: String(l.goal ?? l.maqsad ?? '').trim(),
      experiments: (Array.isArray(l.experiments) ? l.experiments : []).map((e, i) => normalizeExp(e, i)),
    }))
    .filter((l) => l.title)
}

export interface TranslationExpRow {
  id?: number
  name_ru?: string
  name_en?: string
  desc_ru?: string
  desc_en?: string
  safety_ru?: string
  safety_en?: string
  materials_ru?: string[]
  materials_en?: string[]
  steps_ru?: string[]
  steps_en?: string[]
}

export interface TranslationRow {
  id?: number
  grade?: number
  chorak?: number
  hafta?: number | null
  title?: string
  title_ru?: string
  title_en?: string
  goal_ru?: string
  goal_en?: string
  experiments?: TranslationExpRow[]
}

export function parseTranslationsImport(text: string): TranslationRow[] {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('Fayl JSON emas yoki buzilgan')
  }
  if (!Array.isArray(raw)) throw new Error("Fayl to'g'ri formatda emas")
  return raw as TranslationRow[]
}

export const lessonsByGrade = (rows: ImportLessonRow[]) => {
  const byGrade: Record<string, number> = {}
  rows.forEach((l) => {
    byGrade[l.grade] = (byGrade[l.grade] || 0) + 1
  })
  return byGrade
}

export const totalExperiments = (rows: ImportLessonRow[]) => rows.reduce((s, l) => s + l.experiments.length, 0)
