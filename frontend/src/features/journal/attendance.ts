import type { AttendanceStatus } from './types'

export const ATT: { k: AttendanceStatus | ''; ic: string; label: string; cls: string }[] = [
  { k: '', ic: '✓', label: 'Bor', cls: 'at--ok' },
  { k: 's', ic: 'S', label: 'Sababli', cls: 'at--s' },
  { k: 'n', ic: '✕', label: 'Sababsiz', cls: 'at--n' },
  { k: 'k', ic: '⏱', label: 'Kechikdi', cls: 'at--k' },
]

export const attOf = (k: string | undefined) => ATT.find((a) => a.k === (k || '')) ?? ATT[0]
export const nextAtt = (k: string | undefined): AttendanceStatus | '' => {
  const i = ATT.findIndex((a) => a.k === (k || ''))
  return ATT[(i + 1) % ATT.length].k
}
export const isAbsent = (k: string) => k === 's' || k === 'n'

export function fmtD(d: string) {
  return d.slice(8, 10) + '.' + d.slice(5, 7)
}
