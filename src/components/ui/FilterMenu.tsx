import { ReactNode, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSmartPosition } from '@/hooks/useSmartPosition'

interface Props {
  activeCount: number
  onClear?: () => void
  children: ReactNode
}

/** A single "Filtros" trigger grouping several filter controls in one popover, instead of a loose row of selects. */
export function FilterMenu({ activeCount, onClear, children }: Props) {
  const [open, setOpen] = useState(false)
  const { triggerRef, popoverRef, position } = useSmartPosition(open)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (
        popoverRef.current && !(popoverRef.current as HTMLElement).contains(e.target as Node) &&
        triggerRef.current && !(triggerRef.current as HTMLElement).contains(e.target as Node)
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
        className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-[var(--radius-lg)] border transition-colors"
        style={{
          borderColor: activeCount > 0 ? 'var(--oe-primary)' : 'var(--border-default)',
          background: 'var(--surface-card)',
          color: activeCount > 0 ? 'var(--oe-primary)' : 'var(--text-secondary)',
        }}
      >
        <FilterIcon />
        Filtros
        {activeCount > 0 && (
          <span
            className="flex items-center justify-center rounded-[var(--radius-pill)] text-white"
            style={{ width: 16, height: 16, fontSize: 10, fontWeight: 700, background: 'var(--oe-primary)' }}
          >
            {activeCount}
          </span>
        )}
      </button>

      {open && createPortal(
        <div
          ref={popoverRef as any}
          className="p-3 space-y-3 w-72"
          style={{
            position: 'fixed', ...position, zIndex: 1000,
            background: 'var(--surface-card)', border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)',
          }}
        >
          {children}
          {onClear && activeCount > 0 && (
            <button
              onClick={() => { onClear(); setOpen(false) }}
              className="text-xs underline"
              style={{ color: 'var(--text-tertiary)' }}
            >
              Limpar filtros
            </button>
          )}
        </div>,
        document.body,
      )}
    </>
  )
}

function FilterIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5h18M6 12h12M10 19.5h4" />
    </svg>
  )
}
