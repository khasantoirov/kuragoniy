import { useTranslation } from 'react-i18next'

import { subjectLabel } from '@/features/lessons/labels'
import { useSubjects } from '@/lib/subjects'
import { useUIStore } from '@/store/uiStore'

/** Fan tanlagichi — only for someone who sees both fanlar (the
 *  administration, or a teacher not pointed to one yet). Shares the fan
 *  picked on Darslar (uiStore.subject). */
export function SubjectSwitch({ className = '' }: { className?: string }) {
  const { t } = useTranslation()
  const lang = useUIStore((s) => s.lang)
  const { visible, current, setSubject, mixed } = useSubjects()
  if (!mixed) return null
  return (
    <div className={`seg ${className}`} role="group" aria-label={t('Fan')}>
      {visible.map((s) => (
        <button key={s} type="button" className={`seg__b ${s === current ? 'is-on' : ''}`} aria-pressed={s === current}
          onClick={() => setSubject(s)}>
          {subjectLabel(s, lang)}
        </button>
      ))}
    </div>
  )
}
