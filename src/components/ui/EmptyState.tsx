import { ReactNode } from 'react'
import { Button } from './Button'

interface Props {
  icon?: string
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
  children?: ReactNode
}

/** Standardized empty state — icon + message + one clear action, nothing more. */
export function EmptyState({ icon = '📭', title, description, action, children }: Props) {
  return (
    <div className="text-center py-16" style={{ color: 'var(--text-tertiary)' }}>
      <div className="text-4xl mb-3" style={{ opacity: 0.55 }}>{icon}</div>
      <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{title}</p>
      {description && <p className="text-sm mt-1 max-w-sm mx-auto">{description}</p>}
      {action && (
        <Button size="sm" className="mt-4" onClick={action.onClick}>{action.label}</Button>
      )}
      {children}
    </div>
  )
}
