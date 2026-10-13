import { isAxiosError } from 'axios'
import type { ReactNode } from 'react'

/** Small shared building blocks for the student/teacher/administration
 * portal screens — kept here so every new page reads the same. */

export function PageHead({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return (
    <header className="phead">
      <div className="phead__txt">
        <h2 className="phead__title">{title}</h2>
        {sub && <p className="phead__sub">{sub}</p>}
      </div>
      {actions && <div className="phead__acts">{actions}</div>}
    </header>
  )
}

export function StatTile({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: 'ok' | 'warn' | 'bad' }) {
  return (
    <div className={`stile ${tone ? `stile--${tone}` : ''}`}>
      <p className="stile__label">{label}</p>
      <p className="stile__value">{value}</p>
      {hint && <p className="stile__hint">{hint}</p>}
    </div>
  )
}

export function Meter({ value, max = 100, label }: { value: number; max?: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div className="meter" role="meter" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
      <span className="meter__fill" style={{ width: `${pct}%` }} />
    </div>
  )
}

/** Score pill with a word, not just a color (accessible). */
export function PercentPill({ value }: { value: number | null | undefined }) {
  if (value == null) return <span className="pill pill--muted">—</span>
  const tone = value >= 85 ? 'ok' : value >= 60 ? 'mid' : 'bad'
  return <span className={`pill pill--${tone}`}>{Math.round(value)}%</span>
}

export function StatusPill({ tone, children }: { tone: 'ok' | 'mid' | 'bad' | 'muted' | 'info'; children: ReactNode }) {
  return <span className={`pill pill--${tone}`}>{children}</span>
}

export function Stars({ value, onChange, size = 22 }: { value: number | null; onChange?: (v: number) => void; size?: number }) {
  return (
    <span className="stars" role={onChange ? 'radiogroup' : undefined}>
      {[1, 2, 3, 4, 5].map((n) => {
        const on = (value ?? 0) >= n
        const star = (
          <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
            <path d="M12 2.7 14.7 8.6 21.1 9.4 16.4 13.7 17.7 20.1 12 16.9 6.3 20.1 7.6 13.7 2.9 9.4 9.3 8.6Z"
              fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          </svg>
        )
        return onChange ? (
          <button key={n} type="button" className={`stars__b ${on ? 'is-on' : ''}`} role="radio" aria-checked={value === n}
            aria-label={`${n}`} onClick={() => onChange(n)}>{star}</button>
        ) : (
          <span key={n} className={`stars__b ${on ? 'is-on' : ''}`}>{star}</span>
        )
      })}
    </span>
  )
}

export function Segmented<T extends string | number>({ value, options, onChange }: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="tab" aria-selected={o.value === value}
          className={`seg__b ${o.value === value ? 'is-on' : ''}`} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Best human-readable message out of a DRF error response. */
export function errText(err: unknown, fallback = "Amalni bajarib bo'lmadi"): string {
  if (!isAxiosError(err)) return fallback
  if (!err.response) return "Internet aloqasi yo'q"
  const data = err.response.data as unknown
  if (typeof data === 'string') return fallback
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>
    if (typeof d.detail === 'string') return d.detail
    for (const v of Object.values(d)) {
      if (typeof v === 'string') return v
      if (Array.isArray(v) && typeof v[0] === 'string') return v[0]
      if (v && typeof v === 'object') {
        const inner = Object.values(v as Record<string, unknown>)[0]
        if (Array.isArray(inner) && typeof inner[0] === 'string') return inner[0]
      }
    }
  }
  return fallback
}

const pad = (n: number) => String(n).padStart(2, '0')

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fmtDuration(sec: number | null | undefined): string {
  if (sec == null) return '—'
  if (sec < 60) return `${sec} s`
  const m = Math.floor(sec / 60)
  return m < 60 ? `${m} daq ${sec % 60} s` : `${Math.floor(m / 60)} soat ${m % 60} daq`
}

export function fmtMoney(n: number | null | undefined): string {
  return `${(n ?? 0).toLocaleString('ru-RU').replace(/,/g, ' ')} so'm`
}

export function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  return String(Math.round(n))
}

export const ATTEMPT_KIND_LABEL: Record<string, string> = {
  practice: 'Mustaqil mashq',
  homework: 'Uyga vazifa',
  readiness: 'Tayyorgarlik',
}
