import type { User } from '@/lib/api/types'

import { roleLabel } from './roleLabel'

// Ported from js/auth.js roleBadges() — inline-styled pill, same colors.
const COLORS: Record<string, [bg: string, fg: string]> = {
  Dasturchi: ['var(--pick)', '#fff'],
  Rahbar: ['rgba(154,107,18,.16)', '#9A6B12'],
  Admin: ['rgba(76,141,246,.16)', 'var(--pick)'],
  Kuzatuvchi: ['rgba(9,189,60,.14)', '#0B7A2C'],
  "Maktab ma'muriyati": ['rgba(124,92,255,.14)', '#6A4BE0'],
  "O'quvchi": ['rgba(226,70,90,.12)', 'var(--mark)'],
  Ustoz: ['var(--rule-2)', 'var(--ink-2)'],
}

export function RoleBadge({ user }: { user: Pick<User, 'is_dev_superuser' | 'role'> }) {
  const label = roleLabel(user)
  const [bg, fg] = COLORS[label] ?? COLORS.Ustoz
  return <Pill bg={bg} fg={fg} label={label} />
}

function Pill({ bg, fg, label }: { bg: string; fg: string; label: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        verticalAlign: '1px',
        marginLeft: 6,
        padding: '1px 7px',
        borderRadius: 5,
        font: '600 11px/1.7 var(--f-mono, ui-monospace, monospace)',
        letterSpacing: '.02em',
        background: bg,
        color: fg,
      }}
    >
      {label}
    </span>
  )
}
