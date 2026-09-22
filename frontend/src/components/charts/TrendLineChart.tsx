import { useRef, useState } from 'react'

export interface TrendPoint {
  date: string
  /** null = no data for this period (e.g. nobody was graded that week) —
   * the line breaks here rather than interpolating across it. A gap must
   * read as "no data", never as a fabricated dip-and-recovery. */
  value: number | null
}

/** A time-series line. A single series needs no legend (the title already
 * names it); a second, muted `reference` series (a parent-scope average
 * drawn for context — never a second independent identity) adds one,
 * per the dataviz skill's "legend for >=2 series" rule. Both series
 * always share this one y-axis — never a second scale. Per the
 * interaction rule a line chart still ships a hover crosshair + tooltip
 * by default. */
export function TrendLineChart({
  data,
  reference,
  seriesLabel,
  referenceLabel,
  formatDate,
  valueSuffix = '',
  ariaLabel,
}: {
  data: TrendPoint[]
  reference?: TrendPoint[]
  seriesLabel?: string
  referenceLabel?: string
  formatDate: (iso: string) => string
  valueSuffix?: string
  ariaLabel: string
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const W = 600
  const H = 160
  const padX = 8
  const padY = 12
  const n = data.length
  const hasReference = !!reference && reference.length > 0

  const values = data.map((d) => d.value).filter((v): v is number => v !== null)
  const refValues = hasReference ? reference!.map((d) => d.value).filter((v): v is number => v !== null) : []
  // One shared scale for both series — never a second y-axis.
  const max = Math.max(1, ...values, ...refValues)

  const xAt = (i: number) => (n <= 1 ? W / 2 : padX + (i / (n - 1)) * (W - padX * 2))
  const yAt = (v: number) => H - padY - (v / max) * (H - padY * 2)

  /** Builds one or more M/L subpaths, starting a new one after every
   * null — a gap in the data must render as a gap in the line, never
   * as a straight line drawn across it. */
  const buildPath = (points: TrendPoint[]) => {
    let d = ''
    let open = false
    points.forEach((p, i) => {
      if (p.value === null) {
        open = false
        return
      }
      d += `${open ? 'L' : 'M'} ${xAt(i)} ${yAt(p.value)} `
      open = true
    })
    return d.trim()
  }

  /** One closed fill shape per contiguous run of non-null values, each
   * bounded to its own span. A naive "close the whole line to the
   * baseline at the last index" would draw a fill sloping down from the
   * last real point to wherever the data happens to end — reading as a
   * decline to zero that never happened. A gap must fill nothing. */
  const buildAreaPath = (points: TrendPoint[]) => {
    let d = ''
    let seg: { i: number; value: number }[] = []
    const flush = () => {
      if (seg.length < 2) {
        seg = []
        return
      }
      const first = seg[0]
      const last = seg[seg.length - 1]
      d += `M ${xAt(first.i)} ${yAt(first.value)} `
      for (const p of seg.slice(1)) d += `L ${xAt(p.i)} ${yAt(p.value)} `
      d += `L ${xAt(last.i)} ${H - padY} L ${xAt(first.i)} ${H - padY} Z `
      seg = []
    }
    points.forEach((p, i) => {
      if (p.value === null) {
        flush()
        return
      }
      seg.push({ i, value: p.value })
    })
    flush()
    return d.trim()
  }

  const linePath = buildPath(data)
  const areaPath = buildAreaPath(data)
  const referencePath = hasReference ? buildPath(reference!) : ''

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
  const hoveredRef = hoverIdx !== null && hasReference ? (reference![hoverIdx] ?? null) : null

  return (
    <div className="trendchart">
      {hasReference && (
        <div className="trendchart__legend">
          <span className="trendchart__lg"><i className="trendchart__sw" />{seriesLabel}</span>
          <span className="trendchart__lg"><i className="trendchart__sw trendchart__sw--ref" />{referenceLabel}</span>
        </div>
      )}
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
        {referencePath && <path d={referencePath} className="trendchart__line trendchart__line--ref" fill="none" />}
        {areaPath && <path d={areaPath} className="trendchart__area" />}
        {linePath && <path d={linePath} className="trendchart__line" fill="none" />}
        {hovered && hovered.value !== null && (
          <>
            <line x1={xAt(hoverIdx!)} y1={padY} x2={xAt(hoverIdx!)} y2={H - padY} className="trendchart__cross" />
            <circle cx={xAt(hoverIdx!)} cy={yAt(hovered.value)} r={4} className="trendchart__dot" />
            {hoveredRef && hoveredRef.value !== null && (
              <circle cx={xAt(hoverIdx!)} cy={yAt(hoveredRef.value)} r={3.5} className="trendchart__dot trendchart__dot--ref" />
            )}
          </>
        )}
      </svg>
      {hovered && (
        <div className="trendchart__tip" style={{ left: `${(xAt(hoverIdx!) / W) * 100}%` }}>
          <b>{hovered.value !== null ? `${hovered.value}${valueSuffix}` : '—'}</b>
          <span>{formatDate(hovered.date)}</span>
          {hasReference && hoveredRef && hoveredRef.value !== null && (
            <span className="trendchart__tip-ref">{referenceLabel}: {hoveredRef.value}{valueSuffix}</span>
          )}
        </div>
      )}
    </div>
  )
}
