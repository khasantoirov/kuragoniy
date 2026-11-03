import type { User } from '@/lib/api/types'
import { isAdmin, useAuth } from '@/lib/auth/AuthContext'
import { useViewAs, type ViewedPupil } from '@/lib/viewAs'

/** The pupil being looked through, for an administrator — null otherwise. */
export function useViewedPupil(): ViewedPupil | null {
  const { user } = useAuth()
  const pupil = useViewAs((s) => s.pupil)
  return pupil && isAdmin(user) ? pupil : null
}

/** Who the student portal is about: the signed-in pupil — or, in the
 * view, the pupil being looked through. */
export function usePortalUser(): User | null {
  const { user } = useAuth()
  const pupil = useViewedPupil()
  if (!pupil || !user) return user
  return { ...user, id: pupil.id, name: pupil.name, username: pupil.username, photo: null, student: pupil.student } as User
}
