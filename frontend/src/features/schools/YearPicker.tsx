import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { useYearStore } from '@/lib/year'

import { useYears } from './api'

/** "2026-2027 o'quv yili ▾" — which year's classes, pupils and figures the
 * page shows (the current one unless picked). Hidden while there is only
 * one year. */
export function YearPicker() {
  const { t } = useTranslation()
  const { data: years } = useYears()
  const { yearId, setYear } = useYearStore()
  const queryClient = useQueryClient()
  if (!years || years.length < 2) return null
  const current = years.find((y) => y.is_current)
  const value = yearId ?? current?.id ?? ''

  const pick = (id: number) => {
    setYear(id === current?.id ? null : id)
    for (const key of ['journal', 'schools', 'learning']) queryClient.invalidateQueries({ queryKey: [key] })
  }

  return (
    <select className={`input input--sm yearpick ${yearId != null ? 'is-other' : ''}`} value={value}
      aria-label={t("O'quv yili")} title={t("O'quv yili")} onChange={(e) => pick(Number(e.target.value))}>
      {years.map((y) => (
        <option key={y.id} value={y.id}>{y.name} {t("o'quv yili")}{y.is_current ? ` · ${t('joriy')}` : ''}</option>
      ))}
    </select>
  )
}
