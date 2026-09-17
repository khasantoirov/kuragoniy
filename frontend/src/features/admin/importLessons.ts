import { GRADES, type Grade } from '@/features/lessons/labels'
import type { Experiment } from '@/features/lessons/types'

export interface ImportLessonRow {
  title: string
  grade: Grade
  chorak: 1 | 2 | 3 | 4
  hafta: number
  goal: string
  file_url: string
  experiments: Omit<Experiment, 'id'>[]
}

export interface ImportWarning {
  index: number
  title: string
  reasons: ('no_title' | 'grade_defaulted' | 'chorak_defaulted' | 'hafta_defaulted')[]
}

export interface ParseLessonsResult {
  rows: ImportLessonRow[]
  warnings: ImportWarning[]
}

function normalizeExp(e: unknown, order: number): Omit<Experiment, 'id'> {
  if (typeof e === 'string') {
    return { order, name: e, desc: '', materials: [], steps: [], concepts: [], minutes: null, safety: '' }
  }
  const x = (e ?? {}) as Record<string, unknown>
  return {
    order,
    name: typeof x.name === 'string' ? x.name : '',
    desc: typeof x.desc === 'string' ? x.desc : '',
    materials: Array.isArray(x.materials) ? x.materials : [],
    steps: Array.isArray(x.steps) ? x.steps : [],
    concepts: Array.isArray(x.concepts) ? x.concepts : [],
    minutes: Number.isFinite(Number(x.minutes)) && x.minutes ? Number(x.minutes) : null,
    safety: typeof x.safety === 'string' ? x.safety : '',
    image: typeof x.image === 'string' ? x.image : '',
    video: typeof x.video === 'string' ? x.video : '',
  }
}

/** Mirrors the old js/import.js parse() — same tolerant field coercion,
 * so JSON files exported from the old exportLessons() admin tool still
 * import cleanly. `hafta` defaults to 1 since it's non-nullable on the
 * Lesson model here (Firestore allowed a null week).
 *
 * The same defaulting as before happens silently for grade/chorak/hafta,
 * and a missing title still drops the row — but now every defaulted or
 * dropped row is also reported in `warnings` so the admin can see it in
 * the preview instead of it just vanishing. */
export function parseLessonsImport(text: string): ParseLessonsResult {
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

  const rows: ImportLessonRow[] = []
  const warnings: ImportWarning[] = []

  ;(arr as Record<string, unknown>[]).forEach((l, index) => {
    const title = String(l.title ?? '').trim()
    if (!title) {
      warnings.push({ index, title: '(nomsiz)', reasons: ['no_title'] })
      return
    }

    const reasons: ImportWarning['reasons'] = []
    if (!GRADES.includes(l.grade as Grade)) reasons.push('grade_defaulted')
    if (![1, 2, 3, 4].includes(Number(l.chorak))) reasons.push('chorak_defaulted')
    if (!Number(l.hafta)) reasons.push('hafta_defaulted')
    if (reasons.length) warnings.push({ index, title, reasons })

    rows.push({
      title,
      grade: GRADES.includes(l.grade as Grade) ? (l.grade as Grade) : GRADES[0],
      chorak: ([1, 2, 3, 4].includes(Number(l.chorak)) ? Number(l.chorak) : 1) as 1 | 2 | 3 | 4,
      hafta: Number(l.hafta) || 1,
      goal: String(l.goal ?? l.maqsad ?? '').trim(),
      file_url: typeof l.file_url === 'string' ? l.file_url.trim() : '',
      experiments: (Array.isArray(l.experiments) ? l.experiments : []).map((e, i) => normalizeExp(e, i)),
    })
  })

  return { rows, warnings }
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
  concepts_ru?: string[]
  concepts_en?: string[]
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
