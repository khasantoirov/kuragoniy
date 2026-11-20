import type { Lang } from '@/store/uiStore'

/** Darsning tartib raqami. `hafta` maydoni bir sinf bandi bo'ylab
 *  uzluksiz sanaladi (lessons/views.py'dagi _renumber_grade), ya'ni raqam
 *  "nechanchi dars" ma'nosini beradi — ekranda hafta emas, dars deb
 *  ko'rsatiladi. */
export const lessonLabel = (n: number, lang: Lang = 'uz') => {
  if (lang === 'ru') return `Урок ${n}`
  if (lang === 'en') return `Lesson ${n}`
  return `${n}-dars`
}

/** Amaliy fizika's lessons go by week ("10-hafta"), as on amaliyfizika.uz. */
export const weekLabel = (n: number, lang: Lang = 'uz') => {
  if (lang === 'ru') return `${n}-я неделя`
  if (lang === 'en') return `Week ${n}`
  return `${n}-hafta`
}

/** A lesson's number as its fan shows it: "10-hafta" (fizika), "3-dars" (STEAM). */
export const numberLabel = (n: number, grade: string, lang: Lang = 'uz') =>
  subjectOfGrade(grade) === 'fizika' ? weekLabel(n, lang) : lessonLabel(n, lang)

/** "1–9-dars" — the lessons a chorak holds (numbered through the band);
 *  "1–9-hafta" in the Fizika window. */
export const weeksLabel = (from: number, to: number, lang: Lang = 'uz', weeks = false) => {
  if (weeks) {
    if (from === to) return weekLabel(from, lang)
    if (lang === 'ru') return `${from}–${to} недели`
    if (lang === 'en') return `Weeks ${from}–${to}`
    return `${from}–${to}-hafta`
  }
  if (from === to) return lessonLabel(from, lang)
  if (lang === 'ru') return `Уроки ${from}–${to}`
  if (lang === 'en') return `Lessons ${from}–${to}`
  return `${from}–${to}-dars`
}

export const quarterLabel = (n: number | string, lang: Lang = 'uz') => {
  if (lang === 'ru') return `${n} четверть`
  if (lang === 'en') return `Quarter ${n}`
  return `${n}-chorak`
}

/* Fanlar (backend common/subjects.py). A lesson's subject is told by its
   grade code, unique across subjects: STEAM's grade groups '1-2'…'8-9',
   physics' single grades 'F7' 'F8' 'F9'. */
export const SUBJECTS = ['fizika', 'steam'] as const
export type Subject = (typeof SUBJECTS)[number]

export const STEAM_GRADES = ['1-2', '3-4', '5-6', '7', '8-9'] as const
export const FIZIKA_GRADES = ['F7', 'F8', 'F9'] as const
export type Grade = (typeof STEAM_GRADES)[number] | (typeof FIZIKA_GRADES)[number]

export const SUBJECT_GRADES: Record<Subject, readonly Grade[]> = { steam: STEAM_GRADES, fizika: FIZIKA_GRADES }
/** Every grade code, both fans', in display order. */
export const ALL_GRADES: readonly Grade[] = [...STEAM_GRADES, ...FIZIKA_GRADES]
/** STEAM's grades — what the places that only ever dealt with STEAM
 *  content (Do'kon, the lessons import's default) still use. */
export const GRADES = STEAM_GRADES

export const subjectOfGrade = (grade: string): Subject => ((FIZIKA_GRADES as readonly string[]).includes(grade) ? 'fizika' : 'steam')

const SUBJECT_LABELS: Record<Subject, Record<Lang, string>> = {
  fizika: { uz: 'Amaliy fizika', ru: 'Прикладная физика', en: 'Applied physics' },
  steam: { uz: 'STEAM / Robototexnika', ru: 'STEAM / Робототехника', en: 'STEAM / Robotics' },
}
export const subjectLabel = (s: Subject, lang: Lang = 'uz') => SUBJECT_LABELS[s]?.[lang] ?? s
/** Short form for chips and narrow places. */
export const subjectShort = (s: Subject, lang: Lang = 'uz') =>
  s === 'fizika' ? (lang === 'ru' ? 'Физика' : lang === 'en' ? 'Physics' : 'Fizika') : 'STEAM'

const GRADE_LABELS: Record<Grade, Record<Lang, string>> = {
  '1-2': { uz: '1-2-sinf', ru: '1-2 класс', en: 'Grades 1-2' },
  '3-4': { uz: '3-4-sinf', ru: '3-4 класс', en: 'Grades 3-4' },
  '5-6': { uz: '5-6-sinf', ru: '5-6 класс', en: 'Grades 5-6' },
  '7': { uz: '7-sinf', ru: '7 класс', en: 'Grade 7' },
  '8-9': { uz: '8-9-sinf', ru: '8-9 класс', en: 'Grades 8-9' },
  F7: { uz: '7-sinf', ru: '7 класс', en: 'Grade 7' },
  F8: { uz: '8-sinf', ru: '8 класс', en: 'Grade 8' },
  F9: { uz: '9-sinf', ru: '9 класс', en: 'Grade 9' },
}

// Fallback: the DB is the source of truth for a lesson's grade, and a band
// that has been renamed/split (see uiStore v6) must not crash a chart on
// its way out — show the raw code instead.
export const gradeLabel = (grade: Grade, lang: Lang = 'uz') => GRADE_LABELS[grade]?.[lang] ?? String(grade)

/** "7-sinf · Fizika" — for a list that mixes both subjects' grades. */
export const gradeLabelFull = (grade: Grade, lang: Lang = 'uz') =>
  `${gradeLabel(grade, lang)} · ${subjectShort(subjectOfGrade(grade), lang)}`
