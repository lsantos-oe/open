import { ReactNode } from 'react'

interface ViewToggleOption<T extends string> {
  value: T
  label: string
  icon?: ReactNode
}

interface ViewToggleProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: ViewToggleOption<T>[]
}

/** Shared segmented control for list/kanban-style view switches — icon+label
 *  always paired (icon-only reads ambiguous), same active color everywhere. */
export function ViewToggle<T extends string>({ value, onChange, options }: ViewToggleProps<T>) {
  return (
    <div className="flex rounded-[var(--radius-md)] border overflow-hidden" style={{ borderColor: 'var(--border-default)' }}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className="px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5"
          style={value === opt.value
            ? { background: 'var(--oe-primary)', color: 'white' }
            : { background: 'var(--surface-card)', color: 'var(--text-secondary)' }}
        >
          {opt.icon}
          {opt.label}
        </button>
      ))}
    </div>
  )
}
