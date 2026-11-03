import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

import type { StudentInfo } from '@/lib/api/types'

/** Ko'rish rejimi → O'quvchi: the pupil an administrator is looking through
 * (backend common/permissions.py view_as_pupil — reads only). Kept for this
 * tab only, so a reload stays in the view and a new tab doesn't. No
 * auth import here: the API client reads it (features/student/portalUser.ts
 * has the hooks). */
export interface ViewedPupil {
  id: string
  name: string
  username: string
  student: StudentInfo
}

export const useViewAs = create<{ pupil: ViewedPupil | null; start: (p: ViewedPupil) => void; stop: () => void }>()(
  persist(
    (set) => ({ pupil: null, start: (pupil) => set({ pupil }), stop: () => set({ pupil: null }) }),
    { name: 'af-view-as', storage: createJSONStorage(() => sessionStorage) },
  ),
)

/** The X-View-As-Student header for a request, while looking through a pupil. */
export function viewAsHeaderFor(url: string | undefined): string | null {
  const pupil = useViewAs.getState().pupil
  return pupil && url?.startsWith('/student/') ? pupil.id : null
}
