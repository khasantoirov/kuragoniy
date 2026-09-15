import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'

import { IC } from '@/icons'

import { EXP_TYPES, type Experiment } from './types'

export function ExperimentCard({
  exp,
  admin,
  canDrag = false,
  onEdit,
  onDelete,
  onCopy,
  onMove,
}: {
  exp: Experiment
  admin: boolean
  canDrag?: boolean
  onEdit: () => void
  onDelete: () => void
  onCopy: () => void
  onMove: () => void
}) {
  const { t } = useTranslation()
  const ty = EXP_TYPES[exp.type]
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `exp-${exp.id}`,
    disabled: !canDrag,
  })
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <article ref={setNodeRef} style={style} className="xcard">
      <div className="xcard__head">
        <div className="xcard__meta">
          {canDrag && (
            <button
              type="button"
              className="xcard__grip"
              aria-label={t("Ko'chirish uchun ushlab torting")}
              {...attributes}
              {...listeners}
            >
              {IC.grip}
            </button>
          )}
          <span className={`exp__type exp__type--${exp.type}`}>
            {ty.icon}
            <span>{t(ty.label)}</span>
          </span>
          {exp.minutes ? <span className="xcard__min">{exp.minutes} {t('daqiqa')}</span> : null}
          {admin && (
            <span className="xcard__tools">
              <button className="icon-btn" onClick={onEdit} title={t('Tahrirlash')}>
                {IC.edit}
              </button>
              <button className="icon-btn" onClick={onCopy} title={t('Nusxa olish')}>
                {IC.copy}
              </button>
              <button className="icon-btn" onClick={onMove} title={t("Boshqa darsga ko'chirish")}>
                {IC.move}
              </button>
              <button className="icon-btn icon-btn--danger" onClick={onDelete} title={t("O'chirish")}>
                {IC.trash}
              </button>
            </span>
          )}
        </div>
        <h4 className="xcard__title">{exp.name}</h4>
      </div>

      {exp.desc && <p className="xcard__desc">{exp.desc}</p>}

      {exp.materials.length > 0 && (
        <div className="xblock">
          <p className="xblock__label">{t('Kerakli jihozlar')}</p>
          <ul className="xlist xlist--tags">
            {exp.materials.map((m, i) => (
              <li key={i} className="xtag">
                {m}
              </li>
            ))}
          </ul>
        </div>
      )}

      {exp.steps.length > 0 && (
        <div className="xblock">
          <p className="xblock__label">{t('Bajarish tartibi')}</p>
          <ol className="xlist xlist--steps">
            {exp.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </div>
      )}

      {exp.safety && (
        <p className="xsafety">
          <span>{t('Xavfsizlik')}</span>
          {exp.safety}
        </p>
      )}

      {exp.image && (
        <a className="xcard__imgwrap" href={exp.image} target="_blank" rel="noreferrer">
          <img className="xcard__img" src={exp.image} alt={exp.name} loading="lazy" />
        </a>
      )}

      {exp.video && (
        <a className="xcard__video" href={exp.video} target="_blank" rel="noreferrer">
          {IC.play} {t("Videoni ko'rish")}
        </a>
      )}
    </article>
  )
}
