import type { Experiment } from './types'

export function ExperimentRow({ exp }: { exp: Experiment }) {
  return (
    <li className="exp">
      <span className="exp__name">{exp.name}</span>
      {exp.minutes ? <span className="exp__min">{exp.minutes}′</span> : null}
    </li>
  )
}
