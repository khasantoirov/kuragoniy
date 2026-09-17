import { useMutation, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api/client'

import type { ImportLessonRow, TranslationRow } from './importLessons'

export interface BulkImportSkip {
  row: number
  title?: string
  reason: string
  grade?: string
  chorak?: number
  hafta?: number
}

export interface BulkImportError {
  row: number
  title?: string
  errors: unknown
}

export interface BulkImportResult {
  created: number
  deleted: number
  grades_replaced: string[]
  skipped: BulkImportSkip[]
  errors: BulkImportError[]
}

/** One request — the server deletes (replace mode) and creates every row
 * itself, instead of the old client-side loop of N sequential
 * GET/DELETE/POST calls (which had a pagination bug on >50-lesson grades
 * and no per-row error isolation). See LessonViewSet.bulk_import. */
export async function runLessonsImport(rows: ImportLessonRow[], mode: 'add' | 'replace') {
  return (await api.post<BulkImportResult>('/lessons/bulk_import/', { mode, rows })).data
}

export function useImportTranslations() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (rows: TranslationRow[]) =>
      (await api.post<{ ok: number; skipped: number }>('/lessons/import_translations/', rows)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lessons'] }),
  })
}
