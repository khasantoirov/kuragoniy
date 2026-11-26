export type LibraryKind = 'kitob' | 'qollanma' | 'video' | 'havola'

export interface LibraryItem {
  id: number
  title: string
  url: string
  file: string | null
  file_name: string | null
  file_size: number | null
  cover: string | null
  kind: LibraryKind
  grade: number | null
  /** the fan it belongs to; '' = both (backend common/subjects.py) */
  subject?: '' | 'fizika' | 'steam'
  note: string
  /** the material's language */
  lang?: LibraryLang
  /** Qo'llanmalar markazi: the part a guide or a video belongs in ('' = none) */
  section?: '' | GuideSection
  /** opened, read or downloaded — once per person a day */
  opens?: number
  updated_at: string
}

export type LibraryLang = 'uz' | 'ru' | 'en'
export const LANG_LABELS: Record<LibraryLang, string> = { uz: "O'zbekcha", ru: 'Ruscha', en: 'Inglizcha' }

export type GuideSection = 'platforma' | 'metodika' | 'xavfsizlik'
export const SECTION_LABELS: Record<GuideSection, string> = {
  platforma: 'Platformadan foydalanish',
  metodika: "Metodik qo'llanmalar",
  xavfsizlik: 'Jihozlar xavfsizligi',
}

export const UPLOADABLE_KINDS: LibraryKind[] = ['kitob', 'qollanma']

export const KIND_LABELS: Record<LibraryKind, string> = {
  kitob: 'Kitob',
  qollanma: "Qo'llanma",
  video: 'Video',
  havola: 'Havola',
}

export const KIND_ICONS: Record<LibraryKind, string> = {
  kitob: '📕',
  qollanma: '📗',
  video: '🎬',
  havola: '🔗',
}

export const KINDS: LibraryKind[] = ['kitob', 'qollanma', 'video', 'havola']
