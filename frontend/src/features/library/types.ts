export type LibraryKind = 'kitob' | 'qollanma' | 'video' | 'havola'

export interface LibraryItem {
  id: number
  title: string
  url: string
  file: string | null
  file_name: string | null
  file_size: number | null
  kind: LibraryKind
  grade: number | null
  note: string
  updated_at: string
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
