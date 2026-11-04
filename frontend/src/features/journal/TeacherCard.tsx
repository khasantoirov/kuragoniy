import { useTranslation } from 'react-i18next'

import { Avatar } from '@/components/Avatar'

import type { GrantTeacher } from './types'

/** O'qituvchilar jurnali: one teacher — photo, "Ism Familiya", and per
 *  school its classes and pupils, grade by grade. The whole card opens
 *  the teacher's journal. */
export function TeacherCard({ person, onOpen }: { person: GrantTeacher; onOpen: () => void }) {
  const { t } = useTranslation()
  const classes = person.schools.reduce((n, s) => n + s.classes, 0)
  const pupils = person.schools.reduce((n, s) => n + s.students, 0)
  const summary = [
    person.schools.length > 1 ? `${person.schools.length} ${t('ta maktab')}` : null,
    `${classes} ${t('ta sinf')}`,
    `${pupils} ${t("ta o'quvchi")}`,
  ].filter(Boolean).join(' · ')

  return (
    <button type="button" className="tcard" onClick={onOpen}>
      <span className="tcard__head">
        <Avatar name={person.name} photo={person.photo} className="tcard__av" />
        <span className="tcard__id">
          <b className="tcard__nm">{person.name}</b>
          <small>{summary}</small>
        </span>
        <span className="tcard__go" aria-hidden="true">›</span>
      </span>
      {person.schools.map((s) => (
        <span key={s.name} className="tcard__sch">
          <span className="tcard__srow">
            <b>{s.name || t("Maktab ko'rsatilmagan")}</b>
            <small>{s.classes} {t('ta sinf')} · {s.students} {t("ta o'quvchi")}</small>
          </span>
          <span className="tcard__grades">
            {s.grades.map((g) => (
              <span key={g.grade ?? 'x'} className="tcard__g">
                <b>{g.grade != null ? `${g.grade}-${t('sinf')}` : t('Boshqa')}</b>
                <span>{g.classes} {t('ta sinf')}</span>
                <span>{g.students} {t("o'quvchi")}</span>
              </span>
            ))}
          </span>
        </span>
      ))}
    </button>
  )
}
