import { SortDir } from '@/hooks/useSort'

interface Props {
  label: string
  field: string
  sortField?: string
  sortDir: SortDir
  onSort: (field: string) => void
  className?: string
}

/** Clickable `<th>` content — label + chevron indicating current sort
 *  direction, only shown on the active column. */
export function SortableHeader({ label, field, sortField, sortDir, onSort, className = '' }: Props) {
  const active = sortField === field
  return (
    <button
      onClick={() => onSort(field)}
      className={`flex items-center gap-1 font-medium hover:text-[var(--text-primary)] transition-colors ${className}`}
      style={{ color: active ? 'var(--text-primary)' : 'inherit', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
    >
      {label}
      <svg
        className="w-3 h-3 shrink-0 transition-opacity"
        style={{ opacity: active ? 1 : 0.25, transform: active && sortDir === 'desc' ? 'rotate(180deg)' : 'none' }}
        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
      </svg>
    </button>
  )
}
