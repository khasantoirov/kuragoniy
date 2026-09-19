import { useRef, useState } from 'react'

export interface TrendPoint {
  date: string
  value: number
}

/** A single time-series line — the one chart *type* this app didn't already
 * have a hand-rolled version of (only a donut and a stacked-bar existed
 * before, see journal/MasteryPanel.tsx). A single series needs no legend
 * (the title already names it), but per the dataviz skill's interaction
 * rule a line chart still ships a hover crosshair + tooltip by default. */
export function TrendLineChart({
  data,
  formatDate,
  ariaLabel,
}: {
  data: TrendPoint[]
  formatDate: (iso: string) => string
  ariaLabel: string
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const W = 600
  const H = 160
  const padX = 8
  const padY = 12
  const max = Math.max(1, ...data.map((d) => d.value))
  const n = data.length

  const xAt = (i: number) => (n <= 1 ? W / 2 : padX + (i / (n - 1)) * (W - padX * 2))
  const yAt = (v: number) => H - padY - (v / max) * (H - padY * 2)

  const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(d.value)}`).join(' ')
  const areaPath = n > 0 ? `${linePath} L ${xAt(n - 1)} ${H - padY} L ${xAt(0)} ${H - padY} Z` : ''

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg || n === 0) return
    const rect = svg.getBoundingClientRect()
    const relX = ((e.clientX - rect.left) / rect.width) * W
    let nearest = 0
    let best = Infinity
    for (let i = 0; i < n; i++) {
      const dist = Math.abs(xAt(i) - relX)
      if (dist < best) {
        best = dist
        nearest = i
      }
    }
    setHoverIdx(nearest)
  }

  const hovered = hoverIdx !== null ? data[hoverIdx] : null

  return (
    <div className="trendchart">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="trendchart__svg"
        role="img"
        aria-label={ariaLabel}
        onMouseMove={onMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <line x1={padX} y1={H - padY} x2={W - padX} y2={H - padY} className="trendchart__axis" />
        {areaPath && <path d={areaPath} className="trendchart__area" />}
        {linePath && <path d={linePath} className="trendchart__line" fill="none" />}
        {hovered && (
          <>
            <line x1={xAt(hoverIdx!)} y1={padY} x2={xAt(hoverIdx!)} y2={H - padY} className="trendchart__cross" />
            <circle cx={xAt(hoverIdx!)} cy={yAt(hovered.value)} r={4} className="trendchart__dot" />
          </>
        )}
      </svg>
      {hovered && (
        <div className="trendchart__tip" style={{ left: `${(xAt(hoverIdx!) / W) * 100}%` }}>
          <b>{hovered.value}</b>
          <span>{formatDate(hovered.date)}</span>
        </div>
      )}
    </div>
  )
}
