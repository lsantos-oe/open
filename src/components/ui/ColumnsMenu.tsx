import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSmartPosition } from '@/hooks/useSmartPosition'
import { ColumnDef } from '@/hooks/useColumnVisibility'

interface Props {
  columns: ColumnDef[]
  isVisible: (key: string) => boolean
  onToggle: (key: string) => void
}

/** "Colunas" trigger — a popover with a checkbox per optional column, mirrors
 *  FilterMenu's shell so the two buttons read as one family in the toolbar. */
export function ColumnsMenu({ columns, isVisible, onToggle }: Props) {
  const [open, setOpen] = useState(false)
  const { triggerRef, popoverRef, position } = useSmartPosition(open)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      const target = e.target as HTMLElement
      if (target.closest('[data-oe-nested-popover]')) return
      if (
        popoverRef.current && !(popoverRef.current as HTMLElement).contains(target) &&
        triggerRef.current && !(triggerRef.current as HTMLElement).contains(target)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (!open) return
    function handler(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  return (
    <>
      <button
        ref={triggerRef as any}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-[var(--radius-md)] border transition-colors"
        style={{ borderColor: 'var(--border-default)', background: 'var(--surface-card)', color: 'var(--text-secondary)' }}
      >
        <ColumnsIcon />
        Colunas
      </button>

      {open && createPortal(
        <div
          ref={popoverRef as any}
          className="p-2 space-y-0.5 w-56"
          style={{
            position: 'fixed', ...position, zIndex: 1000,
            background: 'var(--surface-card)', border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)',
          }}
        >
          {columns.map((col) => (
            <label
              key={col.key}
              className="flex items-center gap-2 text-sm px-2 py-1.5 rounded-[var(--radius-md)] cursor-pointer"
              style={{ color: col.locked ? 'var(--text-disabled)' : 'var(--text-secondary)' }}
              onMouseEnter={(e) => { if (!col.locked) (e.currentTarget as HTMLElement).style.background = 'var(--surface-subtle)' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = '' }}
            >
              <input
                type="checkbox"
                className="rounded border-[var(--border-default)] accent-[var(--oe-primary)]"
                checked={col.locked || isVisible(col.key)}
                disabled={col.locked}
                onChange={() => onToggle(col.key)}
              />
              {col.label}
            </label>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}

function ColumnsIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15M4.5 4.5h15a1 1 0 011 1v13a1 1 0 01-1 1h-15a1 1 0 01-1-1v-13a1 1 0 011-1z" />
    </svg>
  )
}
