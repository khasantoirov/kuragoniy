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
