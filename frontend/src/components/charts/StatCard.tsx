/** A single KPI tile — the "16 247" / "356" style headline number from the
 * reference dashboard. Its own class names rather than reusing journal's
 * `.mastery__kpi` (band-colored borders, mastery-specific), so the two
 * features' markup/CSS stay independent even though they share tokens. */
export function StatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string
  value: string | number
  hint?: string
  accent?: 'good' | 'mid' | 'bad'
}) {
  return (
    <div className={`stat-card ${accent ? `stat-card--${accent}` : ''}`}>
      <span className="stat-card__label">{label}</span>
      <b className="stat-card__value">{value}</b>
      {hint && <span className="stat-card__hint">{hint}</span>}
    </div>
  )
}
