import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { avgLevel, bandText, fmtAvg, levelLabel, levelOf, LEVELS, markLabel, marksOf, type Scale } from './scales'

/** A mark as its colour band with the number inside. */
export function GradeChip({ v, scale, empty }: { v: number | null | undefined; scale: Scale; empty?: string }) {
  const { t } = useTranslation()
  if (v == null) return empty ? <>{empty}</> : null
  return <span className={`gchip gchip--${levelOf(v, scale)} ${scale === 100 ? 'gchip--wide' : ''}`} title={t(markLabel(v, scale))}>{v}</span>
}

/** An average on the class's scale, coloured as the mark it rounds to. */
export function AvgChip({ avg, scale }: { avg: number | null | undefined; scale: Scale }) {
  const { t } = useTranslation()
  if (avg == null) return <>—</>
  const l = avgLevel(avg, scale)
  return <span className={`gchip gchip--${l} gchip--wide`} title={t(levelLabel(l))}>{fmtAvg(avg, scale)}</span>
}

/** Typing a 0-100 mark: the colour band follows the number. */
function NumberPick({ value, scale, onPick }: { value: number | null | undefined; scale: Scale; onPick: (v: number | null) => void }) {
  const { t } = useTranslation()
  const [text, setText] = useState(value != null ? String(value) : '')
  const n = text.trim() === '' ? null : Number(text)
  const ok = n === null || (Number.isInteger(n) && n >= 0 && n <= scale)
  return (
    <form
      className="gpop__num"
      onSubmit={(e) => {
        e.preventDefault()
        if (ok) onPick(n)
      }}
    >
      <input
        className="input"
        type="number"
        inputMode="numeric"
        min={0}
        max={scale}
        autoFocus
        value={text}
        aria-label={t('Baho')}
        onChange={(e) => setText(e.target.value)}
      />
      <span className={`gchip ${n !== null && ok ? `gchip--${levelOf(n, scale)}` : 'gchip--none'} gpop__lvl`}>
        {n !== null && ok ? t(markLabel(n, scale)) : ok ? '—' : `0–${scale}`}
      </span>
      <button type="submit" className="btn btn--sm btn--primary" disabled={!ok}>OK</button>
      <span className="gpop__bands">
        {LEVELS.map((l) => (
          <button key={l.l} type="button" className={`gchip gchip--${l.l} gpop__band`} title={t(l.label)} onClick={() => setText(bandText(l.l, scale).split('–').pop()!)}>
            {bandText(l.l, scale)}
          </button>
        ))}
      </span>
    </form>
  )
}

/** An editable mark (the quarter grade in the grid): click for the colour
 * buttons (0-5, 0-10) or a number box (0-100); on 0-5 typing a digit works
 * while it has focus. */
export function GradeCell({ value, scale, disabled, onChange }: {
  value: number | null | undefined
  scale: Scale
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
    const w = scale === 5 ? 236 : 300
    setAt({ top: r.bottom / zoom + 4, left: Math.max(8, Math.min(r.left / zoom - 80, window.innerWidth / zoom - w - 8)) })
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
        className={`gcell ${value != null ? `gchip gchip--${levelOf(value, scale)}` : ''}`}
        disabled={disabled}
        title={value != null ? t(markLabel(value, scale)) : t('Baho qo\'yish')}
        onClick={() => (at ? setAt(null) : open())}
        onKeyDown={(e) => {
          if (scale === 5 && /^[0-5]$/.test(e.key)) { e.preventDefault(); pick(Number(e.key)) }
          else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); pick(null) }
        }}
      >
        {value ?? ''}
      </button>
      {at && createPortal(
        <div ref={pop} className={`gpop gpop--s${scale}`} style={{ top: at.top, left: at.left }} role="listbox">
          {scale === 100 ? (
            <NumberPick value={value} scale={scale} onPick={pick} />
          ) : (
            marksOf(scale).map((v) => (
              <button key={v} type="button" className={`gchip gchip--${levelOf(v, scale)} gpop__b ${value === v ? 'is-on' : ''}`}
                title={t(markLabel(v, scale))} onClick={() => pick(v)}>
                <b>{v}</b>{scale === 5 && <span>{t(markLabel(v, scale))}</span>}
              </button>
            ))
          )}
          <button type="button" className="gpop__clear" onClick={() => pick(null)}>✕ {t("O'chirish")}</button>
        </div>,
        document.body,
      )}
    </>
  )
}
