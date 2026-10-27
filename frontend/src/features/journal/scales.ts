/* Grading scales — the frontend half of backend/journal/scales.py.
   A class is graded 0-5, 0-10 or 0-100 (whatever its school uses); every
   mark falls into a colour band, its *level* on a common 0-5 footing:
   5 a'lo (green), 4 yaxshi (lemon), 3 qoniqarli (carrot orange),
   2 qoniqarsiz (red), 1/0 yomon (dark red). Colours live in CSS as
   .gchip--<level>; the same bands colour every score on the platform —
   percents by the 100-point column (pctLevel), averages by the mark they
   round to (avgLevel). */

export type Scale = 5 | 10 | 100

export const SCALES: { v: Scale; label: string; range: string }[] = [
  { v: 5, label: '5 ballik', range: '0–5' },
  { v: 10, label: '10 ballik', range: '0–10' },
  { v: 100, label: '100 ballik', range: '0–100' },
]

export const asScale = (n: unknown): Scale => (n === 10 || n === 100 ? n : 5)

const BAND_MIN: Record<Scale, Record<2 | 3 | 4 | 5, number>> = {
  5: { 5: 5, 4: 4, 3: 3, 2: 2 },
  10: { 5: 9, 4: 7, 3: 5, 2: 3 },
  100: { 5: 86, 4: 70, 3: 56, 2: 31 },
}

export const LEVELS: { l: 5 | 4 | 3 | 2 | 1; label: string; color: string }[] = [
  { l: 5, label: "A'lo", color: 'Yashil' },
  { l: 4, label: 'Yaxshi', color: 'Limon sariq' },
  { l: 3, label: 'Qoniqarli', color: "Zarg'aldoq" },
  { l: 2, label: 'Qoniqarsiz', color: 'Qizil' },
  { l: 1, label: 'Yomon', color: "To'q qizil" },
]

export function levelOf(mark: number, scale: Scale): number {
  for (const l of [5, 4, 3, 2] as const) if (mark >= BAND_MIN[scale][l]) return l
  if (scale === 5) return mark
  return mark === 0 ? 0 : 1
}

export const levelLabel = (l: number) => LEVELS.find((x) => x.l === Math.max(1, l))?.label ?? ''
export const markLabel = (mark: number, scale: Scale) => levelLabel(levelOf(mark, scale))

/** A percent — test score, O'zlashtirish — as its band on the 100-point column. */
export const pctLevel = (p: number) => levelOf(Math.max(0, Math.min(100, Math.round(p))), 100)

/** An average as the band of the mark it rounds to (4.5 → «5», 4.4 → «4»). */
export const avgLevel = (avg: number, scale: Scale) => levelOf(Math.max(0, Math.min(scale, Math.round(avg))), scale)

/** The marks of a level as text, e.g. "86–100"; yomon includes 0 ("0–30"). */
export function bandText(l: number, scale: Scale): string {
  const mins = BAND_MIN[scale]
  const lo = l === 1 ? 0 : mins[l as 2 | 3 | 4 | 5]
  const hi = l === 5 ? scale : l === 1 ? mins[2] - 1 : mins[(l + 1) as 3 | 4 | 5] - 1
  return lo === hi ? String(lo) : `${lo}–${hi}`
}

/** Every mark of a small scale, highest first (the 0-5 and 0-10 pickers). */
export const marksOf = (scale: Scale) => Array.from({ length: scale + 1 }, (_, i) => scale - i)

/** An average on the class's own scale. */
export const fmtAvg = (avg: number, scale: Scale) => avg.toFixed(scale === 5 ? 2 : 1)
