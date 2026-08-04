import { ReactNode } from 'react'

interface Props {
  id: string
  title: ReactNode
  count?: number
  open: boolean
  onToggle: () => void
  children: ReactNode
  actions?: ReactNode
}

/** Card with a clickable header (chevron + title) whose body only mounts while
 *  open — used by detail pages so a collapsed section (e.g. a heavy Kanban/Plan
 *  view) never renders alongside the others. */
export function CollapsibleSection({ id, title, count, open, onToggle, children, actions }: Props) {
  return (
    <div id={id} className="mb-2" style={{ scrollMarginTop: 12, borderBottom: '1px solid var(--border-default)' }}>
      <div
        onClick={onToggle}
        className="flex items-center justify-between py-3.5 cursor-pointer"
      >
        <span className="flex items-center gap-2 text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>
          <ChevronIcon open={open} />
          {title}
        </span>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {count !== undefined && (
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{count}</span>
          )}
          {actions}
        </div>
      </div>
      {open && <div className="pb-3">{children}</div>}
    </div>
  )
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className="w-4 h-4 shrink-0 transition-transform"
      style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}
      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
    </svg>
  )
}
