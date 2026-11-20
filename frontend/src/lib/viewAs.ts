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

/** Dasturchi → Rol (components/RoleSwitch.tsx, backend common/viewas.py):
 * the developer looks through another account — their own as Admin or
 * Boshliq (key 'role:admin'), or a chosen person (key = their id). Every
 * request then carries X-View-As-User and the server answers as that
 * account, read-only. This tab only, like the pupil view. */
export interface ViewedUser {
  key: string
  label: string
}

export const useViewAsUser = create<{ view: ViewedUser | null; set: (v: ViewedUser) => void; clear: () => void }>()(
  persist(
    (set) => ({ view: null, set: (view) => set({ view }), clear: () => set({ view: null }) }),
    { name: 'ke-view-as-user', storage: createJSONStorage(() => sessionStorage) },
  ),
)

/** run as the developer even while viewing (backend viewas.EXEMPT_PREFIXES) */
const VIEW_EXEMPT = ['/auth/', '/accounts/view-as/', '/accounts/me/heartbeat/']

/** The X-View-As-User header for a request, while the developer views as someone. */
export function viewAsUserHeaderFor(url: string | undefined): string | null {
  const view = useViewAsUser.getState().view
  if (!view || !url || VIEW_EXEMPT.some((p) => url.startsWith(p))) return null
  return view.key
}

/** The X-View-As-Student header for a request, while looking through a pupil. */
export function viewAsHeaderFor(url: string | undefined): string | null {
  const pupil = useViewAs.getState().pupil
  return pupil && url?.startsWith('/student/') ? pupil.id : null
}
