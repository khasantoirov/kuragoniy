import { useState } from 'react'

export interface Slice {
  label: string
  value: number
  /** CSS colour (usually a var(--…) token). */
  color: string
}

/**
 * Composition donut: slices separated by a 2px surface gap, the total in
 * the middle, and a legend that names every slice with its count and
 * share (so identity never rests on colour alone). Hovering a slice or
 * its legend row highlights both.
 */
export function DonutChart({ slices, total: totalLabel, ariaLabel, format = (v) => String(v) }: {
  slices: Slice[]
  total: string
  ariaLabel: string
  format?: (v: number) => string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const sum = slices.reduce((a, s) => a + s.value, 0)
  if (!sum) return <p className="prose prose--note">—</p>

  const R = 70
  const r = 44
  const C = 90
  let angle = -Math.PI / 2
  const arcs = slices.map((s, i) => {
    const a0 = angle
    const a1 = angle + (s.value / sum) * Math.PI * 2
    angle = a1
    if (!s.value) return null
    // A single full slice can't be drawn as one arc — split it in two.
    const full = s.value === sum
    const pt = (rad: number, a: number) => `${C + rad * Math.cos(a)},${C + rad * Math.sin(a)}`
    const large = a1 - a0 > Math.PI ? 1 : 0
    const d = full
      ? `M${pt(R, a0)} A${R},${R} 0 1 1 ${pt(R, a0 + Math.PI)} A${R},${R} 0 1 1 ${pt(R, a0)} M${pt(r, a0)} A${r},${r} 0 1 0 ${pt(r, a0 + Math.PI)} A${r},${r} 0 1 0 ${pt(r, a0)} Z`
      : `M${pt(R, a0)} A${R},${R} 0 ${large} 1 ${pt(R, a1)} L${pt(r, a1)} A${r},${r} 0 ${large} 0 ${pt(r, a0)} Z`
    return { d, i, color: s.color }
  })
  const pct = (v: number) => `${Math.round((100 * v) / sum)}%`

  return (
    <div className="donut">
      <svg viewBox="0 0 180 180" role="img" aria-label={ariaLabel} className="donut__svg">
        {arcs.map((a) => a && (
          <path key={a.i} d={a.d} fill={a.color} fillRule="evenodd"
            className={`donut__slice ${hover !== null && hover !== a.i ? 'is-dim' : ''}`}
            onPointerEnter={() => setHover(a.i)} onPointerLeave={() => setHover(null)} />
        ))}
        <text x={C} y={C - 2} textAnchor="middle" className="donut__total">
          {hover !== null ? pct(slices[hover].value) : format(sum)}
        </text>
        <text x={C} y={C + 16} textAnchor="middle" className="donut__cap">
          {hover !== null ? slices[hover].label : totalLabel}
        </text>
      </svg>
      <ul className="donut__legend">
        {slices.map((s, i) => (
          <li key={s.label} className={hover === i ? 'is-on' : ''} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
            <span className="donut__sw" style={{ background: s.color }} aria-hidden="true" />
            <span className="donut__lb">{s.label}</span>
            <span className="donut__n">{format(s.value)}</span>
            <span className="donut__p">{pct(s.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
