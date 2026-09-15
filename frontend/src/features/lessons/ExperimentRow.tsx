import { useTranslation } from 'react-i18next'

import { EXP_TYPES } from './types'
import type { Experiment } from './types'

export function ExperimentRow({ exp }: { exp: Experiment }) {
  const { t } = useTranslation()
  const ty = EXP_TYPES[exp.type]
  return (
    <li className="exp">
      <span className={`exp__type exp__type--${exp.type}`}>
        {ty.icon}
        <span>{t(ty.label)}</span>
      </span>
      <span className="exp__name">{exp.name}</span>
      {exp.minutes ? <span className="exp__min">{exp.minutes}′</span> : null}
    </li>
  )
}
