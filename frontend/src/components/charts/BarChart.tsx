/** One value per category — compares magnitudes across a handful of named
 * groups (role breakdown, lessons per grade-band). Reuses the app's
 * existing hand-rolled CSS-bar technique (journal/MasteryPanel.tsx's
 * `.mastery__chart` family) rather than a stacked chart, since each
 * category here is a single number, not a part-of-a-whole split.
 *
 * Every bar carries a direct value label (not color-only) — required
 * since 2 of the 4 default categorical hues fall under 3:1 contrast on a
 * light surface (see dataviz skill's palette relief rule). */
export interface BarDatum {
  key: string
  label: string
  value: number
  color: string
}

export function BarChart({ data, ariaLabel }: { data: BarDatum[]; ariaLabel: string }) {
  const max = Math.max(1, ...data.map((d) => d.value))

  return (
    <div className="barchart" role="img" aria-label={ariaLabel}>
      <div className="barchart__cols">
        {data.map((d) => (
          <div key={d.key} className="barchart__col">
            <span className="barchart__val">{d.value}</span>
            <div className="barchart__track">
              <div
                className="barchart__bar"
                style={{ height: `${(d.value / max) * 100}%`, background: d.color }}
              />
            </div>
            <span className="barchart__lb">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
