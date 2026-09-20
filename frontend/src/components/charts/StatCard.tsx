import { IC } from '@/icons'
import { useUIStore } from '@/store/uiStore'

/** A single KPI tile — the "16 247" / "356" style headline number from the
 * reference dashboard. Its own class names rather than reusing journal's
 * `.mastery__kpi` (band-colored borders, mastery-specific), so the two
 * features' markup/CSS stay independent even though they share tokens.
 *
 * `icon` and `progressPct` only render in 2-rejim: they're that skin's
 * card anatomy (icon disc + fill bar), and emitting them in 1-rejim would
 * change a look that is meant to stay exactly as it is. `progressPct` is
 * for real ratios only — there is no growth/trend data behind these
 * numbers, so nothing here fabricates a "+12%" delta. */
export function StatCard({
  label,
  value,
  hint,
  accent,
  icon,
  progressPct,
}: {
  label: string
  value: string | number
  hint?: string
  accent?: 'good' | 'mid' | 'bad'
  icon?: keyof typeof IC
  progressPct?: number | null
}) {
  const { skin } = useUIStore()
  const rich = skin === 'r2'
  const pct = progressPct === null || progressPct === undefined ? null : Math.max(0, Math.min(100, progressPct))

  return (
    <div className={`stat-card ${accent ? `stat-card--${accent}` : ''}`}>
      {rich && icon && <span className="stat-card__ic">{IC[icon]}</span>}
      <span className="stat-card__label">{label}</span>
      <b className="stat-card__value">{value}</b>
      {rich && pct !== null && (
        <span className="stat-card__bar" role="presentation">
          <span className="stat-card__fill" style={{ width: `${pct}%` }} />
        </span>
      )}
      {hint && <span className="stat-card__hint">{hint}</span>}
    </div>
  )
}
