import type { LicenceState, ManagerPosition } from './api'

/** How a licence state looks (a pill tone). */
export const LICENCE_TONE: Record<LicenceState, 'ok' | 'mid' | 'bad' | 'muted'> = {
  active: 'ok', trial: 'ok', unpaid: 'mid', ending: 'mid', future: 'muted', expired: 'bad', none: 'muted',
}

export const POSITIONS: { value: ManagerPosition; label: string }[] = [
  { value: 'direktor', label: 'Direktor' },
  { value: 'zavuch', label: 'Zavuch' },
  { value: 'boshqa', label: 'Boshqa' },
]

/** 4500000 → "4 500 000 so'm" */
export const som = (n: number | null | undefined) =>
  n == null ? '—' : `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} so'm`

/** seats taken, out of the licence's limit when it has one */
export const seats = (used: number, limit: number | null | undefined) => (limit == null ? `${used}` : `${used} / ${limit}`)
