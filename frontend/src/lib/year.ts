import { create } from 'zustand'

/** The o'quv yili picked in a year picker (features/schools/YearPicker) —
 * null: the current year. Not remembered between visits: pages always
 * open on the current year. */
export const useYearStore = create<{ yearId: number | null; setYear: (id: number | null) => void }>((set) => ({
  yearId: null,
  setYear: (yearId) => set({ yearId }),
}))

// The lists that show one o'quv yili's classes (backend
// AcademicYear.from_param) — the API client adds ?year= to them.
const SCOPED = [
  /^\/journal\/classes\/$/,
  /^\/journal\/grants\/teachers\/$/,
  /^\/learning\/classes\/$/,
  /^\/schools\/stats\//,
  /^\/schools\/directory\/$/,
]

export function yearParamFor(method: string | undefined, url: string | undefined): number | null {
  const id = useYearStore.getState().yearId
  if (id == null || !url || (method ?? 'get').toLowerCase() !== 'get') return null
  return SCOPED.some((re) => re.test(url)) ? id : null
}
