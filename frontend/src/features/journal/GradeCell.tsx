import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { GRADES, gradeLabel } from './grades'

/** A mark as its colour with the digit inside. */
export function GradeChip({ v }: { v: number | null | undefined }) {
  const { t } = useTranslation()
  if (v == null) return null
  return <span className={`gchip gchip--${v}`} title={t(gradeLabel(v))}>{v}</span>
}

/** An editable mark (the quarter grade in the grid): click for the colour
 * buttons, or type 0–5 / Backspace while it has focus. */
export function GradeCell({ value, disabled, onChange }: {
  value: number | null | undefined
  disabled?: boolean
  onChange: (v: number | null) => void
}) {
  const { t } = useTranslation()
  const btn = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState<{ top: number; left: number } | null>(null)

  const open = () => {
    const el = btn.current
    if (!el || disabled) return
    // body has CSS zoom: rects come back zoomed, fixed offsets get zoomed again.
    const zoom = parseFloat(getComputedStyle(document.body).zoom || '1') || 1
    const r = el.getBoundingClientRect()
    setAt({ top: r.bottom / zoom + 4, left: Math.max(8, Math.min(r.left / zoom - 80, window.innerWidth / zoom - 236)) })
  }
  const pick = (v: number | null) => {
    setAt(null)
    if (v !== (value ?? null)) onChange(v)
  }

  useEffect(() => {
    if (!at) return
    const close = (e: Event) => {
      if (pop.current?.contains(e.target as Node) || btn.current?.contains(e.target as Node)) return
      setAt(null)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAt(null) }
    document.addEventListener('pointerdown', close)
    window.addEventListener('scroll', close, true)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', close)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [at])

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`gcell ${value != null ? `gchip gchip--${value}` : ''}`}
        disabled={disabled}
        title={value != null ? t(gradeLabel(value)) : t('Baho qo\'yish')}
        onClick={() => (at ? setAt(null) : open())}
        onKeyDown={(e) => {
          if (/^[0-5]$/.test(e.key)) { e.preventDefault(); pick(Number(e.key)) }
          else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); pick(null) }
        }}
      >
        {value ?? ''}
      </button>
      {at && createPortal(
        <div ref={pop} className="gpop" style={{ top: at.top, left: at.left }} role="listbox">
          {GRADES.map((g) => (
            <button key={g.v} type="button" className={`gchip gchip--${g.v} gpop__b ${value === g.v ? 'is-on' : ''}`} onClick={() => pick(g.v)}>
              <b>{g.v}</b><span>{t(g.label)}</span>
            </button>
          ))}
          <button type="button" className="gpop__clear" onClick={() => pick(null)}>✕ {t("O'chirish")}</button>
        </div>,
        document.body,
      )}
    </>
  )
}
