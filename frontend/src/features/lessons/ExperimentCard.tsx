import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ImageLightbox } from '@/components/ImageLightbox'
import { IC } from '@/icons'

import type { Experiment } from './types'

/** The lesson's one practical task — not a repeatable, reorderable list
 * item (a lesson has exactly one, see LessonDetail.tsx), so this renders
 * as a single standalone panel with no drag handle and no sibling grid. */
export function ExperimentCard({
  exp,
  admin,
  onEdit,
  onDelete,
  onCopy,
  onMove,
}: {
  exp: Experiment
  admin: boolean
  onEdit: () => void
  onDelete: () => void
  onCopy: () => void
  onMove: () => void
}) {
  const { t } = useTranslation()
  const [lightboxOpen, setLightboxOpen] = useState(false)

  return (
    <article className="xcard">
      {/* Rasm o'ng ustunda, matn bilan yonma-yon — galereyadagidek yaxlit
          (object-fit: contain, hech qanday qirqilish yo'q), tor ekranda
          esa ustma-ust tushadi (CSS, xcard__layout). */}
      <div className="xcard__layout">
        <div className="xcard__main">
          <div className="xcard__head">
            <div className="xcard__meta">
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

          {exp.concepts.length > 0 && (
            <div className="xblock">
              <p className="xblock__label">{t("O'rganiladigan tushunchalar")}</p>
              <ul className="xlist xlist--tags">
                {exp.concepts.map((c, i) => (
                  <li key={i} className="xtag xtag--concept">
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {exp.safety && (
            <p className="xsafety">
              <span>{t('Xavfsizlik')}</span>
              {exp.safety}
            </p>
          )}

          {exp.video && (
            <a className="xcard__video" href={exp.video} target="_blank" rel="noreferrer">
              {IC.play} {t("Videoni ko'rish")}
            </a>
          )}
        </div>

        {exp.image && (
          <div className="xcard__media">
            {/* Miniatura shu yerda doim ko'rinib turadi (galereyadagidek) —
                bosilganda esa to'liq o'lchamda lightbox'da ochiladi, yangi
                brauzer tabida emas. */}
            <button
              type="button"
              className="xcard__imgwrap"
              onClick={() => setLightboxOpen(true)}
              aria-label={t("Rasmni kattalashtirib ko'rish")}
            >
              <img className="xcard__img" src={exp.image} alt={exp.name} loading="lazy" />
            </button>
          </div>
        )}
      </div>

      {exp.image && lightboxOpen && (
        <ImageLightbox src={exp.image} alt={exp.name} onClose={() => setLightboxOpen(false)} />
      )}
    </article>
  )
}
