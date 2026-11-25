import { useTranslation } from 'react-i18next'

/* A contact phone number (+998 and nine digits) — the landing page's
   "Ma'lumot qoldiring" form. Nobody signs in with a phone number. */

/** The nine digits after +998, from whatever was typed or pasted. */
export function localDigits(v: string): string {
  let d = v.replace(/\D/g, '')
  if (d.length > 9 && d.startsWith('998')) d = d.slice(3)
  return d.slice(0, 9)
}

/** "90 123 45 67" */
export function formatLocal(d: string): string {
  return [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean).join(' ')
}

export const fullPhone = (local: string) => `+998${local}`

export function PhoneField({ value, onChange, autoFocus, label }: {
  value: string
  onChange: (digits: string) => void
  autoFocus?: boolean
  label?: string
}) {
  const { t } = useTranslation()
  return (
    <label className="field">
      <span className="field__label">{label ?? t('Telefon raqam')}</span>
      <span className="ifield ifield--phone">
        <span className="ifield__pre" aria-hidden="true">+998</span>
        <input
          className="input input--phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          required
          autoFocus={autoFocus}
          placeholder="90 123 45 67"
          aria-label={t('Telefon raqam')}
          value={formatLocal(value)}
          onChange={(e) => onChange(localDigits(e.target.value))}
        />
      </span>
    </label>
  )
}
