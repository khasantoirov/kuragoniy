/** Marks are given by colour, the digit kept beside it:
 * 5 a'lo (green), 4 yaxshi (yellow), 3 qoniqarli (red), 2 qoniqarsiz
 * (purple), 1 and 0 yomon (black). Colours live in CSS as .gchip--N. */
export const GRADES: { v: number; label: string }[] = [
  { v: 5, label: "A'lo" },
  { v: 4, label: 'Yaxshi' },
  { v: 3, label: 'Qoniqarli' },
  { v: 2, label: 'Qoniqarsiz' },
  { v: 1, label: 'Yomon' },
  { v: 0, label: 'Yomon' },
]

export const gradeLabel = (v: number | null | undefined) => GRADES.find((g) => g.v === v)?.label ?? ''

/** What the day page offers for attendance. "Kelmadi" is an unexcused
 * absence; "Kirmadi" — at school, but skipped this lesson. Older records
 * may still hold 's' (sababli), shown as "Kelmadi". */
export const DAY_ATT: { k: '' | 'n' | 'k' | 'x'; label: string }[] = [
  { k: '', label: 'Keldi' },
  { k: 'n', label: 'Kelmadi' },
  { k: 'k', label: 'Kech' },
  { k: 'x', label: 'Kirmadi' },
]

const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr']
const WEEKDAYS = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba']

/** "2026-10-19" → { day: "19-oktabr", weekday: "Dushanba" } (local date). */
export function dayTitle(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return { day: `${d}-${MONTHS[m - 1]}`, weekday: WEEKDAYS[date.getDay()] }
}
