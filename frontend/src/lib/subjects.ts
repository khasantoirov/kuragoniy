import { useEffect } from 'react'

import { gradeLabel, SUBJECT_GRADES, SUBJECTS, type Grade, type Subject } from '@/features/lessons/labels'
import type { User } from '@/lib/api/types'
import { isOversight, useAuth } from '@/lib/auth/AuthContext'
import { useUIStore } from '@/store/uiStore'

/** The fanlar whose content this person sees — mirrors the backend's
 *  common/subjects.subjects_for: the administration sees both, anyone else
 *  their own, or both while the administration hasn't set one yet. */
export function subjectsFor(user: User | null): Subject[] {
  if (!user || user.is_dev_superuser || isOversight(user)) return [...SUBJECTS]
  const mine = SUBJECTS.filter((s) => user.subjects?.includes(s))
  return mine.length ? mine : [...SUBJECTS]
}

export function useSubjects() {
  const { user } = useAuth()
  const visible = subjectsFor(user)
  const stored = useUIStore((s) => s.subject)
  const setSubject = useUIStore((s) => s.setSubject)
  const current: Subject = visible.includes(stored) ? stored : visible[0]
  const allGrades: Grade[] = visible.flatMap((s) => [...SUBJECT_GRADES[s]])
  return {
    visible,
    current,
    setSubject,
    /** The current fan's grades (the Darslar chips). */
    grades: SUBJECT_GRADES[current],
    /** Every grade this person sees, both fans' when they see both. */
    allGrades,
    /** Sees more than one fan — pickers then name the fan beside a grade. */
    mixed: visible.length > 1,
  }
}

/** A grade picker's options: the grades of the fan window this tab is in
 *  (Fizika and STEAM are separate windows — components/FanWindow.tsx). */
export function useGradeOptions() {
  const { grades } = useSubjects()
  const lang = useUIStore((s) => s.lang)
  return {
    grades: [...grades],
    label: (g: Grade) => gradeLabel(g, lang),
  }
}

/** Keeps the stored fan and grade inside what this person sees (a teacher
 *  pointed to physics must not land on a STEAM grade). Mounted in AppShell. */
export function useSubjectGuard() {
  const { current } = useSubjects()
  const subject = useUIStore((s) => s.subject)
  const grade = useUIStore((s) => s.grade)
  const setSubject = useUIStore((s) => s.setSubject)
  useEffect(() => {
    if (subject !== current || !SUBJECT_GRADES[current].includes(grade)) setSubject(current)
  }, [current, subject, grade, setSubject])
}
