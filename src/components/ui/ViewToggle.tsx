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
    <div className="flex items-center gap-0.5 p-0.5 h-8 rounded-[var(--radius-pill)]" style={{ background: 'var(--surface-subtle)' }}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className="h-7 px-2.5 text-[13px] font-medium transition-colors flex items-center gap-1.5 rounded-[var(--radius-pill)]"
          style={value === opt.value
            ? { background: 'var(--text-primary)', color: 'var(--surface-page)' }
            : { background: 'transparent', color: 'var(--text-secondary)' }}
        >
          {opt.icon}
          {opt.label}
        </button>
      ))}
    </div>
  )
}
