import { useMutation, useQueryClient } from '@tanstack/react-query'

import type { Lesson } from '@/features/lessons/types'
import { api } from '@/lib/api/client'
import type { Paginated } from '@/lib/api/types'

import type { ImportLessonRow, TranslationRow } from './importLessons'

/** Deletes existing lessons in the given grades (replace mode), then
 * creates every row from the parsed file — mirrors js/import.js's
 * runImport(), just against the Django API instead of Firestore. */
export async function runLessonsImport(
  rows: ImportLessonRow[],
  mode: 'add' | 'replace',
  grades: number[],
  onProgress?: (msg: string) => void,
) {
  if (mode === 'replace') {
    onProgress?.("Eskilari o'chirilmoqda…")
    for (const grade of grades) {
      const existing = (await api.get<Paginated<Lesson>>('/lessons/', { params: { grade } })).data.results
      for (const lesson of existing) {
        await api.delete(`/lessons/${lesson.id}/`)
      }
    }
  }

  let n = 0
  for (const row of rows) {
    await api.post('/lessons/', row)
    n++
    if (n % 5 === 0) onProgress?.(`Yozilmoqda… ${n}/${rows.length}`)
  }
  return n
}

export function useImportTranslations() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (rows: TranslationRow[]) =>
      (await api.post<{ ok: number; skipped: number }>('/lessons/import_translations/', rows)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lessons'] }),
  })
}
