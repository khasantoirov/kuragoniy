import { useState } from 'react'

import type { ColumnDatum } from './ColumnChart'

/**
 * Single-series line chart, the line twin of ColumnChart (same data,
 * same axis and spacing, so switching between them keeps every point in
 * place). 2px line, 8px markers with a surface ring, recessive grid; only
 * the maximum carries a direct label, the rest are on hover/focus via a
 * crosshair and tooltip.
 */
export function LineChart({ data, format = (v) => String(Math.round(v)), max, height = 180, ariaLabel }: {
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
  const ticks = [0, top / 2, top]
  const maxIdx = data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0)
  const x = (i: number) => padL + band * i + band / 2
  const y = (v: number) => padT + plotH - (Math.max(0, v) / top) * plotH
  const path = data.map((d, i) => `${i ? 'L' : 'M'}${x(i)},${y(d.value)}`).join(' ')

  return (
    <div className="cchart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} preserveAspectRatio="xMidYMid meet">
        {ticks.map((tk) => (
          <g key={tk}>
            <line x1={padL} x2={W} y1={y(tk)} y2={y(tk)} className="cchart__grid" />
            <text x={padL - 6} y={y(tk) + 4} className="cchart__tick" textAnchor="end">{format(tk)}</text>
          </g>
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + plotH} className="cchart__cross" />}
        <path d={path} className="cchart__line" />
        {data.map((d, i) => (
          <g key={i}
            onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}
            onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0}
            aria-label={`${d.label}: ${format(d.value)}`}>
            <rect x={padL + band * i} y={padT} width={band} height={plotH} fill="transparent" />
            <circle cx={x(i)} cy={y(d.value)} r={hover === i ? 5 : 4} className="cchart__dot" />
            {i === maxIdx && d.value > 0 && (
              <text x={x(i)} y={y(d.value) - 10} className="cchart__val" textAnchor="middle">{format(d.value)}</text>
            )}
            <text x={x(i)} y={H - 8} className="cchart__tick" textAnchor="middle">{d.label}</text>
          </g>
        ))}
      </svg>
      {hover !== null && (
        <div className="cchart__tip" style={{ left: `${(x(hover) / W) * 100}%` }} role="status">
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
