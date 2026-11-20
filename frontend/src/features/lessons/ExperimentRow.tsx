import { useTranslation } from 'react-i18next'

import { EXP_TYPES, type Experiment } from './types'

/** `typed`: Amaliy fizika — the Oddiy / WOW / O'yin badge in front. */
export function ExperimentRow({ exp, typed = false }: { exp: Experiment; typed?: boolean }) {
  const { t } = useTranslation()
  const ty = EXP_TYPES[exp.type ?? 'oddiy'] ?? EXP_TYPES.oddiy
  return (
    <li className="exp">
      {typed && (
        <span className={`exp__type exp__type--${exp.type ?? 'oddiy'}`}>
          {ty.icon}
          <span>{t(ty.label)}</span>
        </span>
      )}
      <span className="exp__name">{exp.name}</span>
      {exp.minutes ? <span className="exp__min">{exp.minutes}′</span> : null}
    </li>
  )
}
