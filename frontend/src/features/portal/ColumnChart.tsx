import { useState } from 'react'

export interface ColumnDatum {
  label: string
  value: number
  /** Extra line for the tooltip (e.g. "12 ta urinish"). */
  note?: string
}

/**
 * Single-series column chart (no legend — the panel title names the
 * series). Columns are capped at 24px with a 4px rounded data-end and a
 * square baseline; hairline recessive gridlines; only the maximum carries
 * a direct label, every other value is on hover/focus and in the table
 * shown next to the chart.
 */
export function ColumnChart({ data, format = (v) => String(Math.round(v)), max, height = 180, ariaLabel }: {
  data: ColumnDatum[]
  format?: (v: number) => string
  max?: number
  height?: number
  ariaLabel: string
}) {
  const [hover, setHover] = useState<number | null>(null)
  if (!data.length) return null

  const W = Math.max(280, data.length * 44)
  const H = height
  const padL = 34
  const padB = 26
  const padT = 18
  const plotH = H - padB - padT
  const top = max ?? niceMax(Math.max(...data.map((d) => d.value), 1))
  const band = (W - padL) / data.length
  const barW = Math.min(24, band * 0.6)
  const ticks = [0, top / 2, top]
  const maxIdx = data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0)
  const y = (v: number) => padT + plotH - (v / top) * plotH

  return (
    <div className="cchart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} preserveAspectRatio="xMidYMid meet">
        {ticks.map((tk) => (
          <g key={tk}>
            <line x1={padL} x2={W} y1={y(tk)} y2={y(tk)} className="cchart__grid" />
            <text x={padL - 6} y={y(tk) + 4} className="cchart__tick" textAnchor="end">{format(tk)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = padL + band * i + (band - barW) / 2
          const h = Math.max(0, (d.value / top) * plotH)
          const r = Math.min(4, h)
          const yTop = padT + plotH - h
          const path = h > 0
            ? `M${x},${padT + plotH} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + barW - r} Q${x + barW},${yTop} ${x + barW},${yTop + r} V${padT + plotH} Z`
            : ''
          return (
            <g key={i}
              onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}
              onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0}
              aria-label={`${d.label}: ${format(d.value)}`}>
              {/* Hit target wider than the mark. */}
              <rect x={padL + band * i} y={padT} width={band} height={plotH} fill="transparent" />
              {path && <path d={path} className={`cchart__bar ${hover === i ? 'is-hover' : ''}`} />}
              {i === maxIdx && d.value > 0 && (
                <text x={x + barW / 2} y={yTop - 5} className="cchart__val" textAnchor="middle">{format(d.value)}</text>
              )}
              <text x={x + barW / 2} y={H - 8} className="cchart__tick" textAnchor="middle">{d.label}</text>
            </g>
          )
        })}
      </svg>
      {hover !== null && (
        <div className="cchart__tip" style={{ left: `${((padL + band * hover + band / 2) / W) * 100}%` }} role="status">
          <strong>{format(data[hover].value)}</strong>
          <span>{data[hover].label}</span>
          {data[hover].note && <span>{data[hover].note}</span>}
        </div>
      )}
    </div>
  )
}

function niceMax(v: number): number {
  const exp = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / exp
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10
  return nice * exp
}
