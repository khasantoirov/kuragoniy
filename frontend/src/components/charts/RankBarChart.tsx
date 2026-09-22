/** Horizontal ranked bars — compares one measure (a percentage) across an
 * open-ended number of named categories (schools, then classes), sorted
 * by the caller. Horizontal, not vertical like BarChart: a school/class
 * name doesn't fit under a column, and a vertical list of rows scrolls
 * naturally when there are many.
 *
 * One shared `color` for the whole chart, never per-row: every bar is the
 * same measure by category, not N separate identities — assigning a
 * categorical hue per row here would mean "cycling" the palette past its
 * fixed 5-hue order, which the dataviz rules forbid. `max` defaults to
 * 100 (this chart's one job in this app is percentages) rather than the
 * tallest bar's own value — scaling to the visible max would draw the
 * best-performing bar at full width and read as 100% even when it isn't. */
export interface RankDatum {
  key: string
  label: string
  /** Full label for a name too long for the gutter (falls back to label). */
  titleText?: string
  /** null renders "—" and a neutral, non-clickable-looking baseline —
   * distinct from 0, which is a real (if worst-possible) measurement. */
  value: number | null
  /** Shaky-but-real data (low coverage / very few graded students) —
   * flagged with reduced opacity and a "*" on the value, never a
   * different hue and never hidden. */
  muted?: boolean
  hint?: string
}

export function RankBarChart({
  data,
  color,
  max = 100,
  valueSuffix = '%',
  onSelect,
  highlightKey,
  ariaLabel,
}: {
  data: RankDatum[]
  color: string
  max?: number
  valueSuffix?: string
  onSelect?: (key: string) => void
  highlightKey?: string
  ariaLabel: string
}) {
  return (
    <div className="rankbar" role="img" aria-label={ariaLabel}>
      <div className="rankbar__rows">
        {data.map((d) => {
          const pct = d.value === null ? 0 : Math.max(0, Math.min(100, (d.value / max) * 100))
          const isHighlighted = highlightKey === d.key
          const content = (
            <>
              <span className="rankbar__label" title={d.titleText ?? d.label}>{d.label}</span>
              <span className="rankbar__track">
                <span
                  className={`rankbar__fill ${d.muted ? 'is-muted' : ''}`}
                  style={{ width: `${pct}%`, background: d.value === null ? 'var(--rule)' : color }}
                />
              </span>
              <span className="rankbar__val">
                {d.value === null ? '—' : `${d.value}${valueSuffix}${d.muted ? '*' : ''}`}
              </span>
            </>
          )
          return onSelect ? (
            <button
              key={d.key}
              type="button"
              className={`rankbar__row is-clickable ${isHighlighted ? 'is-sel' : ''}`}
              onClick={() => onSelect(d.key)}
              title={d.hint}
            >
              {content}
            </button>
          ) : (
            <div key={d.key} className={`rankbar__row ${isHighlighted ? 'is-sel' : ''}`} title={d.hint}>
              {content}
            </div>
          )
        })}
      </div>
    </div>
  )
}
