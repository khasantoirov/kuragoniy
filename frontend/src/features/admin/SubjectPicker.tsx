import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { SUBJECTS, subjectLabel, subjectShort, type Subject } from '@/features/lessons/labels'
import { errText } from '@/features/portal/ui'
import { IC } from '@/icons'
import { api } from '@/lib/api/client'
import type { User } from '@/lib/api/types'
import { useUIStore } from '@/store/uiStore'

/* Fan biriktirish (backend common/subjects.py): the administration points a
   teacher to Amaliy fizika and/or STEAM / Robototexnika. Their lessons,
   library and courses then follow it; with none ticked they see both. */

/** Only teachers are pointed to a fan — the administration sees everything. */
export const takesSubject = (u: User) => u.role === 'teacher' && !u.is_dev_superuser

/** Toggle chips, one per fan. */
export function SubjectChips({ value, onChange, disabled }: {
  value: Subject[]
  onChange: (next: Subject[]) => void
  disabled?: boolean
}) {
  const lang = useUIStore((s) => s.lang)
  const toggle = (s: Subject) =>
    onChange(SUBJECTS.filter((x) => (x === s ? !value.includes(x) : value.includes(x))))
  return (
    <div className="fanchips" role="group">
      {SUBJECTS.map((s) => {
        const on = value.includes(s)
        return (
          <button key={s} type="button" className={`fanchip fanchip--${s} ${on ? 'is-on' : ''}`} aria-pressed={on}
            disabled={disabled} onClick={() => toggle(s)}>
            {on ? IC.check2 : null} {subjectLabel(s, lang)}
          </button>
        )
      })}
    </div>
  )
}

/** "Fizika · STEAM", or a quiet "biriktirilmagan". */
export function SubjectBadges({ user }: { user: User }) {
  const { t } = useTranslation()
  const lang = useUIStore((s) => s.lang)
  const mine = SUBJECTS.filter((s) => user.subjects?.includes(s))
  if (!mine.length) return <span className="fanbadge fanbadge--none">{t('Fan biriktirilmagan')}</span>
  return (
    <>
      {mine.map((s) => <span key={s} className={`fanbadge fanbadge--${s}`}>{subjectShort(s, lang)}</span>)}
    </>
  )
}

export function SubjectsModal({ user, onClose }: { user: User; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const qc = useQueryClient()
  const [value, setValue] = useState<Subject[]>(SUBJECTS.filter((s) => user.subjects?.includes(s)))
  const save = useMutation({
    mutationFn: async () => (await api.post<User>(`/accounts/users/${user.id}/set-subjects/`, { subjects: value })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] })
      toast(t('Saqlandi'))
      onClose()
    },
    onError: (err) => toast(t(errText(err)), 'error'),
  })
  return (
    <Modal
      narrow
      title={`${t('Fan biriktirish')} — ${user.name || user.username || ''}`}
      onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>{t('Bekor qilish')}</button>
        <button className="btn btn--primary" disabled={save.isPending} onClick={() => save.mutate()}>{t('Saqlash')}</button>
      </>}
    >
      <SubjectChips value={value} onChange={setValue} />
      <p className="prose prose--note">
        {t("Darslar, kutubxona va kurslar shu fan bo'yicha ko'rinadi. Hech biri belgilanmasa, ikkala fan ham ko'rinadi.")}
      </p>
    </Modal>
  )
}
