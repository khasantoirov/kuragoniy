import type { User } from '@/lib/api/types'

// Ported from js/auth.js roleBadges() — inline-styled pill, same colors.
export function RoleBadge({ user }: { user: Pick<User, 'is_dev_superuser' | 'role'> }) {
  if (user.is_dev_superuser) return <Pill bg="var(--pick)" fg="#fff" label="Dasturchi" />
  if (user.role === 'boshliq') return <Pill bg="rgba(154,107,18,.16)" fg="#9A6B12" label="Boshliq" />
  if (user.role === 'admin') return <Pill bg="rgba(76,141,246,.16)" fg="var(--pick)" label="Admin" />
  return <Pill bg="var(--rule-2)" fg="var(--ink-2)" label="Ustoz" />
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
