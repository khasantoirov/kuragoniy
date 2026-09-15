import type { ReactNode } from 'react'

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty__rule" />
      <h3 className="empty__title">{title}</h3>
      {hint && <p className="empty__hint">{hint}</p>}
      {action}
    </div>
  )
}
