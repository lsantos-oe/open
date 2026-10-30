import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSmartPosition } from '@/hooks/useSmartPosition'
import { Badge } from './Badge'

interface Props {
  items: string[]
  max?: number
}

/** A row of pill badges capped at `max` — the rest collapse into a "+N"
 *  chip that opens a popover with the full list. Keeps every table row a
 *  single line regardless of how many items it has. */
export function CappedBadgeList({ items, max = 2 }: Props) {
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

  if (items.length === 0) return <span style={{ color: 'var(--text-tertiary)' }}>—</span>

  const shown = items.slice(0, max)
  const rest = items.slice(max)

  return (
    <div className="flex flex-nowrap items-center gap-1 min-w-0">
      {shown.map((name) => (
        <Badge key={name} size="sm" className="min-w-0 shrink" title={name}>{name}</Badge>
      ))}
      {rest.length > 0 && (
        <>
          <button
            ref={triggerRef as any}
            onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
            className="text-[11.5px] h-5 px-2 rounded-[var(--radius-pill)] font-medium shrink-0"
            style={{ background: 'var(--badge-gray-bg)', color: 'var(--text-secondary)' }}
          >
            +{rest.length}
          </button>
          {open && createPortal(
            <div
              ref={popoverRef as any}
              onClick={(e) => e.stopPropagation()}
              className="p-2 flex flex-col gap-1"
              style={{
                position: 'fixed', ...position, zIndex: 1000, minWidth: 160,
                background: 'var(--surface-card)',
                borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-lg)',
              }}
            >
              {items.map((name) => (
                <span key={name} className="text-xs px-2 py-1" style={{ color: 'var(--text-secondary)' }}>{name}</span>
              ))}
            </div>,
            document.body,
          )}
        </>
      )}
    </div>
  )
}
