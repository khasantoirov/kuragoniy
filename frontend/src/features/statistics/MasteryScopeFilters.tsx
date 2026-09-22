import { useTranslation } from 'react-i18next'

import { BLANK_SCHOOL_KEY, type ClassFilterOption, type SchoolFilterOption } from './masteryTypes'

/** Two plain <select>s (the app's existing idiom — see library/LibraryPage.tsx)
 * rather than a breadcrumb: picking "Barchasi" always means "no filter",
 * and the two stay independent-but-linked — choosing a school resets the
 * class to "Barchasi", choosing a class snaps the school to its own. */
export function MasteryScopeFilters({
  schools,
  classes,
  school,
  classId,
  onChange,
}: {
  schools: SchoolFilterOption[]
  classes: ClassFilterOption[]
  school: string | null
  classId: number | null
  onChange: (next: { school: string | null; classId: number | null }) => void
}) {
  const { t } = useTranslation()
  const visibleClasses = school ? classes.filter((c) => c.school === school) : classes

  if (!schools.length) return null

  return (
    <div className="mstats__filters">
      <label className="mstats__filter">
        <span>{t('Maktab')}</span>
        <select
          className="input"
          value={school ?? ''}
          onChange={(e) => onChange({ school: e.target.value || null, classId: null })}
        >
          <option value="">{t('Barcha maktablar')}</option>
          {schools.map((s) => (
            <option key={s.key} value={s.key}>
              {(s.key === BLANK_SCHOOL_KEY ? t("Maktab ko'rsatilmagan") : s.label) + (s.classes > 1 ? ` (${s.classes})` : '')}
            </option>
          ))}
        </select>
      </label>
      <label className="mstats__filter">
        <span>{t('Sinf')}</span>
        <select
          className="input"
          value={classId ?? ''}
          onChange={(e) => {
            const raw = e.target.value
            if (!raw) {
              onChange({ school, classId: null })
              return
            }
            const id = Number(raw)
            const cls = classes.find((c) => c.id === id)
            onChange({ school: cls?.school ?? school, classId: id })
          }}
        >
          <option value="">{t('Barcha sinflar')}</option>
          {visibleClasses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.teacher ? ` — ${c.teacher}` : ''}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
