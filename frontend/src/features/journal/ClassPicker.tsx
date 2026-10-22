import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { JournalClass } from './types'

/** One button instead of a chip per class: shows the current class (school
 * small above it), opens a list grouped by school, and ‹ › step through the
 * classes. Keeps the journal header to a single line however many classes
 * a teacher has. */
export function ClassPicker({ classes, value, onChange, onAdd }: {
  classes: JournalClass[]
  value: number
  onChange: (id: number) => void
  onAdd?: () => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const i = Math.max(0, classes.findIndex((c) => c.id === value))
  const cur = classes[i]

  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  const groups = new Map<string, JournalClass[]>()
  for (const c of classes) {
    const school = c.partner_school_name || c.school || ''
    groups.set(school, [...(groups.get(school) ?? []), c])
  }
  const pick = (id: number) => {
    onChange(id)
    setOpen(false)
  }

  return (
    <div className="cpick" ref={wrap}>
      <button
        type="button"
        className="cpick__step"
        aria-label={t('Oldingi sinf')}
        disabled={classes.length < 2}
        onClick={() => onChange(classes[(i - 1 + classes.length) % classes.length].id)}
      >
        ‹
      </button>
      <button type="button" className="cpick__btn" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="cpick__txt">
          {cur?.school && <small>{cur.partner_school_name || cur.school}</small>}
          <b>{cur?.name}</b>
        </span>
        <span className="cpick__n">{i + 1}/{classes.length}</span>
        <span className="cpick__cx" aria-hidden="true">▾</span>
      </button>
      <button
        type="button"
        className="cpick__step"
        aria-label={t('Keyingi sinf')}
        disabled={classes.length < 2}
        onClick={() => onChange(classes[(i + 1) % classes.length].id)}
      >
        ›
      </button>
      {open && (
        <div className="cpick__pop" role="listbox" aria-label={t('Sinflar')}>
          {[...groups.entries()].map(([school, list]) => (
            <div key={school} className="cpick__grp">
              <span className="cpick__school">{school || t("Maktab ko'rsatilmagan")}</span>
              <div className="cpick__list">
                {list.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    role="option"
                    aria-selected={c.id === value}
                    className={`cpick__item ${c.id === value ? 'is-on' : ''}`}
                    onClick={() => pick(c.id)}
                  >
                    {c.name}
                    <span className="cpick__cnt">{c.students.length}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          {onAdd && (
            <button type="button" className="cpick__add" onClick={() => { setOpen(false); onAdd() }}>
              + {t("Sinf qo'shish")}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
