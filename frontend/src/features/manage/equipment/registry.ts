/* Jihozlar jadvali — one calculation shared by the page and the Excel
   export.

   Money: an equipment is bought once. Its cost — price × the most pieces
   any experiment needs — is counted on the row where it is first used
   (7-sinf → 9-sinf, week by week); later rows point back to that row
   instead of counting it again. */

export type Kind = 'birlamchi' | 'ikkilamchi' | 'uchlamchi'

export const KINDS: { id: Kind; label: string }[] = [
  { id: 'birlamchi', label: 'Birlamchi' },
  { id: 'ikkilamchi', label: 'Ikkilamchi' },
  { id: 'uchlamchi', label: 'Uchlamchi' },
]

export const GRADES = [7, 8, 9] as const

export interface RegItem { id: number; name: string; quantity: number; key: string }
export interface RegExperiment { id: number; name: string; desc: string; items: RegItem[] }
export interface RegLesson { id: number; grade: number; chorak: number; hafta: number; title: string; experiments: RegExperiment[] }
export interface CatalogEntry {
  id: number
  key: string
  name: string
  kind: Kind
  build_materials: string
  price: number | null
  image: string | null
}
export interface Registry { lessons: RegLesson[]; catalog: Record<string, CatalogEntry> }

export interface Use { lesson: RegLesson; experiment: RegExperiment; item: RegItem }

export interface Analysis {
  /** Every use of an equipment key, in order. */
  uses: Map<string, Use[]>
  /** The most pieces any one experiment needs. */
  maxQty: Map<string, number>
}

export function analyse(reg: Registry): Analysis {
  const uses = new Map<string, Use[]>()
  const maxQty = new Map<string, number>()
  for (const lesson of reg.lessons) {
    for (const experiment of lesson.experiments) {
      for (const item of experiment.items) {
        if (!item.key) continue
        const list = uses.get(item.key)
        if (list) list.push({ lesson, experiment, item })
        else uses.set(item.key, [{ lesson, experiment, item }])
        maxQty.set(item.key, Math.max(maxQty.get(item.key) ?? 0, item.quantity))
      }
    }
  }
  return { uses, maxQty }
}

export const kindOf = (reg: Registry, key: string): Kind => reg.catalog[key]?.kind ?? 'birlamchi'
export const priceOf = (reg: Registry, key: string): number | null => reg.catalog[key]?.price ?? null

export function firstUse(an: Analysis, key: string): Use | undefined {
  return an.uses.get(key)?.[0]
}

export const isFirstUse = (an: Analysis, item: RegItem) => firstUse(an, item.key)?.item.id === item.id

/** What this row adds to the budget (0 unless it's the equipment's first use). */
export function rowCost(reg: Registry, an: Analysis, item: RegItem): number {
  if (!isFirstUse(an, item)) return 0
  return (priceOf(reg, item.key) ?? 0) * (an.maxQty.get(item.key) ?? item.quantity)
}

/** Other topics (lessons) that use the same equipment — "Yana qaysi mavzuga ishlatiladi?". */
export function otherTopics(an: Analysis, item: RegItem, lesson: RegLesson): RegLesson[] {
  const seen = new Set<number>([lesson.id])
  const out: RegLesson[] = []
  for (const u of an.uses.get(item.key) ?? []) {
    if (seen.has(u.lesson.id)) continue
    seen.add(u.lesson.id)
    out.push(u.lesson)
  }
  return out
}

export const topicLabel = (l: RegLesson) => `${l.grade}-sinf, ${l.hafta}-hafta: ${l.title}`

export function lessonCost(reg: Registry, an: Analysis, lesson: RegLesson): number {
  let sum = 0
  for (const e of lesson.experiments) for (const i of e.items) sum += rowCost(reg, an, i)
  return sum
}

export interface GradeSummary {
  grade: number
  topics: number
  experiments: number
  total: number
  byKind: Record<Kind, number>
  unpriced: number
}

export function gradeSummary(reg: Registry, an: Analysis, grade: number): GradeSummary {
  const lessons = reg.lessons.filter((l) => l.grade === grade)
  const byKind: Record<Kind, number> = { birlamchi: 0, ikkilamchi: 0, uchlamchi: 0 }
  let total = 0
  let unpriced = 0
  let experiments = 0
  for (const l of lessons) {
    experiments += l.experiments.length
    for (const e of l.experiments) {
      for (const i of e.items) {
        if (!isFirstUse(an, i)) continue
        const c = rowCost(reg, an, i)
        total += c
        byKind[kindOf(reg, i.key)] += c
        if (priceOf(reg, i.key) === null) unpriced++
      }
    }
  }
  return { grade, topics: lessons.length, experiments, total, byKind, unpriced }
}

export const fmtSum = (n: number) => (n ? `${n.toLocaleString('ru-RU').replace(/ /g, ' ')} so'm` : '—')
