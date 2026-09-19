/** Generic part-to-whole ring chart — same stroke-dasharray-arc technique as
 * journal/MasteryPanel.tsx's MasteryDonut, generalized to any set of
 * segments/colors instead of a hardcoded good/mid/bad shape, so the
 * dashboard's role- and grade-breakdown donuts can reuse it without
 * depending on journal's mastery-specific types. */
export interface DonutSegment {
  key: string
  label: string
  value: number
  color: string
}

export function DonutChart({
  segments,
  centerValue,
  centerLabel,
  ariaLabel,
}: {
  segments: DonutSegment[]
  centerValue: string
  centerLabel: string
  ariaLabel: string
}) {
  const total = segments.reduce((s, x) => s + x.value, 0)
  const r = 52
  const circumference = 2 * Math.PI * r
  const raw = segments.filter((s) => s.value > 0)
  const gap = raw.length > 1 ? 3 : 0

  let offset = 0
  const arcs = raw.map((s) => {
    const share = total > 0 ? s.value / total : 0
    const arc = { key: s.key, color: s.color, length: Math.max(share * circumference - gap, 0), offset }
    offset += share * circumference
    return arc
  })

  return (
    <svg viewBox="0 0 120 120" className="mastery__donut" role="img" aria-label={ariaLabel}>
      <circle cx="60" cy="60" r={r} className="mastery__donut-track" strokeWidth="14" fill="none" />
      {arcs.map((a) => (
        <circle
          key={a.key}
          cx="60"
          cy="60"
          r={r}
          fill="none"
          strokeWidth="14"
          strokeLinecap="round"
          style={{
            stroke: a.color,
            strokeDasharray: `${a.length} ${circumference}`,
            strokeDashoffset: -a.offset,
            transform: 'rotate(-90deg)',
            transformOrigin: '60px 60px',
          }}
        />
      ))}
      <text x="60" y="55" textAnchor="middle" className="mastery__donut-num">
        {centerValue}
      </text>
      <text x="60" y="74" textAnchor="middle" className="mastery__donut-label">
        {centerLabel}
      </text>
    </svg>
  )
}
